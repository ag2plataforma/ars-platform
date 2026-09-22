import { Module } from '@nestjs/common';
import { SocialImpactModule, SOCIAL_IMPACT_CONFIG_RESOLVER } from '@ars-platform/shared-common';
import { PrismaSocialImpactConfigResolver } from '@ars-platform/database';

/**
 * Mismo patrón `forRoot(...)` que `UnderwritingStateMachineModule`/
 * `UnderwritingRulesEngineModule` (ver esos archivos). `SocialImpactCalculatorService`
 * lo usa `QuotesService.buildPricingResult` para exponer, de forma
 * puramente informativa, si el producto de la cotización participa de
 * Impacto Social (Fase 3, ver docs/02-roadmap.md) -- sin acoplar el
 * cálculo base de la cotización a esto.
 *
 * Decisión explícita del usuario (2026-09-22): consulta EN PROCESO
 * (`PrismaSocialImpactConfigResolver` lee `SSocialImpactConfig`
 * directamente), no una llamada HTTP real a `social-impact-service` --
 * ver el pendiente documentado en el roadmap para cuando se reemplace
 * esto por una llamada real entre servicios.
 */
const socialImpact = SocialImpactModule.forRoot({
  provide: SOCIAL_IMPACT_CONFIG_RESOLVER,
  useClass: PrismaSocialImpactConfigResolver,
});

@Module({
  imports: [socialImpact],
  exports: [socialImpact],
})
export class UnderwritingSocialImpactModule {}
