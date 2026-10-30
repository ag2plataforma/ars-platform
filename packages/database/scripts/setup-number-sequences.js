#!/usr/bin/env node
/**
 * Crea la tabla de contadores sin saltos ars_platform."SNumberSequence" (numero de contrato y de recibo por
 * producto y año). La usa ContractsService.nextSequenceValue dentro de la transaccion de contratacion, asi un
 * numero solo se consume si el contrato/recibo llega a guardarse. Las filas se crean solas al primer uso, partiendo
 * del mayor numero ya existente. Idempotente.
 *
 * Uso: bash scripts/db-run.sh setup-number-sequences.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error(`No se encontro DATABASE_URL en ${envPath}`);
  return match[1].trim();
}

async function main() {
  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS ars_platform."SNumberSequence" (
      "CodSequence"     varchar(80) NOT NULL,
      "NumLast"         integer     NOT NULL,
      "TstModification" timestamp(6) NOT NULL,
      CONSTRAINT "PK_SNumberSequence" PRIMARY KEY ("CodSequence")
    )`);
  const res = await client.query(`SELECT count(*)::int AS n FROM ars_platform."SNumberSequence"`);
  console.log(`OK. Tabla SNumberSequence lista (${res.rows[0].n} contadores).`);
  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
