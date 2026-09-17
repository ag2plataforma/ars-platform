#!/usr/bin/env node
/**
 * Crea (si no existe) la secuencia real de Postgres usada para generar
 * `TContract.NumContract`, de forma atomica y sin riesgo de colision bajo
 * concurrencia.
 *
 * El original (`FContract('GETNUMBER', ...)`) tiene el mismo defecto real
 * confirmado en `FQuote('GETQUOTENUMBER', ...)`: lee el ultimo
 * `TContract.NumContract` del producto (ORDER BY TstCreation DESC LIMIT 1),
 * le parsea el numero de secuencia y le suma 1 en memoria -- bajo dos
 * creaciones de contrato concurrentes del mismo producto, ambas pueden leer
 * el mismo "ultimo" numero y terminar generando el mismo NumContract.
 * Misma decision explicita que para NumQuote (ver docs/02-roadmap.md):
 * reemplazar por una secuencia real de Postgres en vez de replicar el
 * riesgo tal cual.
 *
 * Diferencia de comportamiento aceptada: la secuencia es GLOBAL (no una
 * por producto), asi que el numero visible (`<CodProducto>-<Anio>-<N>`)
 * ya no arranca en 1 para cada producto nuevo -- comparte un unico pool
 * incremental con el resto. El formato visible no cambia.
 *
 * Idempotente: usa `CREATE SEQUENCE IF NOT EXISTS`, se puede correr
 * varias veces sin efecto.
 *
 * Uso (desde la raiz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/setup-contract-number-sequence.js
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
    throw new Error(`No se encontro DATABASE_URL en ${envPath}`);
  }
  return match[1].trim();
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query('CREATE SEQUENCE IF NOT EXISTS ars_platform."SeqTContractNumber" START 1');
  const check = await client.query(`SELECT last_value, is_called FROM ars_platform."SeqTContractNumber"`);
  console.log('OK. Secuencia ars_platform."SeqTContractNumber" lista.');
  console.log(`Estado actual: last_value=${check.rows[0].last_value}, is_called=${check.rows[0].is_called}`);

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
