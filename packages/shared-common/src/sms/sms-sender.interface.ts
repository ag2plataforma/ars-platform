export interface SmsMessage {
  /** Número del destinatario tal como está guardado (`TContactData.DesContactData`);
   *  el adaptador lo normaliza al formato que exige el proveedor. */
  to: string;
  /** Texto del SMS (sin tildes cuando se pueda: los acentos reducen el largo por mensaje). */
  content: string;
}

/**
 * Puerto de envío de SMS -- mismo patrón que `EmailSender`: interfaz en
 * shared-common, implementación concreta (hoy Brevo) bindeada por
 * proveedor; cualquier servicio inyecta `SMS_SENDER`, no el proveedor.
 */
export interface SmsSender {
  send(message: SmsMessage): Promise<void>;
}

export const SMS_SENDER = Symbol('SMS_SENDER');

/** Falta configuración del proveedor (API key, remitente): reintentar no la arregla. */
export class SmsConfigError extends Error {}

/** El número del destinatario no sirve (vacío, demasiado corto/largo, sin código de país): reintentar no lo arregla. */
export class SmsInvalidRecipientError extends Error {}
