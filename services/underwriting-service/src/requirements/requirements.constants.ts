/**
 * `CodProcess` reales de la base sembrada que distinguen "Cotización" de
 * "Contratación" (confirmados directamente con el usuario 2026-09-24 --
 * no hay ninguna constante commiteada en el repo para esto, ver el
 * doc-comment de `RequirementsService`; la base real también tiene
 * SUPLEMENTO/ANULACION/RENOVACION/GENERICO, que no se usan acá).
 *
 * Mismo criterio que `STEP_CODE_CUSTOM_ATTRIBUTES`/`STEP_CODE_SOCIAL_IMPACT`
 * en `@ars-platform/shared-common`: código reservado hardcodeado porque
 * no hay alternativa razonable (el admin elige el proceso en la
 * pantalla de `SProductRequirement` con un selector de `SProcess`, pero
 * el motor de resolución necesita saber cuál es cuál para decidir en
 * qué momento del ciclo de vida -- cotizar vs. contratar -- resolver
 * cada fila).
 */
export const PROCESS_CODE_QUOTE = 'COTIZACION';
export const PROCESS_CODE_CONTRACT = 'CONTRATACION';
