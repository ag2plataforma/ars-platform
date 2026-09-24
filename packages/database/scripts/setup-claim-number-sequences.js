#!/usr/bin/env node
/**
 * Crea (si no existen) las secuencias reales de Postgres usadas para
 * generar `TClaim.NumClaim`/`TClaimFile.NumClaimFile` -- Fase 4
 * (Siniestros), Etapa 1, 2026-09-24. Mismo criterio explícito que
 * `setup-quote-number-sequence.js`/`setup-contract-number-sequence.js`:
 * secuencia real de Postgres en vez de un `MAX+1` en memoria (riesgo de
 * colisión bajo concurrencia). No hay función legada que reemplazar acá
 * -- Siniestros no tiene ningún PL/pgSQL real (ver
 * `investigate-claims-engine.js`), así que no hay "comportamiento
 * original" que igualar; el formato visible (`SIN-<Año>-<N>`/
 * `SINEXP-<Año>-<N>`) es una decisión nueva de esta implementación.
 *
 * Idempotente: usa `CREATE SEQUENCE IF NOT EXISTS`, se puede correr
 * varias veces sin efecto.
 *
 * Uso (desde la raíz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/setup-claim-number-sequences.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) {
    throw new Error(`No se encontró DATABASE_URL en ${envPath}`);
  }
  return match[1].trim();
}

async function ensureSequence(client, name) {
  await client.query(`CREATE SEQUENCE IF NOT EXISTS ars_platform."${name}" START 1`);
  const check = await client.query(`SELECT last_value, is_called FROM ars_platform."${name}"`);
  console.log(`OK. Secuencia ars_platform."${name}" lista.`);
  console.log(`Estado actual: last_value=${check.rows[0].last_value}, is_called=${check.rows[0].is_called}`);
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  await ensureSequence(client, 'SeqTClaimNumber');
  await ensureSequence(client, 'SeqTClaimFileNumber');

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
