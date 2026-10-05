import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import {
  CheckoutSession,
  CheckoutSessionInput,
  PaymentEvent,
  PaymentGateway,
} from './payment-gateway';

/**
 * Pasarela SIMULADA para probar el flujo completo sin cuenta real: la
 * "página de pago" es una pantalla del propio backoffice
 * (`/pago/sandbox/:externalId`) con los botones "Pago correcto"/"Pago
 * fallido", que llaman al mismo webhook que usará una pasarela real. Solo
 * está disponible con `PAYMENT_PROVIDER=sandbox`; NO usar en producción.
 */
export class SandboxPaymentGateway implements PaymentGateway {
  readonly codProvider = 'sandbox';

  constructor(private readonly publicAppUrl: string) {}

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession> {
    const externalId = `sbx_${randomUUID()}`;
    const redirectUrl =
      `${this.publicAppUrl}/pago/sandbox/${externalId}` + `?return=${encodeURIComponent(input.returnUrl)}`;
    return { externalId, redirectUrl };
  }

  async parseWebhook(body: unknown): Promise<PaymentEvent | null> {
    const data = (body ?? {}) as { externalId?: unknown; outcome?: unknown };
    if (typeof data.externalId !== 'string' || !data.externalId.startsWith('sbx_')) {
      throw new BadRequestException('externalId inválido');
    }
    if (data.outcome !== 'PAID' && data.outcome !== 'FAILED') {
      throw new BadRequestException('outcome debe ser PAID o FAILED');
    }
    return {
      type: data.outcome,
      codProvider: this.codProvider,
      externalId: data.externalId,
      payload: { simulated: true, outcome: data.outcome },
    };
  }
}
