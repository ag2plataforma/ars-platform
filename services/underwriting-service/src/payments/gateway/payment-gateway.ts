/**
 * Puerto de pasarela de pago (mismo patrón que `SMS_SENDER`): el resto del
 * sistema habla SOLO con esta interfaz, y el proveedor concreto se elige por
 * `PAYMENT_PROVIDER` en el `.env` (`sandbox` para pruebas, `stripe` real).
 * Las credenciales de cada proveedor viven únicamente en el `.env`.
 */
export interface CheckoutSessionInput {
  ideLink: string;
  ideContract: string;
  /** Importe en unidades de la moneda (no en céntimos). */
  amount: number;
  /** Código ISO de la moneda (EUR). */
  currency: string;
  description: string;
  customerEmail: string | null;
  /** URL de la landing a la que la pasarela devuelve al cliente al terminar. */
  returnUrl: string;
}

export interface CheckoutSession {
  /** Id de la sesión/pago en la pasarela (único por proveedor). */
  externalId: string;
  /** URL de la página de pago a la que se redirige al tomador. */
  redirectUrl: string;
}

export type PaymentEventType = 'PAID' | 'FAILED';

/** Evento de la pasarela ya normalizado (lo que entiende `PaymentEventsService`). */
export interface PaymentEvent {
  type: PaymentEventType;
  codProvider: string;
  externalId: string;
  /** Importe confirmado por la pasarela, si lo informa (se compara con el esperado). */
  amount?: number | null;
  payload: Record<string, unknown>;
}

export interface PaymentGateway {
  readonly codProvider: string;
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession>;
  /**
   * Interpreta (y VERIFICA, p. ej. la firma) la notificación de la pasarela.
   * Devuelve `null` si el evento no es relevante; lanza si la verificación falla.
   */
  parseWebhook(
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
    /** Cuerpo crudo exacto de la petición (necesario para verificar firmas HMAC). */
    rawBody?: Buffer,
  ): Promise<PaymentEvent | null>;
  /**
   * Opcional: consulta a la pasarela el estado actual de una sesión y lo
   * devuelve como evento (o `null` si sigue pendiente). Red de seguridad por si
   * el webhook no llega; el proveedor `sandbox` no la implementa.
   */
  retrieveEvent?(externalId: string): Promise<PaymentEvent | null>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
