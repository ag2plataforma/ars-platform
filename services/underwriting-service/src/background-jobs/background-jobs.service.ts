import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '@ars-platform/database';
import { BackgroundJobHandler, BackgroundJobRunResult } from './background-job-handler.interface';
import { UpdateBackgroundJobConfigDto } from './dto/update-background-job-config.dto';
import { ListBackgroundJobRunsDto } from './dto/list-background-job-runs.dto';

const SYSTEM_ACTOR = 'system';
const CRON_ACTOR = 'cron-job';

/**
 * Infraestructura GENÉRICA de "trabajos en segundo plano" -- pedido
 * explícito del usuario (2026-10-01), reemplaza el diseño inicial
 * específico de renovaciones (`RenewalsService`/`SRenewalBatchConfig`/
 * `TRenewalBatchRun`, nunca llegaron a correr contra la base real, ver
 * docs/02-roadmap.md). Cualquier feature que necesite correr algo por
 * cron, administrable desde una pantalla sin tocar código (horario,
 * activar/desactivar, "ejecutar ahora", historial de corridas), implementa
 * `BackgroundJobHandler` y se auto-registra acá (`registerHandler`, cada
 * handler lo llama desde su propio `onModuleInit`) -- ver
 * `RenewalBatchJobHandler` para el primer caso real.
 *
 * `SchedulerRegistry`/`CronJob` de `@nestjs/schedule` permiten registrar/
 * desregistrar jobs EN CALIENTE (a diferencia del decorador `@Cron`, que
 * es estático) -- necesario porque el horario se lee de `SBackgroundJob`
 * y se puede reprogramar desde la pantalla sin reiniciar el servicio.
 *
 * `OnApplicationBootstrap` (no `OnModuleInit`) para la programación
 * inicial: Nest llama `onModuleInit` de cada módulo en orden de
 * dependencias y recién DESPUÉS `onApplicationBootstrap` de TODOS --
 * así se garantiza que ya corrieron los `onModuleInit` de los handlers
 * (que es donde se registran contra este servicio) antes de intentar
 * programar sus cronjobs, sin importar el orden de imports en
 * `AppModule`.
 */
