import { createHmac, randomBytes } from 'crypto';

/**
 * TOTP (RFC 6238, sobre HOTP de RFC 4226) implementado a mano con el
 * módulo `crypto` nativo de Node -- sin librería (`otplib` o similar)
 * porque este entorno no puede instalar paquetes nuevos ahora mismo (ver
 * docs/02-roadmap.md), y de paso evita sumar una dependencia externa a
 * algo tan sensible como la verificación de 2FA. Algoritmo estándar,
 * verificado contra los vectores de prueba de la RFC.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
// Sin 0/O/1/I/L para que un código de respaldo escrito a mano no genere
// ambigüedad al transcribirlo.
const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_WINDOW_STEPS = 1; // tolera +/-30s de desfasaje de reloj
const DEFAULT_DIGITS = 6;

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number, digits = DEFAULT_DIGITS): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const modulo = 10 ** digits;
  return (binary % modulo).toString().padStart(digits, '0');
}

/** Genera un secreto TOTP nuevo (160 bits, el tamaño estándar recomendado). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Código TOTP vigente para el instante dado (por defecto, ahora). */
export function generateTotpCode(base32Secret: string, timestamp = Date.now()): string {
  const counter = Math.floor(timestamp / 1000 / DEFAULT_STEP_SECONDS);
  return hotp(base32Decode(base32Secret), counter);
}

/**
 * Verifica un código de 6 dígitos contra el secreto, tolerando +/-1 paso
 * (30s) de desfasaje de reloj -- ventana estándar recomendada por la RFC.
 */
export function verifyTotpCode(base32Secret: string, code: string, timestamp = Date.now()): boolean {
  const normalized = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const secretBuffer = base32Decode(base32Secret);
  const counter = Math.floor(timestamp / 1000 / DEFAULT_STEP_SECONDS);
  for (let drift = -DEFAULT_WINDOW_STEPS; drift <= DEFAULT_WINDOW_STEPS; drift++) {
    if (hotp(secretBuffer, counter + drift) === normalized) {
      return true;
    }
  }
  return false;
}

/** URI `otpauth://` estándar para que una app autenticadora la escanee (QR) o la use por texto. */
export function buildOtpauthUrl(base32Secret: string, accountName: string, issuer = 'ARS Platform'): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: base32Secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Código de respaldo de un solo uso, legible para transcribir a mano. */
export function generateBackupCode(length = 10): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += BACKUP_CODE_ALPHABET[bytes[i] % BACKUP_CODE_ALPHABET.length];
  }
  return code;
}
