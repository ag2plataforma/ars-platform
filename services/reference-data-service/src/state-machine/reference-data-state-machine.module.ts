import { Module } from '@nestjs/common';
import { StateMachineModule, STATE_RULE_REPOSITORY } from '@ars-platform/shared-common';
import { PrismaStateRuleRepository } from '@ars-platform/database';

/**
 * Mismo patrón `forRoot(...)` que `ProductRatingStateMachineModule` (ver
 * ese archivo, y `IamStateMachineModule`, para el porqué). `StateMachineService`
 * se usa aquí solo como dependencia interna de `FieldDictionaryService`/
 * `FieldValuesService` (su `setState`) -- no se expone un controller de
 * prueba propio, `/state-machine/*` ya existe en `iam-service`.
 */
const stateMachine = StateMachineModule.forRoot({
  provide: STATE_RULE_REPOSITORY,
  useClass: PrismaStateRuleRepository,
});

@Module({
  imports: [stateMachine],
  exports: [stateMachine],
})
export class ReferenceDataStateMachineModule {}