@Injectable()
export class BackgroundJobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BackgroundJobsService.name);
  private readonly handlers = new Map<string, BackgroundJobHandler>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  /** Cada `BackgroundJobHandler` se registra a sí mismo acá desde su
   *  propio `onModuleInit`. */
  registerHandler(handler: BackgroundJobHandler): void {
    this.handlers.set(handler.codJob, handler);
  }

  /** Al terminar el bootstrap de TODA la app: asegura la fila
   *  `SBackgroundJob` de cada handler registrado (la crea inactiva/02:00
   *  si es la primera vez que corre ese job) y programa el cron de los
   *  que ya estén activos. */
  async onApplicationBootstrap(): Promise<void> {
    for (const handler of this.handlers.values()) {
      const row = await this.getOrCreateConfigRow(handler);
      if (row.IndActive) {
        this.registerCron(handler.codJob, row.NumHour, row.NumMinute);
      }
    }
  }

  /** `GET /background-jobs` -- un ítem por cada handler registrado, con
   *  su configuración actual (la crea si todavía no existe). */
  async findAll() {
    const items = [];
    for (const handler of this.handlers.values()) {
      const row = await this.getOrCreateConfigRow(handler);
      items.push({
        codJob: handler.codJob,
        desJob: handler.desJob,
        indActive: row.IndActive,
        numHour: row.NumHour,
        numMinute: row.NumMinute,
      });
    }
    return items;
  }

  /** `PATCH /background-jobs/:codJob/config` -- actualiza horario/activo
   *  y reprograma el cron en caliente (lo saca y lo vuelve a crear si
   *  corresponde, nunca dos registrados a la vez para el mismo job). */
  async updateConfig(codJob: string, dto: UpdateBackgroundJobConfigDto, actor: string) {
    const handler = this.getHandlerOrThrow(codJob);
    const existing = await this.getOrCreateConfigRow(handler);
    const now = new Date();
    await this.prisma.sBackgroundJob.update({
      where: { IdeBackgroundJob: existing.IdeBackgroundJob },
      data: {
        IndActive: dto.indActive,
        NumHour: dto.numHour,
        NumMinute: dto.numMinute,
        UsrModification: actor,
        TstModification: now,
      },
    });

    this.unregisterCronIfExists(codJob);
    if (dto.indActive) {
      this.registerCron(codJob, dto.numHour, dto.numMinute);
    }

    return { codJob, desJob: handler.desJob, indActive: dto.indActive, numHour: dto.numHour, numMinute: dto.numMinute };
  }

  /** `GET /background-jobs/:codJob/runs` -- historial paginado, más
   *  reciente primero. */
  async listRuns(codJob: string, query: ListBackgroundJobRunsDto) {
    const handler = this.getHandlerOrThrow(codJob);
    const config = await this.getOrCreateConfigRow(handler);
    const where = { IdeBackgroundJob: config.IdeBackgroundJob };
    const [rows, total] = await Promise.all([
      this.prisma.tBackgroundJobRun.findMany({
        where,
        orderBy: { TstStart: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.tBackgroundJobRun.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        ideBackgroundJobRun: row.IdeBackgroundJobRun,
        tstStart: row.TstStart,
        tstEnd: row.TstEnd,
        indManual: row.IndManual,
        numSucceeded: row.NumSucceeded,
        numFailed: row.NumFailed,
        numSkipped: row.NumSkipped,
        desDetail: row.DesDetail,
        desError: row.DesError,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /** `POST /background-jobs/:codJob/runs/run-now` -- dispara el job
   *  manualmente, sin esperar al horario programado. Misma lógica que
   *  la corrida automática, solo cambia `IndManual`. */
  async runNow(codJob: string, actor: string) {
    return this.runJob(codJob, true, actor);
  }

  private async runJob(codJob: string, isManual: boolean, actor: string) {
    const handler = this.getHandlerOrThrow(codJob);
    const config = await this.getOrCreateConfigRow(handler);
    const tstStart = new Date();
    let result: BackgroundJobRunResult;
    let desError: string | null = null;
    try {
      result = await handler.run(actor);
    } catch (err) {
      desError = (err as Error).message;
      this.logger.error(`El job "${codJob}" falló por completo: ${desError}`);
      result = { numSucceeded: 0, numFailed: 0, numSkipped: 0 };
    }
    const tstEnd = new Date();
    const run = await this.prisma.tBackgroundJobRun.create({
      data: {
        IdeBackgroundJob: config.IdeBackgroundJob,
        TstStart: tstStart,
        TstEnd: tstEnd,
        IndManual: isManual,
        NumSucceeded: result.numSucceeded,
        NumFailed: result.numFailed,
        NumSkipped: result.numSkipped,
        DesDetail: result.desDetail ?? null,
        DesError: desError,
        UsrCreation: actor,
        TstCreation: tstEnd,
        UsrModification: actor,
        TstModification: tstEnd,
      },
    });
    return {
      ideBackgroundJobRun: run.IdeBackgroundJobRun,
      tstStart,
      tstEnd,
      indManual: isManual,
      numSucceeded: result.numSucceeded,
      numFailed: result.numFailed,
      numSkipped: result.numSkipped,
      desDetail: result.desDetail ?? null,
      desError,
    };
  }

  /** Find-or-create de la fila `SBackgroundJob` de un handler (singleton
   *  POR `CodJob`, no global -- cada job tiene la suya). */
  private async getOrCreateConfigRow(handler: BackgroundJobHandler) {
    const existing = await this.prisma.sBackgroundJob.findUnique({ where: { CodJob: handler.codJob } });
    if (existing) return existing;
    const now = new Date();
    return this.prisma.sBackgroundJob.create({
      data: {
        CodJob: handler.codJob,
        DesJob: handler.desJob,
        IndActive: false,
        NumHour: 2,
        NumMinute: 0,
        UsrCreation: SYSTEM_ACTOR,
        TstCreation: now,
        UsrModification: SYSTEM_ACTOR,
        TstModification: now,
      },
    });
  }

  private getHandlerOrThrow(codJob: string): BackgroundJobHandler {
    const handler = this.handlers.get(codJob);
    if (!handler) throw new NotFoundException(`No existe un job registrado con código "${codJob}"`);
    return handler;
  }

  private registerCron(codJob: string, hour: number, minute: number): void {
    const cronExpression = `${minute} ${hour} * * *`;
    const job = new CronJob(cronExpression, () => {
      this.runJob(codJob, false, CRON_ACTOR).catch((err) =>
        this.logger.error(`Error inesperado en el cron de "${codJob}": ${err.message}`),
      );
    });
    this.schedulerRegistry.addCronJob(codJob, job);
    job.start();
    this.logger.log(
      `Job "${codJob}" programado: todos los días a las ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}.`,
    );
  }

  private unregisterCronIfExists(codJob: string): void {
    if (this.schedulerRegistry.getCronJobs().has(codJob)) {
      this.schedulerRegistry.deleteCronJob(codJob);
      this.logger.log(`Job "${codJob}" des-programado.`);
    }
  }
}
