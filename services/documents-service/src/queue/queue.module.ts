import { Module } from '@nestjs/common';
import { GenerationModule } from '../generation/generation.module';
import { GenerateDocumentHandler } from './handlers/generate-document.handler';
import { WelcomeEmailHandler } from './handlers/welcome-email.handler';
import { TASK_HANDLERS } from './task-handler';
import { TaskWorkerService } from './task-worker.service';
import { TasksController } from './tasks.controller';

/**
 * Cola de tareas en segundo plano (roadmap Fase 2): worker + handlers +
 * API de consulta/reintento. `TaskQueueRepository` viene del
 * `PrismaModule` global. Para sumar un tipo de tarea nuevo: crear su
 * handler (`TaskHandler`) y registrarlo en el provider `TASK_HANDLERS`.
 */
@Module({
  imports: [GenerationModule],
  controllers: [TasksController],
  providers: [
    WelcomeEmailHandler,
    GenerateDocumentHandler,
    {
      provide: TASK_HANDLERS,
      useFactory: (welcome: WelcomeEmailHandler, generate: GenerateDocumentHandler) => [welcome, generate],
      inject: [WelcomeEmailHandler, GenerateDocumentHandler],
    },
    TaskWorkerService,
  ],
})
export class QueueModule {}
