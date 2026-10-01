import { Module } from '@nestjs/common';
import { StateMachineModule, STATE_RULE_REPOSITORY } from '@ars-platform/shared-common';
import { PrismaStateRuleRepository } from '@ars-platform/database';

/**
 * Mismo patrón `forRoot(...)` que el resto de los servicios (ver
 * `UnderwritingStateMachineModule`). `StateMachineService` lo usan
 * `TemplatesService` (estado "Activo" al crear una plantilla) y
 * `GenerationService` (estado "Activo" al guardar un documento generado).
 */
const stateMachine = StateMachineModule.forRoot({
  provide: STATE_RULE_REPOSITORY,
  useClass: PrismaStateRuleRepository,
});

@Module({
  imports: [stateMachine],
  exports: [stateMachine],
})
export class DocumentsStateMachineModule {}
