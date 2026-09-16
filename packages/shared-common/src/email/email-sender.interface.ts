export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

/**
 * Puerto de envío de correo — mismo patrón que `StateRuleRepository`
 * (interfaz en shared-common, implementación concreta bindeada por
 * proveedor). Hoy solo hay una implementación (Brevo), pero cualquier
 * servicio que necesite enviar correo (confirmaciones de contrato,
 * recibos, notificaciones de siniestros — todo lo que v1 tenía
 * hardcodeado por servicio) inyecta `EMAIL_SENDER`, no Brevo directamente.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
