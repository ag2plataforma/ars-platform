import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeSmsRecipient } from './sms-recipient';
import { SmsConfigError, SmsInvalidRecipientError, SmsMessage, SmsSender } from './sms-sender.interface';

/**
 * Envía SMS transaccionales vía Brevo (`POST /v3/transactionalSMS/sms`), con
 * la MISMA `BREVO_API_KEY` que el correo. Variables de entorno:
 *  - `BREVO_API_KEY` (obligatoria).
 *  - `SMS_SENDER_NAME` (remitente; alfanumérico de hasta 11 caracteres o numérico
 *    de hasta 15; default `ARS`).
 *  - `SMS_DEFAULT_COUNTRY_CODE` (opcional, solo dígitos, ej. `507`): se antepone
 *    a los números guardados SIN código de país (sin `+` ni `00` y de hasta 10
 *    dígitos). Sin esta variable, esos números se rechazan en vez de adivinar
 *    el país.
 *
 * Brevo exige el destinatario en formato internacional SIN `+` (ej. `50761234567`).
 * Los errores 4xx de Brevo (número inválido, sin crédito, remitente no
 * permitido) se informan con su mensaje; los 5xx/red se reintentan (el worker
 * los trata como transitorios).
 */
@Injectable()
export class BrevoSmsSender implements SmsSender {
  private readonly logger = new Logger(BrevoSmsSender.name);

  constructor(private readonly config: ConfigService) {}

  async send(message: SmsMessage): Promise<void> {
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    if (!apiKey) {
      throw new SmsConfigError('BREVO_API_KEY no está configurada — no se puede enviar SMS.');
    }
    const sender = this.config.get<string>('SMS_SENDER_NAME', 'ARS');
    const recipient = normalizeSmsRecipient(message.to, this.config.get<string>('SMS_DEFAULT_COUNTRY_CODE'));

    const response = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender, recipient, content: message.content, type: 'transactional' }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Brevo SMS respondió ${response.status}: ${body}`);
      const detail = this.extractMessage(body);
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new SmsInvalidRecipientError(`Brevo rechazó el SMS (${response.status}): ${detail}`);
      }
      throw new Error(`No se pudo enviar el SMS (Brevo respondió ${response.status}): ${detail}`);
    }
  }

  private extractMessage(body: string): string {
    try {
      const parsed = JSON.parse(body) as { message?: string };
      return parsed.message ?? body;
    } catch {
      return body || 'sin detalle';
    }
  }
}
