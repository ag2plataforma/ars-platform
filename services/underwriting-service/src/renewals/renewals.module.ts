import { Module } from '@nestjs/common';
import { UnderwritingStateMachineModule } from '../state-machine/underwriting-state-machine.module';
import { ContractsModule } from '../contracts/contracts.module';
import { BackgroundJobsModule } from '../background-jobs/background-jobs.module';
import { RenewalBatchJobHandler } from './renewal-batch-job.handler';
import { RenewalNoticeJobHandler } from './renewal-notice-job.handler';
import { InstallmentReceiptJobHandler } from './installment-receipt-job.handler';

/**
 * Registra los `BackgroundJobHandler` de renovaciones (ver ese archivo)
 * contra la infraestructura genérica de jobs:
 * - `RenewalBatchJobHandler`: renovación automática de contratos vencidos.
 * - `RenewalNoticeJobHandler`: aviso por email al cliente antes del
 *   vencimiento (sub-item pendiente de la Etapa 3, ver ese archivo).
 * - `InstallmentReceiptJobHandler`: emisión de los recibos de las cuotas
 *   2..N de contratos fraccionados (fuera de renovaciones, pero comparte
 *   las mismas dependencias).
 *
 * Importa `ContractsModule` por `ContractsService` (`exports` agregado
 * ahí para esto) y `BackgroundJobsModule` por `BackgroundJobsService`.
 */
@Module({
  imports: [UnderwritingStateMachineModule, ContractsModule, BackgroundJobsModule],
  providers: [RenewalBatchJobHandler, RenewalNoticeJobHandler, InstallmentReceiptJobHandler],
})
export class RenewalsModule {}
