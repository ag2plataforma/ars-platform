import { Module } from '@nestjs/common';
import { GenerationModule } from '../generation/generation.module';
import { GenerateDocumentHandler } from './handlers/generate-document.handler';
import { WelcomeEmailHandler } from './handlers/welcome-email.handler';
import {
  PaymentLinkEmailHandler,
  RenewalNoticeEmailHandler,
  RenewalNoticeSmsHandler,
  WelcomeSmsHandler,
} from './handlers/notification.handlers';
import { NotificationsService } from '../notifications/notifications.service';
import { TASK_HANDLERS, TaskHandler } from './task-handler';
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
    NotificationsService,
    WelcomeEmailHandler,
    GenerateDocumentHandler,
    WelcomeSmsHandler,
    RenewalNoticeEmailHandler,
    RenewalNoticeSmsHandler,
    PaymentLinkEmailHandler,
    {
      provide: TASK_HANDLERS,
      useFactory: (...handlers: TaskHandler[]) => handlers,
      inject: [
        WelcomeEmailHandler,
        GenerateDocumentHandler,
        WelcomeSmsHandler,
        RenewalNoticeEmailHandler,
        RenewalNoticeSmsHandler,
        PaymentLinkEmailHandler,
      ],
    },
    TaskWorkerService,
  ],
})
export class QueueModule {}
