import { Injectable } from '@nestjs/common';
import type { QueuedTask } from '@ars-platform/database';
import { GenerationService } from '../../generation/generation.service';
import { PermanentTaskError, TaskContext, TaskHandler } from '../task-handler';

export const GENERATE_DOCUMENT_TASK = 'GENERATE_DOCUMENT';

/** Generación del PDF de un documento de un contrato, pedida a demanda
 *  desde la pestaña Documentos (ver `TasksController`). */
@Injectable()
export class GenerateDocumentHandler implements TaskHandler {
  readonly codTaskType = GENERATE_DOCUMENT_TASK;

  constructor(private readonly generation: GenerationService) {}

  async handle(task: QueuedTask, _ctx: TaskContext) {
    if (!task.ideEntity) throw new PermanentTaskError('La tarea no tiene contrato asociado');
    const p = task.payload as {
      codTemplateType: string;
      idePersonRol: string;
      ideReceipt?: string;
      mensaje?: string;
    };
    const { ideContractOperationDocument } = await this.generation.generateContractDocument(
      task.ideEntity,
      p.codTemplateType,
      p.idePersonRol,
      task.usrCreation,
      { ideReceipt: p.ideReceipt, mensaje: p.mensaje },
    );
    return { ideContractOperationDocument };
  }
}
