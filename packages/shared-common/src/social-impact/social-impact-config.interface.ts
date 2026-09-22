/**
 * Contratos (puerto) de la configuración de Impacto Social por producto
 * (Fase 3, ver docs/02-roadmap.md). Mismo patrón que
 * `CalculationRuleRepository`/`AttributeValueResolver` en el motor de
 * reglas: `shared-common` no depende de Prisma, cada servicio conecta la
 * implementación real (contra Postgres, en `@ars-platform/database`) vía
 * `SocialImpactModule.forRoot(...)`.
 *
 * Es NUEVO por completo -- no hay ninguna función PL/pgSQL ni tabla
 * legada que replicar acá (confirmado: ninguna de las 130 tablas
 * introspectadas originalmente tiene rastro de "impacto social"/SIP/CFP/SP).
 *
 * Decisión explícita del usuario (2026-09-22): por ahora esto se resuelve
 * EN PROCESO (`PrismaSocialImpactConfigResolver` lee `SSocialImpactConfig`
 * directamente vía Prisma), no con una llamada HTTP real a
 * `social-impact-service` -- ver el pendiente documentado en el roadmap
 * para cuando se reemplace esto por una llamada real entre servicios.
 */

/** Fila de `SSocialImpactConfig` para un producto activo. `configJSON` es
 *  el placeholder de Etapa 1 -- hoy solo trae `pctPrimaAdjustment`, hasta
 *  que se definan las fórmulas reales de SIP (puntos de impacto social),
 *  CFP (huella de carbono) y SP (sostenibilidad). */
export interface SocialImpactConfig {
  ideSocialImpactConfig: string;
  ideProduct: string;
  /** Placeholder de Etapa 1: `{ pctPrimaAdjustment: number }` (porcentaje
   *  aplicado sobre la prima, positivo = recargo, negativo = descuento).
   *  Forma libre a propósito (JSON), para no tener que migrar la tabla
   *  cuando se agreguen los parámetros reales de SIP/CFP/SP. */
  configJSON: Record<string, unknown>;
}

/**
 * Puerto de acceso a `SSocialImpactConfig`. Implementación real:
 * `PrismaSocialImpactConfigResolver` en `@ars-platform/database`.
 */
export interface SocialImpactConfigResolver {
  /** Configuración activa para el producto, o `null` si el producto no
   *  participa de Impacto Social (no tiene fila, o la tiene en estado
   *  Inactivo) -- el caso normal para la inmensa mayoría de productos. */
  resolveActiveConfig(ideProduct: string): Promise<SocialImpactConfig | null>;
}

export const SOCIAL_IMPACT_CONFIG_RESOLVER = Symbol('SOCIAL_IMPACT_CONFIG_RESOLVER');
