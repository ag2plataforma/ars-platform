import { Module } from '@nestjs/common';
import { StateMachineModule, STATE_RULE_REPOSITORY } from '@ars-platform/shared-common';
import { PrismaStateRuleRepository } from '@ars-platform/database';
import { StateMachineTestController } from './state-machine-test.controller';

/**
 * Conecta el StateMachineService genérico (shared-common) con la
 * implementación real contra Postgres (database). Este mismo patrón de
 * `forRoot(...)` es el que se repite en cada servicio que necesite la
 * máquina de estados — no hay que reescribir la lógica, solo importar
 * y bindear.
 */
const stateMachine = StateMachineModule.forRoot({
  provide: STATE_RULE_REPOSITORY,
  useClass: PrismaStateRuleRepository,
});

@Module({
  imports: [stateMachine],
  controllers: [StateMachineTestController],
  exports: [stateMachine],
})
export class IamStateMachineModule {}
