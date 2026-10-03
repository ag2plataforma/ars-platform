import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { QueuedTask, TaskQueueRepository } from '@ars-platform/database';
import { PermanentTaskError, TASK_HANDLERS, TaskHandler } from './task-handler';

const POLL_MS = Number(process.env.TASK_WORKER_POLL_MS ?? 5_000);
const STALE_AFTER_MINUTES = 10;
const RECOVER_EVERY_MS = 60_000;
const BASE_BACKOFF_SECONDS = 30;
const MAX_BACKOFF_SECONDS = 30 * 60;

/**
 * Worker de la cola de tareas (`TBackgroundTask`): cada `POLL_MS` toma
 * tareas listas UNA A UNA (la conversión a PDF con LibreOffice es pesada,
 * no se paraleliza) y las despacha al handler de su `CodTaskType`.
 *
 *  - Éxito -> COMPLETADA (con el resultado del handler).
 *  - Error permanente (`PermanentTaskError`, o 404/400/409 del dominio:
 *    contrato/plantilla inexistente, datos inválidos) -> FALLIDA directo.
 *  - Cualquier otro error (LibreOffice caído, Brevo con falla, base
 *    momentáneamente inaccesible) -> reintento con espera exponencial
 *    (30s, 1m, 2m, 4m... tope 30 min) hasta `NumMaxAttempts`, luego FALLIDA.
 *  - Tareas EN_PROCESO abandonadas (el proceso murió) se recuperan solas.
 *
 * Se puede apagar con `TASK_WORKER_ENABLED=false` (ej. una segunda
 * instancia del servicio que solo atiende HTTP).
 */
@Injectable()
export class TaskWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskWorkerService.name);
  private readonly handlers = new Map<string, TaskHandler>();
  private pollTimer?: NodeJS.Timeout;
  private recoverTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly queue: TaskQueueRepository,
    @Inject(TASK_HANDLERS) handlers: TaskHandler[],
  ) {
    for (const h of handlers) this.handlers.set(h.codTaskType, h);
  }

  onModuleInit() {
    if (process.env.TASK_WORKER_ENABLED === 'false') {
      this.logger.warn('Worker de la cola DESACTIVADO (TASK_WORKER_ENABLED=false)');
      return;
    }
    this.pollTimer = setInterval(() => void this.tick(), POLL_MS);
    this.recoverTimer = setInterval(() => void this.recover(), RECOVER_EVERY_MS);
    void this.recover();
    this.logger.log(`Worker de la cola iniciado (cada ${POLL_MS} ms, handlers: ${[...this.handlers.keys()].join(', ')})`);
  }

  onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.recoverTimer) clearInterval(this.recoverTimer);
  }

  private async recover() {
    try {
      const n = await this.queue.recoverStale(STALE_AFTER_MINUTES);
      if (n > 0) this.logger.warn(`${n} tarea(s) abandonada(s) devuelta(s) a PENDIENTE`);
    } catch (err) {
      this.logger.error(`No se pudo recuperar tareas abandonadas: ${(err as Error).message}`);
    }
  }

  /** Drena todo lo que esté listo; el flag evita ticks solapados. */
  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const task = await this.queue.claimNext();
        if (!task) break;
        await this.process(task);
      }
    } catch (err) {
      this.logger.error(`Error en el ciclo del worker: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async process(task: QueuedTask) {
    const handler = this.handlers.get(task.codTaskType);
    if (!handler) {
      await this.queue.markFailed(task.ideBackgroundTask, `No hay handler para el tipo de tarea "${task.codTaskType}"`);
      return;
    }
    try {
      const result = await handler.handle(task, {
        saveProgress: (progress) => this.queue.saveProgress(task.ideBackgroundTask, progress),
      });
      await this.queue.markCompleted(task.ideBackgroundTask, result ?? undefined);
      this.logger.log(`Tarea ${task.codTaskType} ${task.ideBackgroundTask} completada`);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      const permanent =
        err instanceof PermanentTaskError ||
        err instanceof NotFoundException ||
        err instanceof BadRequestException ||
        err instanceof ConflictException;
      if (permanent || task.numAttempts >= task.numMaxAttempts) {
        this.logger.error(`Tarea ${task.codTaskType} ${task.ideBackgroundTask} FALLIDA: ${message}`);
        await this.queue.markFailed(task.ideBackgroundTask, message);
        return;
      }
      const delaySeconds = Math.min(BASE_BACKOFF_SECONDS * 2 ** (task.numAttempts - 1), MAX_BACKOFF_SECONDS);
      this.logger.warn(
        `Tarea ${task.codTaskType} ${task.ideBackgroundTask} falló (intento ${task.numAttempts}/${task.numMaxAttempts}), reintenta en ${delaySeconds}s: ${message}`,
      );
      await this.queue.markRetry(task.ideBackgroundTask, message, new Date(Date.now() + delaySeconds * 1000));
    }
  }
}
