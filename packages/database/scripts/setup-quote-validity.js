#!/usr/bin/env node
/**
 * Agrega a `TQuote` la vigencia pedida en la cotización:
 *   - "TstInitial": fecha de inicio de la cotización/póliza (NULL = la fecha de contratación).
 *   - "TstEnd":     fecha de fin (solo productos de vigencia TEMPORAL; NULL = la que resuelva el producto,
 *                   p. ej. el campo "duración en días", o +1 año si no hay).
 * Las dos son DATE (sin hora). Idempotente (`ADD COLUMN IF NOT EXISTS`).
 *
 * Uso (en el VPS): bash deploy/scripts/db-run.sh setup-quote-validity.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const match = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error(`No se encontro DATABASE_URL en ${envPath}`);
  return match[1].trim();
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  await client.connect();
  await client.query('ALTER TABLE ars_platform."TQuote" ADD COLUMN IF NOT EXISTS "TstInitial" date');
  await client.query('ALTER TABLE ars_platform."TQuote" ADD COLUMN IF NOT EXISTS "TstEnd" date');
  const check = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'ars_platform' AND table_name = 'TQuote' AND column_name IN ('TstInitial','TstEnd') ORDER BY 1`,
  );
  console.log('OK. Columnas de TQuote:', check.rows.map((r) => `${r.column_name} (${r.data_type})`).join(', '));
  await client.end();
}
main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
