import { Injectable } from '@nestjs/common';
import { AdjustmentValueResolver, AppliedAdjustment, RuleOrigin } from '@ars-platform/shared-common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

/**
 * Implementacion real de AdjustmentValueResolver (Fase 3, motor generico
 * de recargos/descuentos -- ver docs/02-roadmap.md y el doc-comment de
 * la interfaz en shared-common). Resuelve el valor porcentual de un
 * "ajuste" nombrado (`codAdjustment`) ya calculado y persistido, para
 * que una formula de `SCalculationRule` lo use via `adjustment('COD')`.
 *
 * Primero resuelve `IdeQuote` a partir del riesgo de origen (mismo tipo
 * de resolucion que `PrismaAttributeValueResolver`, pero yendo un paso
 * mas alla porque el dato vive a nivel cotizacion, no a nivel riesgo):
 *  - origin='Quote': `ideOriginRisk` es `TQuoteRisk.IdeQuoteRisk` -> su
 *    columna `IdeQuote` directa.
 *  - origin='Contract': `ideOriginRisk` es `TFileRisk.IdeFileRisk` ->
 *    `TContractFile.IdeContract` -> `TContract.IdeQuote`. Un contrato
 *    siempre nace de una cotizacion (`TContract.IdeQuote` es NOT NULL),
 *    asi que esta cadena nunca es opcional una vez que existe el
 *    `TFileRisk`.
 *
 * Despues, segun `codAdjustment`, busca el valor ya calculado. Impacto
 * Social (`SOCIAL_IMPACT`) sigue siendo un `case` dedicado porque tiene
 * su propio calculo externo (`social-impact-service`) y su propia tabla
 * (`TQuoteSocialImpactAnswer.PctPrimaAdjustment`). Cualquier OTRO
 * `codAdjustment` (Fase 2 backlog item 7, ver docs/02-roadmap.md) cae en
 * el `default` y se resuelve contra el catalogo GENERICO
 * `SAdjustment`/`TQuoteAdjustment` -- un admin lo da de alta desde la
 * pantalla "Recargos y descuentos" sin que este resolver necesite un
 * `case` nuevo por cada uno.
 *
 * Igual que el resto de los resolvers del motor: sin dato (cotizacion
 * sin ese paso contestado, o `codAdjustment` desconocido), devuelve `0`
 * en silencio -- "ajuste no calculado todavia = no aporta al calculo".
 *
 * `dbTransaction` (opcional, opaco en la interfaz de `shared-common`):
 * mismo motivo que en `PrismaAttributeValueResolver`/
 * `PrismaRuleValueResolver` (ver esos archivos) -- necesario para
 * `origin: 'Contract'` cuando el dato a leer fue escrito por la misma
 * transaccion activa todavia sin commit.
 */
@Injectable()
export class PrismaAdjustmentValueResolver implements AdjustmentValueResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveAdjustmentValue(
    origin: RuleOrigin,
    ideOriginRisk: string,
    codAdjustment: string,
    dbTransaction?: unknown,
  ): Promise<number> {
    const db = (dbTransaction as Prisma.TransactionClient | undefined) ?? this.prisma;

    const ideQuote = await this.resolveIdeQuote(origin, ideOriginRisk, db);
    if (!ideQuote) {
      return 0;
    }

    switch (codAdjustment) {
      case 'SOCIAL_IMPACT': {
        const answer = await db.tQuoteSocialImpactAnswer.findUnique({
          where: { IdeQuote: ideQuote },
          select: { PctPrimaAdjustment: true },
        });
        return answer ? Number(answer.PctPrimaAdjustment) : 0;
      }
      default: {
        // Fase 2 backlog ítem 7 (ver docs/02-roadmap.md): cualquier
        // `codAdjustment` sin `case` dedicado se resuelve contra el
        // catálogo genérico `SAdjustment`/`TQuoteAdjustment` -- un admin
        // lo da de alta desde la pantalla "Recargos y descuentos"
        // (product-rating-service/AdjustmentsService) sin que este
        // resolver necesite un `case` nuevo por cada uno. `0` si el
        // código no existe en ningún lado (desconocido) o no está
        // aplicado a esta cotización.
        const applied = await db.tQuoteAdjustment.findFirst({
          where: { IdeQuote: ideQuote, SAdjustment: { CodAdjustment: codAdjustment } },
          select: { SAdjustment: { select: { PctAdjustment: true } } },
        });
        return applied ? Number(applied.SAdjustment.PctAdjustment) : 0;
      }
    }
  }

  private async resolveIdeQuote(
    origin: RuleOrigin,
    ideOriginRisk: string,
    db: Prisma.TransactionClient,
  ): Promise<string | null> {
    if (origin === 'Quote') {
      const quoteRisk = await db.tQuoteRisk.findUnique({
        where: { IdeQuoteRisk: ideOriginRisk },
        select: { IdeQuote: true },
      });
      return quoteRisk?.IdeQuote ?? null;
    }

    const fileRisk = await db.tFileRisk.findUnique({
      where: { IdeFileRisk: ideOriginRisk },
      select: { TContractFile: { select: { TContract: { select: { IdeQuote: true } } } } },
    });
    return fileRisk?.TContractFile.TContract.IdeQuote ?? null;
  }

  /**
   * A diferencia de `resolveAdjustmentValue`, acá `IdeQuote` ya viene
   * directo (no hace falta resolverlo desde un riesgo) -- el llamador
   * típico es una pantalla de resumen, no una fórmula en evaluación.
   * Recorre cada `codAdjustment` conocido y agrega el que tenga dato;
   * mismo criterio de "un case por feature" que `resolveAdjustmentValue`.
   */
  async listAppliedAdjustments(ideQuote: string, dbTransaction?: unknown): Promise<AppliedAdjustment[]> {
    const db = (dbTransaction as Prisma.TransactionClient | undefined) ?? this.prisma;

    const applied: AppliedAdjustment[] = [];

    const socialImpactAnswer = await db.tQuoteSocialImpactAnswer.findUnique({
      where: { IdeQuote: ideQuote },
      select: { PctPrimaAdjustment: true },
    });
    if (socialImpactAnswer) {
      applied.push({
        codAdjustment: 'SOCIAL_IMPACT',
        pctPrimaAdjustment: Number(socialImpactAnswer.PctPrimaAdjustment),
      });
    }

    // Fase 2 backlog ítem 7: ajustes genéricos aplicados a esta
    // cotización (`TQuoteAdjustment`), ver doc-comment de
    // `resolveAdjustmentValue` más arriba.
    const genericAdjustments = await db.tQuoteAdjustment.findMany({
      where: { IdeQuote: ideQuote },
      select: { SAdjustment: { select: { CodAdjustment: true, DesAdjustment: true, PctAdjustment: true } } },
    });
    for (const row of genericAdjustments) {
      applied.push({
        codAdjustment: row.SAdjustment.CodAdjustment,
        desAdjustment: row.SAdjustment.DesAdjustment,
        pctPrimaAdjustment: Number(row.SAdjustment.PctAdjustment),
      });
    }

    return applied;
  }
}
