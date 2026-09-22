import { DynamicModule, Module, Provider } from '@nestjs/common';
import { SocialImpactCalculatorService } from './social-impact-calculator.service';

/**
 * Módulo consumible por cualquier servicio, mismo patrón `forRoot()` que
 * `StateMachineModule` (ver ese archivo para la explicación completa de
 * por qué tiene que ser así y no un `@Module` estático). Un solo puerto
 * (`SOCIAL_IMPACT_CONFIG_RESOLVER`), así que a diferencia de
 * `RulesEngineModule` (4 puertos) `forRoot()` toma el `Provider`
 * directo, sin envolverlo en un objeto. `shared-common` no depende de
 * Prisma -- el binding concreto lo provee el módulo del servicio
 * consumidor, normalmente usando `PrismaSocialImpactConfigResolver` de
 * `@ars-platform/database`.
 */
@Module({})
export class SocialImpactModule {
  static forRoot(configResolverProvider: Provider): DynamicModule {
    return {
      module: SocialImpactModule,
      providers: [SocialImpactCalculatorService, configResolverProvider],
      exports: [SocialImpactCalculatorService],
    };
  }
}
