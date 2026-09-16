import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailMessage, EmailSender } from './email-sender.interface';

/**
 * Envía correo vía la API transaccional de Brevo (antes Sendinblue) —
 * mismo proveedor y mismo endpoint REST que ya usaba `ag2contractmanager`
 * en v1 (`POST https://api.brevo.com/v3/smtp/email`), pero:
 * - por variable de entorno obligatoria, sin API key ni remitente
 *   hardcodeados en el código (v1 sí tenía un email personal hardcodeado
 *   como remitente en algunos templates — ver technical debt doc).
 * - con `fetch` nativo (Node 20+) en vez de agregar `axios` como
 *   dependencia nueva.
 */
@Injectable()
export class BrevoEmailSender implements EmailSender {
  private readonly logger = new Logger(BrevoEmailSender.name);

  constructor(private readonly config: ConfigService) {}

  async send(message: EmailMessage): Promise<void> {
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    const senderEmail = this.config.get<string>('EMAIL_SENDER_ADDRESS');
    const senderName = this.config.get<string>('EMAIL_SENDER_NAME', 'ARS Platform');

    if (!apiKey || !senderEmail) {
      throw new Error(
        'BREVO_API_KEY / EMAIL_SENDER_ADDRESS no están configurados — no se puede enviar correo.',
      );
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Brevo respondió ${response.status}: ${body}`);
      throw new Error(`No se pudo enviar el correo (Brevo respondió ${response.status}).`);
    }
  }
}
