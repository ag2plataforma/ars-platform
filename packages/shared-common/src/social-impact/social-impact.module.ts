import { DynamicModule, Module, Provider } from '@nestjs/common';
import { SOCIAL_IMPACT_CONFIG_RESOLVER } from './social-impact-config.interface';

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
 *
 * Etapa 2 (fórmulas reales, ver docs/02-roadmap.md): este módulo ya NO
 * expone un calculador propio -- `SocialImpactCalculatorService`
 * (Etapa 1, placeholder de `pctPrimaAdjustment` fijo) fue retirado. Hoy
 * solo resuelve el puerto `SOCIAL_IMPACT_CONFIG_RESOLVER`, que
 * `underwriting-service` usa exclusivamente para la pregunta barata "¿el
 * producto de esta cotización participa de Impacto Social?" (EN
 * PROCESO, vía Prisma, sin llamada HTTP -- eso no cambió). El cálculo
 * real (CFP/SIP/score/% de ajuste) ahora lo hace `social-impact-service`
 * vía una llamada HTTP real (`SocialImpactHttpClient`, en
 * `underwriting-service`), y el resultado se persiste en
 * `TQuoteSocialImpactAnswer` -- ver `QuotesService`.
 */
@Module({})
export class SocialImpactModule {
  static forRoot(configResolverProvider: Provider): DynamicModule {
    return {
      module: SocialImpactModule,
      providers: [configResolverProvider],
      exports: [SOCIAL_IMPACT_CONFIG_RESOLVER],
    };
  }
}
