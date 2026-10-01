import { Module } from '@nestjs/common';
import { UnderwritingStateMachineModule } from '../state-machine/underwriting-state-machine.module';
import { ContractsModule } from '../contracts/contracts.module';
import { BackgroundJobsModule } from '../background-jobs/background-jobs.module';
import { RenewalBatchJobHandler } from './renewal-batch-job.handler';

/**
 * Registra `RenewalBatchJobHandler` (ver ese archivo) contra la
 * infraestructura genérica de jobs. Importa `ContractsModule` por
 * `ContractsService` (`exports` agregado ahí para esto) y
 * `BackgroundJobsModule` por `BackgroundJobsService`.
 */
@Module({
  imports: [UnderwritingStateMachineModule, ContractsModule, BackgroundJobsModule],
  providers: [RenewalBatchJobHandler],
})
export class RenewalsModule {}
