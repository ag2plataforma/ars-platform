import { SmsInvalidRecipientError } from './sms-sender.interface';

/**
 * Normaliza el número guardado (`TContactData.DesContactData`) a solo dígitos
 * en formato internacional (sin `+` ni `00`). Cada proveedor le da después su
 * forma (Brevo: dígitos; Twilio: `+dígitos`).
 *
 * Un número sin `+`/`00` y de hasta 10 dígitos se considera local: se le
 * antepone `defaultCountryCode` (`SMS_DEFAULT_COUNTRY_CODE`). Sin ese valor
 * se rechaza en vez de adivinar el país.
 */
export function normalizeSmsRecipient(raw: string, defaultCountryCode?: string): string {
  const original = (raw ?? '').trim();
  let digits = original.replace(/\D/g, '');
  if (!digits) throw new SmsInvalidRecipientError('El destinatario no tiene número de celular');
  if (original.startsWith('+')) {
    // ya trae código de país
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.length <= 10) {
    const cc = (defaultCountryCode ?? '').replace(/\D/g, '');
    if (!cc) {
      throw new SmsInvalidRecipientError(
        `El número "${original}" no incluye código de país y SMS_DEFAULT_COUNTRY_CODE no está configurada`,
      );
    }
    digits = cc + digits.replace(/^0+/, '');
  }
  if (digits.length < 8 || digits.length > 15) {
    throw new SmsInvalidRecipientError(`El número "${original}" no tiene un formato internacional válido`);
  }
  return digits;
}
