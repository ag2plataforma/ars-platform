import { DynamicModule, Module, Provider } from '@nestjs/common';
import { RulesEngineService } from './rules-engine.service';

export interface RulesEngineProviders {
  calculationRuleRepositoryProvider: Provider;
  attributeValueResolverProvider: Provider;
  ruleValueResolverProvider: Provider;
  rateValueResolverProvider: Provider;
  adjustmentValueResolverProvider: Provider;
}

/**
 * Módulo consumible por cualquier servicio, siguiendo exactamente el mismo
 * patrón que `StateMachineModule` (ver ese archivo para la explicación
 * completa de por qué tiene que ser `forRoot()` y no un `@Module` estático
 * con los providers en el módulo consumidor: Nest no resuelve providers
 * "hacia arriba", en un módulo que importa a este).
 *
 * shared-common no depende de Prisma — el binding concreto de los cinco
 * puertos (`CALCULATION_RULE_REPOSITORY`, `ATTRIBUTE_VALUE_RESOLVER`,
 * `RULE_VALUE_RESOLVER`, `RATE_VALUE_RESOLVER`, `ADJUSTMENT_VALUE_RESOLVER`
 * -- este último, Fase 3, motor genérico de recargos/descuentos, ver
 * docs/02-roadmap.md) lo provee el módulo del servicio consumidor,
 * normalmente usando las implementaciones reales de
 * `@ars-platform/database`.
 */
@Module({})
export class RulesEngineModule {
  static forRoot(providers: RulesEngineProviders): DynamicModule {
    return {
      module: RulesEngineModule,
      providers: [
        RulesEngineService,
        providers.calculationRuleRepositoryProvider,
        providers.attributeValueResolverProvider,
        providers.ruleValueResolverProvider,
        providers.rateValueResolverProvider,
        providers.adjustmentValueResolverProvider,
      ],
      exports: [RulesEngineService],
    };
  }
}
