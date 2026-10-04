import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeSmsRecipient } from './sms-recipient';
import { SmsConfigError, SmsInvalidRecipientError, SmsMessage, SmsSender } from './sms-sender.interface';

/**
 * Envía SMS vía Twilio (`POST /2010-04-01/Accounts/{sid}/Messages.json`).
 * Variables de entorno:
 *  - `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN` (obligatorias).
 *  - `TWILIO_FROM`: número de Twilio en formato E.164 (ej. `+15551234567`) o
 *    remitente alfanumérico donde el país lo permita; o bien
 *    `TWILIO_MESSAGING_SERVICE_SID` (`MG...`), que tiene prioridad sobre `TWILIO_FROM`.
 *  - `SMS_DEFAULT_COUNTRY_CODE` (opcional): ver `normalizeSmsRecipient`.
 *
 * Cuenta de prueba (trial): Twilio solo envía a números verificados en la
 * consola y NO permite texto propio ni `From`: el `Body` debe ser el nombre de
 * una plantilla predefinida (`sms_account_alerts`, `sms_order_confirmation`,
 * `sms_appointment_reminders`, ...; error 572006 si no). Con
 * `TWILIO_TRIAL_TEMPLATE=<plantilla>` se envía esa plantilla (sin `From`) en
 * vez del texto real -- sirve para comprobar que el SMS llega, no para ver el
 * contenido; el texto real queda en el log del servicio. Se quita al
 * mejorar la cuenta.
 *
 * Errores: 401/403 (credenciales) → `SmsConfigError`; otros 4xx excepto 429
 * (número inválido, no verificado en trial, sin saldo...) →
 * `SmsInvalidRecipientError` (permanentes, no se reintentan); 429/5xx/red →
 * `Error` común (el worker reintenta).
 */
@Injectable()
export class TwilioSmsSender implements SmsSender {
  private readonly logger = new Logger(TwilioSmsSender.name);

  constructor(private readonly config: ConfigService) {}

  async send(message: SmsMessage): Promise<void> {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!sid || !token) {
      throw new SmsConfigError('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN no están configuradas — no se puede enviar SMS.');
    }
    const trialTemplate = (this.config.get<string>('TWILIO_TRIAL_TEMPLATE') ?? '').trim();
    const messagingServiceSid = this.config.get<string>('TWILIO_MESSAGING_SERVICE_SID');
    const from = this.config.get<string>('TWILIO_FROM');
    if (!trialTemplate && !messagingServiceSid && !from) {
      throw new SmsConfigError('Falta TWILIO_FROM o TWILIO_MESSAGING_SERVICE_SID — no se puede enviar SMS.');
    }

    const to = `+${normalizeSmsRecipient(message.to, this.config.get<string>('SMS_DEFAULT_COUNTRY_CODE'))}`;
    const form = new URLSearchParams({ To: to });
    if (trialTemplate) {
      // Trial: solo `To`, `Body` (= nombre de plantilla) y `StatusCallback`.
      form.set('Body', trialTemplate);
      this.logger.warn(`Twilio trial: se envía la plantilla "${trialTemplate}" en lugar del texto real: "${message.content}"`);
    } else {
      form.set('Body', message.content);
      if (messagingServiceSid) form.set('MessagingServiceSid', messagingServiceSid);
      else form.set('From', from as string);
    }

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
    });

    if (response.ok) return;

    const body = await response.text().catch(() => '');
    this.logger.error(`Twilio respondió ${response.status}: ${body}`);
    const detail = this.extractMessage(body);
    if (response.status === 401 || response.status === 403) {
      throw new SmsConfigError(`Twilio rechazó las credenciales (${response.status}): ${detail}`);
    }
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      throw new SmsInvalidRecipientError(`Twilio rechazó el SMS (${response.status}): ${detail}`);
    }
    throw new Error(`No se pudo enviar el SMS (Twilio respondió ${response.status}): ${detail}`);
  }

  private extractMessage(body: string): string {
    try {
      const parsed = JSON.parse(body) as { message?: string; code?: number };
      return parsed.message ? `${parsed.message}${parsed.code ? ` (código ${parsed.code})` : ''}` : body;
    } catch {
      return body || 'sin detalle';
    }
  }
}
