import { createHmac, timingSafeEqual } from 'crypto';
import { BadGatewayException, BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import {
  CheckoutSession,
  CheckoutSessionInput,
  PaymentEvent,
  PaymentGateway,
} from './payment-gateway';

const STRIPE_API = 'https://api.stripe.com/v1';
/** Tolerancia de la marca de tiempo de la firma (la misma que usa el SDK oficial de Stripe). */
const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Subconjunto de la Checkout Session de Stripe que usamos. */
interface StripeCheckoutSession {
  id: string;
  object: 'checkout.session';
  url?: string | null;
  status?: 'open' | 'complete' | 'expired' | null;
  payment_status?: 'paid' | 'unpaid' | 'no_payment_required';
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | null;
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: StripeCheckoutSession };
}

/**
 * Pasarela Stripe (Checkout ALOJADO: el tomador paga en una página de
 * Stripe, nunca introducimos datos de tarjeta aquí). Habla con la API REST de
 * Stripe con `fetch` y verifica la firma del webhook con `crypto`, sin
 * depender del SDK `stripe`.
 *
 * No se fijan `payment_method_types`: Stripe muestra los métodos que estén
 * activados en el Dashboard para EUR/España (tarjeta, Apple/Google Pay, SEPA,
 * Bizum si la cuenta lo tiene habilitado...). Los métodos asíncronos llegan
 * por `checkout.session.async_payment_succeeded/failed`.
 *
 * Credenciales solo en `.env`: `STRIPE_SECRET_KEY` (sk_test_... / sk_live_...)
 * y `STRIPE_WEBHOOK_SECRET` (whsec_...).
 */
export class StripePaymentGateway implements PaymentGateway {
  readonly codProvider = 'stripe';
  private readonly logger = new Logger(StripePaymentGateway.name);

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string | undefined,
  ) {}

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession> {
    const separator = input.returnUrl.includes('?') ? '&' : '?';
    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', `${input.returnUrl}${separator}checkout=success`);
    form.set('cancel_url', `${input.returnUrl}${separator}checkout=cancel`);
    form.set('client_reference_id', input.ideLink);
    form.set('line_items[0][quantity]', '1');
    form.set('line_items[0][price_data][currency]', input.currency.toLowerCase());
    form.set('line_items[0][price_data][unit_amount]', String(Math.round(input.amount * 100)));
    form.set('line_items[0][price_data][product_data][name]', input.description.slice(0, 250));
    form.set('metadata[ideLink]', input.ideLink);
    form.set('metadata[ideContract]', input.ideContract);
    form.set('payment_intent_data[metadata][ideLink]', input.ideLink);
    form.set('payment_intent_data[metadata][ideContract]', input.ideContract);
    if (input.customerEmail) form.set('customer_email', input.customerEmail);

    const session = await this.request<StripeCheckoutSession>('POST', '/checkout/sessions', form);
    if (!session.url) throw new BadGatewayException('Stripe no devolvió la URL de pago');
    return { externalId: session.id, redirectUrl: session.url };
  }

  async parseWebhook(
    _body: unknown,
    headers: Record<string, string | string[] | undefined>,
    rawBody?: Buffer,
  ): Promise<PaymentEvent | null> {
    if (!this.webhookSecret) {
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET no está configurado: no se puede verificar el webhook');
    }
    if (!rawBody) throw new BadRequestException('Falta el cuerpo crudo de la petición');
    const signature = headers['stripe-signature'];
    this.verifySignature(rawBody, typeof signature === 'string' ? signature : undefined);

    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody.toString('utf8')) as StripeEvent;
    } catch {
      throw new BadRequestException('Cuerpo del webhook no es JSON');
    }
    if (!event?.type || event.data?.object?.object !== 'checkout.session') return null;
    const session = event.data.object;

    switch (event.type) {
      case 'checkout.session.completed':
        // Con métodos asíncronos (p. ej. SEPA) la sesión se completa SIN estar pagada todavía:
        // el cobro llegará en `async_payment_succeeded`.
        return session.payment_status === 'paid' ? this.toEvent('PAID', session, event.id) : null;
      case 'checkout.session.async_payment_succeeded':
        return this.toEvent('PAID', session, event.id);
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        return this.toEvent('FAILED', session, event.id);
      default:
        return null;
    }
  }

  /**
   * Consulta a Stripe (servidor a servidor, con la clave secreta: NO se confía
   * en nada que venga del navegador) el estado actual de una sesión. Sirve de
   * red de seguridad cuando el webhook no puede llegar (desarrollo local sin
   * túnel) o se retrasa. Devuelve `null` mientras el pago siga pendiente.
   */
  async retrieveEvent(externalId: string): Promise<PaymentEvent | null> {
    const session = await this.request<StripeCheckoutSession>(
      'GET',
      `/checkout/sessions/${encodeURIComponent(externalId)}`,
    );
    if (session.payment_status === 'paid') return this.toEvent('PAID', session, 'retrieve');
    if (session.status === 'expired') return this.toEvent('FAILED', session, 'retrieve');
    return null;
  }

  private toEvent(type: 'PAID' | 'FAILED', session: StripeCheckoutSession, source: string): PaymentEvent {
    return {
      type,
      codProvider: this.codProvider,
      externalId: session.id,
      amount: session.amount_total != null ? session.amount_total / 100 : null,
      payload: {
        source,
        sessionId: session.id,
        paymentIntent: session.payment_intent ?? null,
        paymentStatus: session.payment_status ?? null,
        status: session.status ?? null,
        amountTotal: session.amount_total ?? null,
        currency: session.currency ?? null,
      },
    };
  }

  /** Verifica `Stripe-Signature: t=<ts>,v1=<hmac>` = HMAC-SHA256(`${t}.${cuerpoCrudo}`, whsec). */
  private verifySignature(rawBody: Buffer, header: string | undefined): void {
    if (!header) throw new UnauthorizedException('Falta la cabecera Stripe-Signature');
    const parts = header.split(',').map((p) => p.trim().split('='));
    const timestamp = parts.find(([k]) => k === 't')?.[1];
    const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
    if (!timestamp || signatures.length === 0) throw new UnauthorizedException('Firma de Stripe mal formada');

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) {
      throw new UnauthorizedException('Marca de tiempo de la firma fuera de tolerancia');
    }
    const expected = createHmac('sha256', this.webhookSecret as string)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest();
    const valid = signatures.some((sig) => {
      const given = Buffer.from(sig, 'hex');
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
    if (!valid) throw new UnauthorizedException('Firma de Stripe inválida');
  }

  private async request<T>(method: 'GET' | 'POST', path: string, form?: URLSearchParams): Promise<T> {
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(`${STRIPE_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        body: form?.toString(),
      });
    } catch (err) {
      this.logger.error(`No se pudo contactar con Stripe: ${(err as Error).message}`);
      throw new BadGatewayException('No se pudo contactar con la pasarela de pago');
    }
    const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string; type?: string } };
    if (!response.ok) {
      this.logger.error(`Stripe ${method} ${path} -> ${response.status}: ${data.error?.type} ${data.error?.message}`);
      throw new BadGatewayException(`La pasarela de pago rechazó la operación (${data.error?.message ?? response.status})`);
    }
    return data;
  }
}
