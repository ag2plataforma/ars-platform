import { Module } from '@nestjs/common';
import { StateMachineModule, STATE_RULE_REPOSITORY } from '@ars-platform/shared-common';
import { PrismaStateRuleRepository } from '@ars-platform/database';

/**
 * Mismo patrón de `forRoot(...)` que `iam-state-machine.module.ts` — ver
 * ese archivo para el porqué (Nest resuelve dependencias de un provider
 * dentro de su propio módulo, nunca "hacia arriba").
 *
 * A diferencia de `IamStateMachineModule`, este módulo NO registra un
 * controller de prueba: `/state-machine/*` ya existe en `iam-service`
 * (mismas tablas `SEntity`/`SStateRule`/`SState`, no hace falta
 * duplicar los endpoints de humo aquí). `StateMachineService` se usa
 * aquí solo como dependencia interna de los servicios de catálogo
 * (`RiskLevelsService.setState`, etc.).
 */
const stateMachine = StateMachineModule.forRoot({
  provide: STATE_RULE_REPOSITORY,
  useClass: PrismaStateRuleRepository,
});

@Module({
  imports: [stateMachine],
  exports: [stateMachine],
})
export class ProductRatingStateMachineModule {}
