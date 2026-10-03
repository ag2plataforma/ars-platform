import type { QueuedTask } from '@ars-platform/database';

/**
 * Error que NO tiene sentido reintentar solo (plantilla sin configurar,
 * contrato inexistente, titular sin email...): la tarea pasa directo a
 * FALLIDA con este mensaje, y el operador puede reintentarla a mano
 * ("Reintentar") cuando arregle la causa.
 */
export class PermanentTaskError extends Error {}

export interface TaskContext {
  /** Guarda progreso parcial en `DesResult` (sobrevive a un reintento). */
  saveProgress(progress: Record<string, unknown>): Promise<void>;
}

/**
 * Un handler por `CodTaskType`. `handle` devuelve el resultado que se
 * guarda en `DesResult` al completar; si lanza, el worker decide entre
 * reintento y falla definitiva (ver `TaskWorkerService`).
 */
export interface TaskHandler {
  readonly codTaskType: string;
  handle(task: QueuedTask, ctx: TaskContext): Promise<Record<string, unknown> | void>;
}

export const TASK_HANDLERS = 'TASK_HANDLERS';
