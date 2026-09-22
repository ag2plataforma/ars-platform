import { Inject, Injectable } from '@nestjs/common';
import {
  SOCIAL_IMPACT_CONFIG_RESOLVER,
  SocialImpactConfigResolver,
} from './social-impact-config.interface';

/** Resultado expuesto al consumidor (hoy solo `underwriting-service`, ver
 *  `QuotesService.buildPricingResult`). `active: false` es el caso normal
 *  para la inmensa mayoría de productos -- no participan de Impacto Social. */
export interface SocialImpactAdjustment {
  active: true;
  /** PLACEHOLDER de Etapa 1 -- ver el doc-comment de esta clase. */
  pctPrimaAdjustment: number;
}

export type SocialImpactResult = SocialImpactAdjustment | { active: false };

/**
 * Cálculo de Impacto Social (Fase 3, ver docs/02-roadmap.md) -- SIP
 * (puntos de impacto social), CFP (huella de carbono) y SP
 * (sostenibilidad), y el ajuste dinámico de prima resultante.
 *
 * ETAPA 1 (andamiaje): NO existen todavía las fórmulas de negocio reales
 * de SIP/CFP/SP (decisión explícita del usuario, 2026-09-22, para no
 * bloquear el trabajo técnico mientras se definen) -- este servicio hoy
 * solo resuelve si el producto participa (`SocialImpactConfigResolver`)
 * y devuelve el `pctPrimaAdjustment` placeholder guardado en
 * `SSocialImpactConfig.ConfigJSON`, tal cual, sin aplicarlo todavía a
 * ningún total de prima real (`QuotesService.buildPricingResult` lo
 * expone como información adicional de solo lectura, sin tocar el
 * cálculo base -- ver el comentario ahí). Cuando se definan las fórmulas
 * reales, este es el único lugar que hay que cambiar.
 */
@Injectable()
export class SocialImpactCalculatorService {
  constructor(
    @Inject(SOCIAL_IMPACT_CONFIG_RESOLVER)
    private readonly configResolver: SocialImpactConfigResolver,
  ) {}

  async calculateAdjustment(ideProduct: string): Promise<SocialImpactResult> {
    const config = await this.configResolver.resolveActiveConfig(ideProduct);
    if (!config) {
      return { active: false };
    }

    const pctPrimaAdjustment = Number(config.configJSON.pctPrimaAdjustment ?? 0);
    return { active: true, pctPrimaAdjustment };
  }
}
