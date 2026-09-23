import { Module } from '@nestjs/common';
import {
  RulesEngineModule,
  CALCULATION_RULE_REPOSITORY,
  ATTRIBUTE_VALUE_RESOLVER,
  RULE_VALUE_RESOLVER,
  RATE_VALUE_RESOLVER,
  ADJUSTMENT_VALUE_RESOLVER,
} from '@ars-platform/shared-common';
import {
  PrismaCalculationRuleRepository,
  PrismaAttributeValueResolver,
  PrismaRuleValueResolver,
  PrismaRateValueResolver,
  PrismaAdjustmentValueResolver,
} from '@ars-platform/database';

/**
 * Mismo patrón `forRoot(...)` que `ProductRatingRulesEngineModule` (ver
 * ese módulo). A diferencia de aquel, este módulo NO expone un
 * controller de prueba propio -- `RulesEngineService` se usa acá
 * directamente dentro de `QuotesService`/`ContractsService` para el
 * cálculo real de una cotización/contrato (equivalente a
 * `FQuoteCoverageConcept`/`FMovementConcept`), no como endpoint de
 * prueba aislado.
 *
 * Incluye el quinto puerto `ADJUSTMENT_VALUE_RESOLVER` (Fase 3, motor
 * genérico de recargos/descuentos -- ver docs/02-roadmap.md y el
 * doc-comment de `AdjustmentValueResolver` en shared-common): permite
 * que una fórmula de `SCalculationRule` referencie `adjustment('COD')`
 * para leer un ajuste porcentual ya calculado por otra feature (hoy,
 * Impacto Social) sin que ningún servicio de cotización/contrato tenga
 * que conocer esa feature.
 */
const rulesEngine = RulesEngineModule.forRoot({
  calculationRuleRepositoryProvider: {
    provide: CALCULATION_RULE_REPOSITORY,
    useClass: PrismaCalculationRuleRepository,
  },
  attributeValueResolverProvider: {
    provide: ATTRIBUTE_VALUE_RESOLVER,
    useClass: PrismaAttributeValueResolver,
  },
  ruleValueResolverProvider: {
    provide: RULE_VALUE_RESOLVER,
    useClass: PrismaRuleValueResolver,
  },
  rateValueResolverProvider: {
    provide: RATE_VALUE_RESOLVER,
    useClass: PrismaRateValueResolver,
  },
  adjustmentValueResolverProvider: {
    provide: ADJUSTMENT_VALUE_RESOLVER,
    useClass: PrismaAdjustmentValueResolver,
  },
});

@Module({
  imports: [rulesEngine],
  exports: [rulesEngine],
})
export class UnderwritingRulesEngineModule {}
