import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaService } from '@ars-platform/database';

export interface CollectiveTier {
  numFrom: number;
  numTo: number | null;
  amtPerInsured: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Tipos de concepto que dependen de la prima (mismo criterio que los suplementos de monto asegurado). */
const SCALABLE_CONCEPT_TYPES = ['CALCPRIMA', 'CALCCOMISION', 'CALCIMPUESTO'];

/**
 * Colectivos, prima ÚNICA con tarifa por tramos (etapa 2c). La tarifa de un tramo es la prima
 * total ANUAL de cada asegurado (`SProductCollectiveTier.AmtPerInsured`): se busca el tramo donde
 * cae el nº de asegurados y TODOS pagan esa tarifa; la prima del colectivo es nº x tarifa.
 *
 * Implementación: el motor de reglas calcula la prima de cada certificado como siempre
 * (prima neta, impuestos, comisión...) y luego se ESCALA proporcionalmente toda la cascada de
 * conceptos para que la prima total del certificado sea igual a la tarifa del tramo. Así
 * impuestos, comisiones y prorrateos siguen funcionando sin tocar sus fórmulas. Consecuencias:
 * (1) la tarifa pisa cualquier ajuste del motor (p. ej. impacto social); (2) cuando cambia el
 * tramo, los certificados vigentes se re-escalan con un movimiento de suplemento (ver
 * `ContractsService.applyTierRateChange`).
 */
@Injectable()
export class UnicaTiersService {
  private readonly logger = new Logger(UnicaTiersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** ¿El producto es colectivo con prima ÚNICA? (SQL crudo; si falta el script, no.) */
  async isUnica(ideProduct: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<boolean> {
    try {
      const rows = await tx.$queryRaw<{ ok: boolean }[]>`
        SELECT ("IndCollective" AND "CodCollectivePremiumMode" = 'UNICA') AS ok
          FROM ars_platform."SProduct" WHERE "IdeProduct" = ${ideProduct}::uuid`;
      return rows[0]?.ok === true;
    } catch (err) {
      this.logger.warn(`No se pudo leer el modo de prima: ${(err as Error).message}`);
      return false;
    }
  }

  async listTiers(
    ideProduct: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<CollectiveTier[]> {
    try {
      const rows = await tx.$queryRaw<Array<{ NumFrom: number; NumTo: number | null; Amt: string }>>`
        SELECT "NumFrom", "NumTo", "AmtPerInsured"::text AS "Amt"
          FROM ars_platform."SProductCollectiveTier"
         WHERE "IdeProduct" = ${ideProduct}::uuid
         ORDER BY "NumFrom"`;
      return rows.map((r) => ({ numFrom: r.NumFrom, numTo: r.NumTo, amtPerInsured: Number(r.Amt) }));
    } catch (err) {
      this.logger.warn(`No se pudieron leer los tramos (¿falta correr setup-collective-tiers.js?): ${(err as Error).message}`);
      return [];
    }
  }

  /** Tramo aplicable a `count` asegurados; error claro si no hay tramos o ninguno lo cubre. */
  async resolveTier(
    ideProduct: string,
    count: number,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<CollectiveTier> {
    const tiers = await this.listTiers(ideProduct, tx);
    if (tiers.length === 0) {
      throw new ConflictException(
        'El producto colectivo con prima única no tiene tramos de tarifa configurados (Productos > Tramos de tarifa)',
      );
    }
    const tier = tiers.find((t) => count >= t.numFrom && (t.numTo === null || count <= t.numTo));
    if (!tier) {
      throw new ConflictException(
        `La tarifa por tramos no cubre ${count} asegurados (tramos configurados: ${tiers
          .map((t) => `${t.numFrom}-${t.numTo ?? '∞'}`)
          .join(', ')})`,
      );
    }
    return tier;
  }

  private scalableConceptWhere(): Prisma.SConceptWhereInput {
    return {
      OR: [{ CodConcept: 'PrimaTotal' }, { SConceptType: { CodConceptType: { in: SCALABLE_CONCEPT_TYPES } } }],
    };
  }

  /**
   * Cotización: escala las coberturas de cada plan de cada asegurado para que la suma de las
   * coberturas obligatorias (el plan base) sea igual a la tarifa del tramo. Las opcionales
   * escalan con el mismo factor.
   */
  async scaleQuote(ideQuote: string, rate: number): Promise<void> {
    const plans = await this.prisma.tQuoteRiskPlan.findMany({
      where: { TQuoteRisk: { IdeQuote: ideQuote } },
      include: {
        TQuoteCoverage: {
          include: {
            SCoveragePlan: { select: { IndMandatory: true } },
            TQuoteCoverageConcept: { include: { SConcept: { select: { CodConcept: true, SConceptType: { select: { CodConceptType: true } } } } } },
          },
        },
      },
    });
    const now = new Date();
    for (const plan of plans) {
      const base = round2(
        plan.TQuoteCoverage.filter((c) => c.SCoveragePlan.IndMandatory).reduce((sum, c) => sum + Number(c.Prime), 0),
      );
      if (base <= 0) {
        throw new ConflictException(
          'No se puede aplicar la tarifa por tramos: las reglas de cálculo dan prima 0 para el plan base de un asegurado',
        );
      }
      const factor = rate / base;
      for (const coverage of plan.TQuoteCoverage) {
        for (const concept of coverage.TQuoteCoverageConcept) {
          const scalable =
            concept.SConcept.CodConcept === 'PrimaTotal' ||
            SCALABLE_CONCEPT_TYPES.includes(concept.SConcept.SConceptType?.CodConceptType ?? '');
          if (!scalable) continue;
          await this.prisma.tQuoteCoverageConcept.update({
            where: { IdeQuoteCoverageConcept: concept.IdeQuoteCoverageConcept },
            data: { ConceptValue: Number(concept.ConceptValue) * factor, TstModification: now },
          });
        }
        await this.prisma.tQuoteCoverage.update({
          where: { IdeQuoteCoverage: coverage.IdeQuoteCoverage },
          data: { Prime: round2(Number(coverage.Prime) * factor), TstModification: now },
        });
      }
    }
  }

  /**
   * Contrato: escala los movimientos en borrador (`IdeContractOperation` nulo) de un certificado
   * para que su prima total bruta anual sea `rate`. Se llama después de calcular los conceptos y
   * (en alta/renovación) también sirve para los valores netos: la escala es lineal.
   */
  async scaleDraftFile(tx: Prisma.TransactionClient, ideContractFile: string, rate: number): Promise<void> {
    const movements = await tx.tCoverageMovement.findMany({
      where: { IdeContractOperation: null, TRiskCoverage: { TFileRisk: { IdeContractFile: ideContractFile } } },
      include: {
        TMovementConcept: {
          include: { SConcept: { select: { CodConcept: true, SConceptType: { select: { CodConceptType: true } } } } },
        },
      },
    });
    const primaTotalOf = (m: (typeof movements)[number]) =>
      m.TMovementConcept.filter((c) => c.SConcept.CodConcept === 'PrimaTotal').reduce((s, c) => s + Number(c.ConceptValue), 0);
    const base = movements.reduce((sum, m) => sum + primaTotalOf(m), 0);
    if (base <= 0) {
      throw new ConflictException(
        'No se puede aplicar la tarifa por tramos: las reglas de cálculo dan prima 0 para un certificado',
      );
    }
    const factor = rate / base;
    const now = new Date();
    for (const movement of movements) {
      for (const concept of movement.TMovementConcept) {
        const scalable =
          concept.SConcept.CodConcept === 'PrimaTotal' ||
          SCALABLE_CONCEPT_TYPES.includes(concept.SConcept.SConceptType?.CodConceptType ?? '');
        if (!scalable) continue;
        await tx.tMovementConcept.update({
          where: { IdeMovementConcept: concept.IdeMovementConcept },
          data: {
            ConceptValue: Number(concept.ConceptValue) * factor,
            ConceptNetValue: Number(concept.ConceptNetValue) * factor,
            TstModification: now,
          },
        });
      }
      await tx.tCoverageMovement.update({
        where: { IdeCoverageMovement: movement.IdeCoverageMovement },
        data: { Prime: round2(Number(movement.Prime) * factor), TstModification: now },
      });
      const gross = movement.TMovementConcept.find((c) => c.SConcept.CodConcept === 'PrimaTotal');
      if (gross) {
        await tx.tRiskCoverage.update({
          where: { IdeRiskCoverage: movement.IdeRiskCoverage },
          data: { Prime: round2(Number(gross.ConceptValue) * factor), TstModification: now },
        });
      }
    }
  }
}
