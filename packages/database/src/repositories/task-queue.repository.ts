import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export type TaskStatus = 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADA' | 'FALLIDA' | 'CANCELADA';

export interface QueuedTask {
  ideBackgroundTask: string;
  codTaskType: string;
  ideEntity: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  codStatus: TaskStatus;
  numAttempts: number;
  numMaxAttempts: number;
  tstNextAttempt: Date;
  tstStarted: Date | null;
  tstFinished: Date | null;
  desError: string | null;
  usrCreation: string;
  tstCreation: Date;
  /** Solo en `listPage`: número del contrato cuando `IdeEntity` es un contrato. */
  numContract?: string | null;
}

export interface TaskListFilter {
  status?: TaskStatus;
  codTaskType?: string;
  page: number;
  limit: number;
}

export interface EnqueueTaskInput {
  codTaskType: string;
  ideEntity?: string | null;
  payload?: Record<string, unknown>;
  actor: string;
  numMaxAttempts?: number;
}

interface TaskRow {
  IdeBackgroundTask: string;
  CodTaskType: string;
  IdeEntity: string | null;
  DesPayload: Record<string, unknown>;
  DesResult: Record<string, unknown> | null;
  CodStatus: TaskStatus;
  NumAttempts: number;
  NumMaxAttempts: number;
  TstNextAttempt: Date;
  TstStarted: Date | null;
  TstFinished: Date | null;
  DesError: string | null;
  UsrCreation: string;
  TstCreation: Date;
  NumContract?: string | null;
}

const COLUMNS = `"IdeBackgroundTask", "CodTaskType", "IdeEntity", "DesPayload", "DesResult", "CodStatus",
  "NumAttempts", "NumMaxAttempts", "TstNextAttempt", "TstStarted", "TstFinished", "DesError",
  "UsrCreation", "TstCreation"`;

function toTask(row: TaskRow): QueuedTask {
  return {
    ideBackgroundTask: row.IdeBackgroundTask,
    codTaskType: row.CodTaskType,
    ideEntity: row.IdeEntity,
    payload: row.DesPayload ?? {},
    result: row.DesResult,
    codStatus: row.CodStatus,
    numAttempts: row.NumAttempts,
    numMaxAttempts: row.NumMaxAttempts,
    tstNextAttempt: row.TstNextAttempt,
    tstStarted: row.TstStarted,
    tstFinished: row.TstFinished,
    desError: row.DesError,
    usrCreation: row.UsrCreation,
    tstCreation: row.TstCreation,
    ...(row.NumContract !== undefined ? { numContract: row.NumContract } : {}),
  };
}

/**
 * Cola de tareas en segundo plano (tabla `ars_platform."TBackgroundTask"`,
 * ver `scripts/setup-task-queue-table.js`).
 *
 * Todo con SQL crudo (`$queryRaw`/`$executeRaw`): hace falta
 * `FOR UPDATE SKIP LOCKED` para que dos workers nunca tomen la misma
 * tarea, algo que el cliente Prisma no expresa. Como efecto secundario,
 * este archivo compila aunque todavía no se haya regenerado el cliente
 * con el modelo nuevo.
 *
 * Cualquier servicio puede ENCOLAR (`enqueue`, es solo un INSERT); hoy
 * solo `documents-service` CONSUME (worker propio).
 */
