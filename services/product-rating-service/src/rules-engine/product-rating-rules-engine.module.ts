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
import { RulesEngineTestController } from './rules-engine-test.controller';

/**
 * Conecta el RulesEngineService genérico (shared-common) con las
 * implementaciones reales contra Postgres (database) — mismo patrón
 * `forRoot(...)` que `IamStateMachineModule` en iam-service.
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
  controllers: [RulesEngineTestController],
  exports: [rulesEngine],
})
export class ProductRatingRulesEngineModule {}
