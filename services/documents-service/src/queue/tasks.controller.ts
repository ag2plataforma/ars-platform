import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser, JwtPayload } from '@ars-platform/shared-common';
import { TaskQueueRepository } from '@ars-platform/database';
import { GenerateContractDocumentDto } from '../generation/dto/generate-contract-document.dto';
import { GENERATE_DOCUMENT_TASK } from './handlers/generate-document.handler';

/**
 * API de la cola para el frontend:
 *  - `POST tasks/contracts/:ideContract/documents` encola la generación de
 *    un documento (202; el PDF aparece en la lista cuando el worker lo
 *    termina) -- reemplaza a la generación síncrona del diálogo.
 *  - `GET tasks/contracts/:ideContract` lista las tareas del contrato
 *    (estado, intentos, error) para mostrar "Generando…"/"Falló" y
 *    refrescar la lista de documentos al completarse.
 *  - `POST tasks/:ideBackgroundTask/retry` reintenta una FALLIDA.
 *
 * Ruta estática de `retry` bajo `tasks/:id/...` y las de contrato bajo
 * `tasks/contracts/...`: no chocan (distinto número de segmentos / literal).
 */
@Controller('tasks')
export class TasksController {
  constructor(private readonly queue: TaskQueueRepository) {}

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

  @Post(':ideBackgroundTask/retry')
  @HttpCode(200)
  async retry(@Param('ideBackgroundTask', new ParseUUIDPipe()) ide: string, @CurrentUser() actor: JwtPayload) {
    const task = await this.queue.findById(ide);
    if (!task) throw new NotFoundException(`No existe la tarea "${ide}"`);
    await this.queue.retry(ide, actor.code);
    return toDto((await this.queue.findById(ide)) ?? task);
  }
}

function toDto(task: Awaited<ReturnType<TaskQueueRepository['findById']>> & object) {
  return {
    ideBackgroundTask: task.ideBackgroundTask,
    codTaskType: task.codTaskType,
    ideEntity: task.ideEntity,
    codStatus: task.codStatus,
    numAttempts: task.numAttempts,
    numMaxAttempts: task.numMaxAttempts,
    tstNextAttempt: task.tstNextAttempt,
    tstFinished: task.tstFinished,
    desError: task.desError,
    usrCreation: task.usrCreation,
    tstCreation: task.tstCreation,
    codTemplateType: (task.payload.codTemplateType as string | undefined) ?? null,
    ideContractOperationDocument: (task.result?.ideContractOperationDocument as string | undefined) ?? null,
  };
}
