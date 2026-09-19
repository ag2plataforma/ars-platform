#!/usr/bin/env node
/**
 * Utilidad chica para probar el flujo de 2FA por curl sin necesitar un
 * celular a mano: genera el código de 6 dígitos vigente para un secreto
 * TOTP dado. Reimplementa (sin dependencias) el mismo algoritmo que
 * services/iam-service/src/auth/two-factor/totp.util.ts -- ver ese
 * archivo para el detalle y la verificación contra los vectores de
 * prueba de la RFC 6238.
 *
 * Uso:
 *   node packages/database/scripts/generate-totp-code.js <secreto-base32>
 *
 * El secreto es el que devuelve POST /auth/2fa/enroll (campo "secret").
 * En un uso real, ese secreto vive en la app autenticadora (Google
 * Authenticator, Authy, etc.), no en la terminal -- esto es solo para
 * probar el flujo end-to-end sin depender de un celular físico.
 */
const { createHmac } = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input) {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
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

function hotp(secret, counter, digits = 6) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

const secret = process.argv[2];
if (!secret) {
  console.error('Uso: node packages/database/scripts/generate-totp-code.js <secreto-base32>');
  process.exit(1);
}

const counter = Math.floor(Date.now() / 1000 / 30);
console.log(hotp(base32Decode(secret), counter));
