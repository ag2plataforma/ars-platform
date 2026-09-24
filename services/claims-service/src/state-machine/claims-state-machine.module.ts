import { Module } from '@nestjs/common';
import { StateMachineModule, STATE_RULE_REPOSITORY } from '@ars-platform/shared-common';
import { PrismaStateRuleRepository } from '@ars-platform/database';

/**
 * Copia exacta del patrón de `UnderwritingStateMachineModule` (mismo
 * `StateMachineModule.forRoot` con `PrismaStateRuleRepository`) --
 * Fase 4 (Siniestros), Etapa 1, 2026-09-24. Ver el doc-comment de
 * `ClaimsService`/`ClaimRequirementsService` para el diseño completo.
 */
const stateMachine = StateMachineModule.forRoot({
  provide: STATE_RULE_REPOSITORY,
  useClass: PrismaStateRuleRepository,
});

@Module({
  imports: [stateMachine],
  exports: [stateMachine],
})
export class ClaimsStateMachineModule {}
