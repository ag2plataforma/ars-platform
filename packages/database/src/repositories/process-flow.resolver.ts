import { Injectable } from '@nestjs/common';
import { ProcessFlowResolver, ProductStepsQuery, ProductStepsResolution } from '@ars-platform/shared-common';
import { PrismaService } from '../prisma.service';

/**
 * Implementación real de `ProcessFlowResolver` (ver el doc-comment de la
 * interfaz en `@ars-platform/shared-common` para el alcance y el
 * comportamiento por defecto seguro). Consumida EN PROCESO por
 * `reference-data-service` (endpoint `resolve-steps`, para la pantalla de
 * administración) y por `underwriting-service` (`QuotesService`, para
 * decidir si Impacto Social aplica).
 *
 * Regla de especificidad para elegir entre varios `SProductProcessFlow`
 * candidatos (decisión explícita del usuario, 23/09/2026: "más específica
 * gana") -- mismo espíritu que el comodín `NULL` de `SCalculationRule`
 * (`PrismaCalculationRuleRepository.findApplicableRules`, ver ese
 * archivo), pero ahí se combinan TODAS las reglas aplicables; acá hay que
 * elegir UNA sola fila (no tiene sentido "aplicar dos flujos a la vez"),
 * así que en vez de solo filtrar, se puntúa: `IdeRiskProduct`/
 * `IdeDistributionWay` no nulos y coincidentes suman 1 punto cada uno, y
 * se toma la fila de mayor puntaje (empate: la primera, no debería
 * ocurrir con datos bien configurados -- ver el índice único de la
 * tabla).
 */
@Injectable()
export class PrismaProcessFlowResolver implements ProcessFlowResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveActiveSteps(query: ProductStepsQuery): Promise<ProductStepsResolution> {
    const riskProductCondition = query.ideRiskProduct
      ? { OR: [{ IdeRiskProduct: query.ideRiskProduct }, { IdeRiskProduct: null }] }
      : { IdeRiskProduct: null };
    const distributionWayCondition = query.ideDistributionWay
      ? { OR: [{ IdeDistributionWay: query.ideDistributionWay }, { IdeDistributionWay: null }] }
      : { IdeDistributionWay: null };

    const candidates = await this.prisma.sProductProcessFlow.findMany({
      where: {
        IdeProduct: query.ideProduct,
        IdeDistributionChannel: query.ideDistributionChannel,
        SState: { CodState: 'ACTIVO' },
        AND: [riskProductCondition, distributionWayCondition],
      },
    });

    if (candidates.length === 0) {
      return { ideProcessFlow: null, activeSteps: [] };
    }

    const specificity = (row: (typeof candidates)[number]): number =>
      (row.IdeRiskProduct ? 1 : 0) + (row.IdeDistributionWay ? 1 : 0);
    const best = candidates.reduce((a, b) => (specificity(b) > specificity(a) ? b : a));

    const flowSteps = await this.prisma.sFlowStep.findMany({
      where: { IdeProcessFlow: best.IdeProcessFlow, SState: { CodState: 'ACTIVO' } },
      include: {
        SStep_SFlowStep_IdeStepCurrentToSStep: { select: { CodStep: true } },
        SStep_SFlowStep_IdeStepForwardToSStep: { select: { CodStep: true } },
      },
    });

    const codes = new Set<string>();
    for (const flowStep of flowSteps) {
      codes.add(flowStep.SStep_SFlowStep_IdeStepCurrentToSStep.CodStep);
      codes.add(flowStep.SStep_SFlowStep_IdeStepForwardToSStep.CodStep);
    }

    return { ideProcessFlow: best.IdeProcessFlow, activeSteps: [...codes].sort() };
  }
}
