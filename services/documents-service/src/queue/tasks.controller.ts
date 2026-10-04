import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, JwtPayload, Roles } from '@ars-platform/shared-common';
import { QueuedTask, TaskQueueRepository, TaskStatus } from '@ars-platform/database';
import { GenerateContractDocumentDto } from '../generation/dto/generate-contract-document.dto';
import { GENERATE_DOCUMENT_TASK } from './handlers/generate-document.handler';

const STATUSES: TaskStatus[] = ['PENDIENTE', 'EN_PROCESO', 'COMPLETADA', 'FALLIDA', 'CANCELADA'];

/**
 * API de la cola:
 *  - Por contrato (pestaña Documentos): `POST tasks/contracts/:id/documents`
 *    (202), `GET tasks/contracts/:id`.
 *  - Vista global ("Cola de tareas"): `GET tasks` (paginado, filtros
 *    `status`/`type`), `GET tasks/summary` (contadores), `GET tasks/:id`
 *    (detalle con payload/resultado).
 *  - Acciones: `POST tasks/:id/retry` (FALLIDA -> PENDIENTE) y
 *    `POST tasks/:id/cancel` (solo PENDIENTE, solo ADMIN).
 *
 * Orden de rutas: las estáticas (`summary`, `contracts/...`) van ANTES que
 * `:ideBackgroundTask`, mismo gotcha de siempre de Nest.
 */
@Controller('tasks')
export class TasksController {
  constructor(private readonly queue: TaskQueueRepository) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 25,
  ) {
    const safeStatus = STATUSES.includes(status as TaskStatus) ? (status as TaskStatus) : undefined;
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const result = await this.queue.listPage({
      status: safeStatus,
      codTaskType: type || undefined,
      page: Math.max(page, 1),
      limit: safeLimit,
    });
    return { items: result.items.map(toDto), total: result.total };
  }

  @Get('summary')
  summary() {
    return this.queue.summary();
  }

  @Post('contracts/:ideContract/documents')
  @HttpCode(202)
  async enqueueDocument(
    @Param('ideContract', new ParseUUIDPipe()) ideContract: string,
    @Body() dto: GenerateContractDocumentDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    const task = await this.queue.enqueue({
      codTaskType: GENERATE_DOCUMENT_TASK,
      ideEntity: ideContract,
      actor: actor.code,
      payload: {
        codTemplateType: dto.codTemplateType,
        idePersonRol: dto.idePersonRol,
        ...(dto.ideReceipt ? { ideReceipt: dto.ideReceipt } : {}),
        ...(dto.mensaje ? { mensaje: dto.mensaje } : {}),
      },
    });
    return toDto(task);
  }

  @Get('contracts/:ideContract')
  async listForContract(@Param('ideContract', new ParseUUIDPipe()) ideContract: string) {
    return (await this.queue.listByEntity(ideContract)).map(toDto);
  }

  @Get(':ideBackgroundTask')
  async detail(@Param('ideBackgroundTask', new ParseUUIDPipe()) ide: string) {
    const task = await this.queue.findById(ide);
    if (!task) throw new NotFoundException(`No existe la tarea "${ide}"`);
    return { ...toDto(task), payload: task.payload, result: task.result };
  }

  @Post(':ideBackgroundTask/retry')
  @HttpCode(200)
  async retry(@Param('ideBackgroundTask', new ParseUUIDPipe()) ide: string, @CurrentUser() actor: JwtPayload) {
    const task = await this.queue.findById(ide);
    if (!task) throw new NotFoundException(`No existe la tarea "${ide}"`);
    if (task.codStatus !== 'FALLIDA') {
      throw new ConflictException(`Solo se pueden reintentar tareas FALLIDAS (esta está ${task.codStatus})`);
    }
    await this.queue.retry(ide, actor.code);
    return toDto((await this.queue.findById(ide)) ?? task);
  }

  @Roles('ADMIN')
  @Post(':ideBackgroundTask/cancel')
  @HttpCode(200)
  async cancel(@Param('ideBackgroundTask', new ParseUUIDPipe()) ide: string, @CurrentUser() actor: JwtPayload) {
    const task = await this.queue.findById(ide);
    if (!task) throw new NotFoundException(`No existe la tarea "${ide}"`);
    if (!(await this.queue.cancel(ide, actor.code))) {
      throw new ConflictException(`Solo se pueden cancelar tareas PENDIENTES (esta está ${task.codStatus})`);
    }
    return toDto((await this.queue.findById(ide)) ?? task);
  }
}

function toDto(task: QueuedTask) {
  const result = task.result ?? {};
  return {
    ideBackgroundTask: task.ideBackgroundTask,
    codTaskType: task.codTaskType,
    ideEntity: task.ideEntity,
    numContract: task.numContract ?? null,
    codStatus: task.codStatus,
    numAttempts: task.numAttempts,
    numMaxAttempts: task.numMaxAttempts,
    tstNextAttempt: task.tstNextAttempt,
    tstFinished: task.tstFinished,
    desError: task.desError,
    usrCreation: task.usrCreation,
    tstCreation: task.tstCreation,
    codTemplateType: (task.payload.codTemplateType as string | undefined) ?? null,
    ideContractOperationDocument: (result.ideContractOperationDocument as string | undefined) ?? null,
    /** Motivo cuando el envío se omitió a propósito (ej. el contrato ya no está activo). */
    desSkipReason: result.skipped === true ? ((result.reason as string | undefined) ?? null) : null,
  };
}
