import { Module } from '@nestjs/common';
import {
  RulesEngineModule,
  CALCULATION_RULE_REPOSITORY,
  ATTRIBUTE_VALUE_RESOLVER,
  RULE_VALUE_RESOLVER,
  RATE_VALUE_RESOLVER,
} from '@ars-platform/shared-common';
import {
  PrismaCalculationRuleRepository,
  PrismaAttributeValueResolver,
  PrismaRuleValueResolver,
  PrismaRateValueResolver,
} from '@ars-platform/database';

/**
 * Mismo patrón `forRoot(...)` que `ProductRatingRulesEngineModule` (ver
 * ese módulo). A diferencia de aquel, este módulo NO expone un
 * controller de prueba propio -- `RulesEngineService` se usa acá
 * directamente dentro de `QuotesService` para el cálculo real de una
 * cotización (equivalente a `FQuoteCoverageConcept`), no como endpoint
 * de prueba aislado.
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
});

@Module({
  imports: [rulesEngine],
  exports: [rulesEngine],
})
export class UnderwritingRulesEngineModule {}
