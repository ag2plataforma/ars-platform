import { Module } from '@nestjs/common';
import { BackgroundJobsService } from './background-jobs.service';
import { BackgroundJobsController } from './background-jobs.controller';

/**
 * Infraestructura genérica de jobs (ver `BackgroundJobsService`).
 * Cualquier módulo de feature que tenga un `BackgroundJobHandler`
 * importa este módulo e inyecta `BackgroundJobsService` para
 * auto-registrarse (`registerHandler`, desde su propio `onModuleInit`)
 * -- este módulo no necesita conocer de antemano qué features lo usan.
 */
@Module({
  controllers: [BackgroundJobsController],
  providers: [BackgroundJobsService],
  exports: [BackgroundJobsService],
})
export class BackgroundJobsModule {}
