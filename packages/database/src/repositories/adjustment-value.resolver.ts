import { Injectable } from '@nestjs/common';
import { AdjustmentValueResolver, RuleOrigin } from '@ars-platform/shared-common';
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
 * Despues, segun `codAdjustment`, busca el valor ya calculado en la
 * tabla de dominio de esa feature -- hoy solo existe Impacto Social
 * (`SOCIAL_IMPACT` -> `TQuoteSocialImpactAnswer.PctPrimaAdjustment`).
 * Una feature futura de recargos/descuentos se agrega como un nuevo
 * `case`, sin tocar el motor de reglas ni los servicios de
 * cotizacion/contrato -- ver el doc-comment de la interfaz para el por
 * que de este diseño.
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
      default:
        return 0;
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
}
