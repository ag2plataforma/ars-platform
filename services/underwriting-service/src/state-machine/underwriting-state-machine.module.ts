import { Module } from '@nestjs/common';
import { StateMachineModule, STATE_RULE_REPOSITORY } from '@ars-platform/shared-common';
import { PrismaStateRuleRepository } from '@ars-platform/database';

/**
 * Mismo patrón `forRoot(...)` que `ReferenceDataStateMachineModule`/
 * `ProductRatingStateMachineModule` (ver esos archivos). `StateMachineService`
 * lo usa `QuotesService` para las transiciones de estado de la cotización
 * (equivalente a `FGetState('Initial'|'STATE', ...)` en `FQuote`/
 * `FQuoteRiskPlan`/`FQuoteCoverage`, ver docs/01-especificacion-motor-negocio-actual.md).
 */
const stateMachine = StateMachineModule.forRoot({
  provide: STATE_RULE_REPOSITORY,
  useClass: PrismaStateRuleRepository,
});

@Module({
  imports: [stateMachine],
  exports: [stateMachine],
})
export class UnderwritingStateMachineModule {}