@Injectable()
export class TaskQueueRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: EnqueueTaskInput): Promise<QueuedTask> {
    const now = new Date();
    const rows = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `INSERT INTO ars_platform."TBackgroundTask"
         ("CodTaskType", "IdeEntity", "DesPayload", "NumMaxAttempts", "TstNextAttempt",
          "UsrCreation", "TstCreation", "UsrModification", "TstModification")
       VALUES ($1, $2::uuid, $3::jsonb, $4, $5, $6, $5, $6, $5)
       RETURNING ${COLUMNS}`,
      input.codTaskType,
      input.ideEntity ?? null,
      JSON.stringify(input.payload ?? {}),
      input.numMaxAttempts ?? 5,
      now,
      input.actor,
    );
    return toTask(rows[0]);
  }

  /** Toma (y marca EN_PROCESO) la próxima tarea lista, o `null` si no hay. */
  async claimNext(): Promise<QueuedTask | null> {
    const now = new Date();
    const rows = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `UPDATE ars_platform."TBackgroundTask"
          SET "CodStatus" = 'EN_PROCESO', "NumAttempts" = "NumAttempts" + 1,
              "TstStarted" = $1, "TstModification" = $1, "UsrModification" = 'worker'
        WHERE "IdeBackgroundTask" = (
          SELECT "IdeBackgroundTask" FROM ars_platform."TBackgroundTask"
           WHERE "CodStatus" = 'PENDIENTE' AND "TstNextAttempt" <= $1
           ORDER BY "TstNextAttempt" ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED)
        RETURNING ${COLUMNS}`,
      now,
    );
    return rows.length ? toTask(rows[0]) : null;
  }

  async markCompleted(ide: string, result?: Record<string, unknown>): Promise<void> {
    const now = new Date();
    await this.prisma.$executeRawUnsafe(
      `UPDATE ars_platform."TBackgroundTask"
          SET "CodStatus" = 'COMPLETADA', "TstFinished" = $2, "DesError" = NULL,
              "DesResult" = COALESCE($3::jsonb, "DesResult"),
              "TstModification" = $2, "UsrModification" = 'worker'
        WHERE "IdeBackgroundTask" = $1::uuid`,
      ide,
      now,
      result ? JSON.stringify(result) : null,
    );
  }

  /** Falla definitiva (error permanente o reintentos agotados). */
  async markFailed(ide: string, error: string): Promise<void> {
    const now = new Date();
    await this.prisma.$executeRawUnsafe(
      `UPDATE ars_platform."TBackgroundTask"
          SET "CodStatus" = 'FALLIDA', "TstFinished" = $2, "DesError" = $3,
              "TstModification" = $2, "UsrModification" = 'worker'
        WHERE "IdeBackgroundTask" = $1::uuid`,
      ide,
      now,
      error.slice(0, 2000),
    );
  }

  /** Vuelve a PENDIENTE para reintentar después de `nextAttempt`. */
  async markRetry(ide: string, error: string, nextAttempt: Date): Promise<void> {
    const now = new Date();
    await this.prisma.$executeRawUnsafe(
      `UPDATE ars_platform."TBackgroundTask"
          SET "CodStatus" = 'PENDIENTE', "TstNextAttempt" = $2, "DesError" = $3,
              "TstModification" = $4, "UsrModification" = 'worker'
        WHERE "IdeBackgroundTask" = $1::uuid`,
      ide,
      nextAttempt,
      error.slice(0, 2000),
      now,
    );
  }

  /** Guarda progreso parcial (se hace merge en `DesResult`). */
  async saveProgress(ide: string, progress: Record<string, unknown>): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE ars_platform."TBackgroundTask"
          SET "DesResult" = COALESCE("DesResult", '{}'::jsonb) || $2::jsonb,
              "TstModification" = $3
        WHERE "IdeBackgroundTask" = $1::uuid`,
      ide,
      JSON.stringify(progress),
      new Date(),
    );
  }

  /**
   * Tareas EN_PROCESO hace más de `staleAfterMinutes` (el worker murió a
   * mitad de la tarea) vuelven a PENDIENTE; si ya agotaron los intentos,
   * pasan a FALLIDA. Devuelve cuántas se recuperaron.
   */
  async recoverStale(staleAfterMinutes: number): Promise<number> {
    const now = new Date();
    const limit = new Date(now.getTime() - staleAfterMinutes * 60_000);
    await this.prisma.$executeRawUnsafe(
      `UPDATE ars_platform."TBackgroundTask"
          SET "CodStatus" = 'FALLIDA', "TstFinished" = $1,
              "DesError" = 'El worker se detuvo durante la tarea y se agotaron los intentos',
              "TstModification" = $1, "UsrModification" = 'worker'
        WHERE "CodStatus" = 'EN_PROCESO' AND "TstStarted" < $2 AND "NumAttempts" >= "NumMaxAttempts"`,
      now,
      limit,
    );
    return this.prisma.$executeRawUnsafe(
      `UPDATE ars_platform."TBackgroundTask"
          SET "CodStatus" = 'PENDIENTE', "TstNextAttempt" = $1,
              "DesError" = 'El worker se detuvo durante la tarea; se reintenta',
              "TstModification" = $1, "UsrModification" = 'worker'
        WHERE "CodStatus" = 'EN_PROCESO' AND "TstStarted" < $2`,
      now,
      limit,
    );
  }

  /** Reintento manual de una tarea FALLIDA: vuelve a PENDIENTE con un intento extra disponible. */
  async retry(ide: string, actor: string): Promise<boolean> {
    const now = new Date();
    const affected = await this.prisma.$executeRawUnsafe(
      `UPDATE ars_platform."TBackgroundTask"
          SET "CodStatus" = 'PENDIENTE', "TstNextAttempt" = $2, "TstFinished" = NULL, "DesError" = NULL,
              "NumMaxAttempts" = GREATEST("NumMaxAttempts", "NumAttempts" + 1),
              "TstModification" = $2, "UsrModification" = $3
        WHERE "IdeBackgroundTask" = $1::uuid AND "CodStatus" = 'FALLIDA'`,
      ide,
      now,
      actor,
    );
    return affected > 0;
  }

  /** Listado global paginado (más nuevas primero) con filtros opcionales; trae el número de contrato. */
  async listPage(filter: TaskListFilter): Promise<{ items: QueuedTask[]; total: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.status) {
      params.push(filter.status);
      where.push(`t."CodStatus" = $${params.length}`);
    }
    if (filter.codTaskType) {
      params.push(filter.codTaskType);
      where.push(`t."CodTaskType" = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await this.prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM ars_platform."TBackgroundTask" t ${whereSql}`,
      ...params,
    );
    const rows = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `SELECT ${COLUMNS.split(',').map((c) => `t.${c.trim()}`).join(', ')}, c."NumContract" AS "NumContract"
         FROM ars_platform."TBackgroundTask" t
         LEFT JOIN ars_platform."TContract" c ON c."IdeContract" = t."IdeEntity"
         ${whereSql}
        ORDER BY t."TstCreation" DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      ...params,
      filter.limit,
      (filter.page - 1) * filter.limit,
    );
    return { items: rows.map(toTask), total: total[0]?.n ?? 0 };
  }

  /** Conteo por estado y por tipo (para los contadores de la vista global). */
  async summary(): Promise<{ byStatus: Record<string, number>; byType: Record<string, number> }> {
    const status = await this.prisma.$queryRawUnsafe<Array<{ k: string; n: number }>>(
      `SELECT "CodStatus" AS k, count(*)::int AS n FROM ars_platform."TBackgroundTask" GROUP BY "CodStatus"`,
    );
    const type = await this.prisma.$queryRawUnsafe<Array<{ k: string; n: number }>>(
      `SELECT "CodTaskType" AS k, count(*)::int AS n FROM ars_platform."TBackgroundTask" GROUP BY "CodTaskType"`,
    );
    return {
      byStatus: Object.fromEntries(status.map((r) => [r.k, r.n])),
      byType: Object.fromEntries(type.map((r) => [r.k, r.n])),
    };
  }

  /** Cancela una tarea PENDIENTE (no toca las que ya están en proceso). `false` si no estaba pendiente. */
  async cancel(ide: string, actor: string): Promise<boolean> {
    const now = new Date();
    const affected = await this.prisma.$executeRawUnsafe(
      `UPDATE ars_platform."TBackgroundTask"
          SET "CodStatus" = 'CANCELADA', "TstFinished" = $2, "DesError" = 'Cancelada por ' || $3,
              "TstModification" = $2, "UsrModification" = $3
        WHERE "IdeBackgroundTask" = $1::uuid AND "CodStatus" = 'PENDIENTE'`,
      ide,
      now,
      actor,
    );
    return affected > 0;
  }

  async findById(ide: string): Promise<QueuedTask | null> {
    const rows = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `SELECT ${COLUMNS} FROM ars_platform."TBackgroundTask" WHERE "IdeBackgroundTask" = $1::uuid`,
      ide,
    );
    return rows.length ? toTask(rows[0]) : null;
  }

  async listByEntity(ideEntity: string, limit = 50): Promise<QueuedTask[]> {
    const rows = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `SELECT ${COLUMNS} FROM ars_platform."TBackgroundTask"
        WHERE "IdeEntity" = $1::uuid ORDER BY "TstCreation" DESC LIMIT $2`,
      ideEntity,
      limit,
    );
    return rows.map(toTask);
  }
}
