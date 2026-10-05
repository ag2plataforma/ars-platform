import { ServiceUnavailableException } from '@nestjs/common';
import { PaymentEvent, PaymentGateway, CheckoutSession } from './payment-gateway';

/** Se usa cuando `PAYMENT_PROVIDER` no está definido o no se reconoce: falla con un mensaje claro. */
export class UnconfiguredPaymentGateway implements PaymentGateway {
  readonly codProvider = 'none';

  constructor(
    private readonly configured: string | undefined,
    private readonly reason?: string,
  ) {}

  async createCheckoutSession(): Promise<CheckoutSession> {
    throw new ServiceUnavailableException(
      `Pasarela de pago no configurada${this.configured ? ` (PAYMENT_PROVIDER="${this.configured}": ${this.reason ?? 'no se reconoce'})` : ''}: ` +
        'define PAYMENT_PROVIDER en services/underwriting-service/.env (sandbox o stripe).',
    );
  }

  async parseWebhook(): Promise<PaymentEvent | null> {
    return null;
  }
}
