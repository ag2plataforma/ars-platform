import { Module } from '@nestjs/common';
import { SocialImpactModule, SOCIAL_IMPACT_CONFIG_RESOLVER } from '@ars-platform/shared-common';
import { PrismaSocialImpactConfigResolver } from '@ars-platform/database';
import { SocialImpactHttpClient } from './social-impact-http.client';

/**
 * Mismo patrón `forRoot(...)` que `UnderwritingStateMachineModule`/
 * `UnderwritingRulesEngineModule` (ver esos archivos) para el puerto
 * `SOCIAL_IMPACT_CONFIG_RESOLVER` -- `QuotesService` lo usa para la
 * pregunta barata "¿el producto de esta cotización participa de Impacto
 * Social?" (Fase 3, ver docs/02-roadmap.md), resuelta EN PROCESO
 * (`PrismaSocialImpactConfigResolver` lee `SSocialImpactConfig`
 * directamente vía Prisma, sin llamada HTTP) -- decisión explícita del
 * usuario (2026-09-22), documentada también en el doc-comment de
 * `SocialImpactModule`.
 *
 * Etapa 2 (fórmulas reales): agrega `SocialImpactHttpClient`, que SÍ es
 * una llamada HTTP real -- `QuotesService.submitSocialImpactAnswers` lo
 * usa para pedirle a `social-impact-service` el cálculo real de
 * CFP/SIP/score/% de ajuste una vez que el producto participa y el
 * usuario llenó el formulario. Primer caso del proyecto de una llamada
 * directa servicio-a-servicio (todo lo demás comparte el mismo Postgres
 * y se resuelve EN PROCESO vía los puertos de `shared-common`).
 */
const socialImpactConfig = SocialImpactModule.forRoot({
  provide: SOCIAL_IMPACT_CONFIG_RESOLVER,
  useClass: PrismaSocialImpactConfigResolver,
});

@Module({
  imports: [socialImpactConfig],
  providers: [SocialImpactHttpClient],
  exports: [socialImpactConfig, SocialImpactHttpClient],
})
export class UnderwritingSocialImpactModule {}
