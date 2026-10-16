#!/usr/bin/env node
/**
 * Prepara la BD para los "campos personalizados a nivel de producto" y el
 * multirriesgo (ver docs/02-roadmap.md, "Hallazgos de las pruebas", punto 12):
 *
 *  - ars_platform."SProduct"."IndMultiRisk" boolean default false:
 *    si es false la cotizacion tiene un solo riesgo (cantidad fija = 1).
 *  - ars_platform."SAttributeProperty"."CodStage" varchar(10) default 'PRICING':
 *    PRICING  = el campo se pide al cotizar (y el contrato lo hereda);
 *    CONTRACT = el campo se pide solo al contratar.
 *  - ars_platform."TQuote"."GenericAttributeValue" json y
 *    ars_platform."TContractFile"."GenericAttributeValue" json:
 *    valores de los campos de nivel producto (el motor los busca primero en
 *    el JSON del riesgo y, si no esta, aqui; asi las cotizaciones antiguas
 *    siguen funcionando).
 *
 * Idempotente (ADD COLUMN IF NOT EXISTS). Uso (desde la raiz del repo):
 *   node packages/database/scripts/setup-generic-attributes.js
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

  const statements = [
    `ALTER TABLE ars_platform."SProduct" ADD COLUMN IF NOT EXISTS "IndMultiRisk" boolean NOT NULL DEFAULT false`,
    `ALTER TABLE ars_platform."SAttributeProperty" ADD COLUMN IF NOT EXISTS "CodStage" varchar(10) NOT NULL DEFAULT 'PRICING'`,
    `ALTER TABLE ars_platform."TQuote" ADD COLUMN IF NOT EXISTS "GenericAttributeValue" json`,
    `ALTER TABLE ars_platform."TContractFile" ADD COLUMN IF NOT EXISTS "GenericAttributeValue" json`,
  ];
  for (const sql of statements) await client.query(sql);

  const stages = await client.query(
    `SELECT "CodStage", count(*)::int AS n FROM ars_platform."SAttributeProperty" GROUP BY 1`,
  );
  console.log('OK. Columnas listas. Campos por etapa:', JSON.stringify(stages.rows));
  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
