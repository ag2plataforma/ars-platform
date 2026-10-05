#!/usr/bin/env node
/**
 * Colectivos (pólizas colectivas), etapa 1.
 *
 * Crea lo mínimo que el modelo heredado no traía:
 *  - `SProduct."IndCollective"`: el producto se vende como colectivo (un tomador, N
 *    asegurados, un certificado por asegurado).
 *  - `SProduct."CodCollectivePremiumMode"`: cómo se cobra el colectivo. `POR_CERTIFICADO`
 *    (cada asegurado paga su prima, la del motor de reglas) o `UNICA` (una prima única
 *    para todo el colectivo; reservado -- la etapa 1 solo implementa POR_CERTIFICADO).
 *  - `ars_platform."TQuoteRiskPerson"`: la persona asegurada de cada riesgo de una
 *    cotización colectiva (en la cotización no existía ningún enlace riesgo -> persona;
 *    en el contrato el asegurado vive en `TContractFilePerson`, que ya existe).
 *
 * Idempotente. Después de correrlo:
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 * (el código usa SQL crudo para estas columnas/tabla, así que compila igual antes).
 *
 * Uso (desde la raíz del repo, con packages/database/.env configurado):
 *   node packages/database/scripts/setup-collectives.js
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
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE ars_platform."SProduct"
        ADD COLUMN IF NOT EXISTS "IndCollective" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "CodCollectivePremiumMode" varchar(20) NOT NULL DEFAULT 'POR_CERTIFICADO'
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CK_SProduct_CodCollectivePremiumMode') THEN
          ALTER TABLE ars_platform."SProduct"
            ADD CONSTRAINT "CK_SProduct_CodCollectivePremiumMode"
            CHECK ("CodCollectivePremiumMode" IN ('POR_CERTIFICADO', 'UNICA'));
        END IF;
      END $$
    `);
    console.log('= SProduct.IndCollective / CodCollectivePremiumMode listas');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ars_platform."TQuoteRiskPerson" (
        "IdeQuoteRiskPerson" uuid NOT NULL DEFAULT gen_random_uuid(),
        "IdeQuoteRisk" uuid NOT NULL,
        "IdePerson" uuid NOT NULL,
        "UsrCreation" varchar(60) NOT NULL,
        "TstCreation" timestamp(6) NOT NULL,
        "UsrModification" varchar(60) NOT NULL,
        "TstModification" timestamp(6) NOT NULL,
        CONSTRAINT "PK_TQuoteRiskPerson" PRIMARY KEY ("IdeQuoteRiskPerson"),
        CONSTRAINT "UK_TQuoteRiskPerson_01" UNIQUE ("IdeQuoteRisk"),
        CONSTRAINT "FK_TQuoteRiskPerson_TQuoteRisk" FOREIGN KEY ("IdeQuoteRisk") REFERENCES ars_platform."TQuoteRisk" ("IdeQuoteRisk"),
        CONSTRAINT "FK_TQuoteRiskPerson_TPerson" FOREIGN KEY ("IdePerson") REFERENCES ars_platform."TPerson" ("IdePerson")
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS "IX_TQuoteRiskPerson_TPerson" ON ars_platform."TQuoteRiskPerson" ("IdePerson")`,
    );
    console.log('= TQuoteRiskPerson lista');

    await client.query('COMMIT');
    console.log('OK. Colectivos (etapa 1) listos.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
