import { Module } from '@nestjs/common';
import { UnderwritingStateMachineModule } from '../state-machine/underwriting-state-machine.module';
import { PaymentsService } from './payments.service';

/**
 * Cobro de recibos. Sin controlador todavía: lo consumen
 * `ContractsService` (activación) y, en etapas siguientes, el webhook de la
 * pasarela y la landing de pago.
 */
@Module({
  imports: [UnderwritingStateMachineModule],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
