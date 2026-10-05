import { Module } from '@nestjs/common';
import { UnderwritingStateMachineModule } from '../state-machine/underwriting-state-machine.module';
import { ContractsModule } from '../contracts/contracts.module';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentEventsService } from './payment-events.service';
import { PaymentLandingService } from './payment-landing.service';
import { PublicPaymentsController } from './public-payments.controller';

/**
 * Landing pública de pago y webhook de la pasarela. Aparte de `PaymentsModule`
 * porque necesita `ContractsService` (activar por pago), y `ContractsModule`
 * ya importa `PaymentsModule` -- así no hay dependencia circular.
 */
@Module({
  imports: [UnderwritingStateMachineModule, ContractsModule, PaymentsModule],
  controllers: [PublicPaymentsController],
  providers: [PaymentLandingService, PaymentEventsService],
})
export class PublicPaymentsModule {}
