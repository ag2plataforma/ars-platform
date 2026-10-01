export interface EmailAttachment {
  /** Nombre de archivo tal como lo verá el destinatario (ej. "Poliza.pdf"). */
  name: string;
  /** Contenido del archivo codificado en base64. */
  contentBase64: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Opcional -- hoy usado por `documents-service` para adjuntar el PDF
   *  de la póliza al correo de bienvenida al activar un contrato (ver
   *  `GenerationService.generateWelcomeEmail`). */
  attachments?: EmailAttachment[];
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
