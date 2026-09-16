import { DynamicModule, Module, Provider } from '@nestjs/common';
import { StateMachineService } from './state-machine.service';

/**
 * Módulo consumible por cualquier servicio. El binding concreto de
 * STATE_RULE_REPOSITORY (contra Postgres) lo provee el módulo del
 * servicio que lo use, pasándolo a `forRoot()` — shared-common no
 * depende de un ORM.
 *
 * Debe registrarse así (y no como un `@Module` estático con solo
 * `imports: [StateMachineModule]` + un provider aparte en el módulo
 * consumidor) porque Nest resuelve las dependencias de un provider
 * dentro de su propio módulo o de los módulos que ese módulo importa —
 * nunca "hacia arriba", en un módulo que lo importa a él. Por eso el
 * binding de STATE_RULE_REPOSITORY tiene que terminar en el mismo
 * módulo que declara StateMachineService, y `forRoot()` es lo que lo
 * logra.
 */
@Module({})
export class StateMachineModule {
  static forRoot(repositoryProvider: Provider): DynamicModule {
    return {
      module: StateMachineModule,
      providers: [StateMachineService, repositoryProvider],
      exports: [StateMachineService],
    };
  }
}
