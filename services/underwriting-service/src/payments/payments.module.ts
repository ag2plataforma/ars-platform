import { Module } from '@nestjs/common';
import { UnderwritingStateMachineModule } from '../state-machine/underwriting-state-machine.module';
import { PaymentsService } from './payments.service';
import { PaymentLinksService, publicAppUrl } from './payment-links.service';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway';
import { SandboxPaymentGateway } from './gateway/sandbox-payment-gateway';
import { UnconfiguredPaymentGateway } from './gateway/unconfigured-payment-gateway';

/**
 * Cobro de recibos y enlaces de pago. La pasarela concreta se elige por
 * `PAYMENT_PROVIDER` (hoy: `sandbox`; Stripe llega en la etapa 3). Lo
 * consumen `ContractsService` (activación) y `PublicPaymentsModule` (landing
 * y webhook).
 */
@Module({
  imports: [UnderwritingStateMachineModule],
  providers: [
    PaymentsService,
    PaymentLinksService,
    {
      provide: PAYMENT_GATEWAY,
      useFactory: () => {
        const provider = process.env.PAYMENT_PROVIDER?.trim().toLowerCase();
        if (provider === 'sandbox') return new SandboxPaymentGateway(publicAppUrl());
        return new UnconfiguredPaymentGateway(provider);
      },
    },
  ],
  exports: [PaymentsService, PaymentLinksService, PAYMENT_GATEWAY],
})
export class PaymentsModule {}
