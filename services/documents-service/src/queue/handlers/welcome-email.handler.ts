import { Injectable } from '@nestjs/common';
import type { QueuedTask } from '@ars-platform/database';
import { GenerationService } from '../../generation/generation.service';
import { PermanentTaskError, TaskContext, TaskHandler } from '../task-handler';

export const WELCOME_EMAIL_TASK = 'WELCOME_EMAIL';

/** Correo de bienvenida con la póliza adjunta, encolado por
 *  `ContractsService.activate()` en underwriting-service. */
@Injectable()
export class WelcomeEmailHandler implements TaskHandler {
  readonly codTaskType = WELCOME_EMAIL_TASK;

  constructor(private readonly generation: GenerationService) {}

  async handle(task: QueuedTask, ctx: TaskContext) {
    if (!task.ideEntity) throw new PermanentTaskError('La tarea no tiene contrato asociado');
    return this.generation.sendWelcomeEmail(task.ideEntity, task.usrCreation, {
      previousDocumentId: (task.result?.ideContractOperationDocument as string | undefined) ?? undefined,
      onDocumentGenerated: (ideContractOperationDocument) => ctx.saveProgress({ ideContractOperationDocument }),
    });
  }
}
