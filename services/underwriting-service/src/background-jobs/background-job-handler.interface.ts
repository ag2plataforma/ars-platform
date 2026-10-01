/**
 * Contrato que debe implementar cualquier feature que quiera correr como
 * "trabajo en segundo plano" administrable desde la pantalla genérica
 * "Trabajos Programados" (ver docs/02-roadmap.md) -- pedido explícito
 * del usuario (2026-10-01): la pantalla/infraestructura de jobs no debe
 * ser específica de renovaciones, debe servir para cualquier proceso
 * futuro sin tocar este módulo.
 *
 * Cada handler se auto-registra contra `BackgroundJobsService` desde su
 * propio `onModuleInit` (ver `RenewalBatchJobHandler` para el primer
 * caso real) -- agregar un job nuevo no requiere tocar
 * `BackgroundJobsModule` ni ningún otro archivo de esta carpeta, solo
 * crear el handler e importar `BackgroundJobsModule` en el módulo de la
 * feature.
 */
export interface BackgroundJobRunResult {
  numSucceeded: number;
  numFailed: number;
  numSkipped: number;
  /** Resumen legible opcional para el historial (ej. "14 contratos
   *  vencidos encontrados: 10 renovados, 3 saltados por 'No renovar',
   *  1 falló"). */
  desDetail?: string;
}

export interface BackgroundJobHandler {
  /** Código único y estable del job (ej. "RENOVACION_AUTOMATICA") --
   *  nunca cambiar una vez en producción, es la clave de `SBackgroundJob`. */
  readonly codJob: string;
  /** Nombre legible para mostrar en la pantalla de administración. */
  readonly desJob: string;
  /** Ejecuta UNA corrida completa del job. `actor` es quién la disparó
   *  ("cron-job" si fue automática, el código del operador si fue
   *  manual vía "Ejecutar ahora"). No debe lanzar por el error de UN
   *  ítem puntual dentro del lote (eso cuenta en `numFailed`) -- solo
   *  debe lanzar si el job completo no pudo ni empezar. */
  run(actor: string): Promise<BackgroundJobRunResult>;
}
