#!/usr/bin/env node
/**
 * Colectivos, etapa 2c: prima ÚNICA con tarifa por tramos de nº de asegurados.
 *
 * Crea `ars_platform."SProductCollectiveTier"`: por producto colectivo con modo de prima
 * `UNICA`, los tramos "desde N hasta M asegurados -> importe ANUAL por asegurado (prima total)".
 * Se busca el tramo donde cae el nº total de asegurados activos y TODOS pagan esa tarifa
 * (prima del colectivo = nº de asegurados x tarifa del tramo). `NumTo` NULL = sin tope.
 *
 * Idempotente. Uso (desde la raíz del repo):
 *   node packages/database/scripts/setup-collective-tiers.js
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
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ars_platform."SProductCollectiveTier" (
        "IdeProductCollectiveTier" uuid NOT NULL DEFAULT gen_random_uuid(),
        "IdeProduct" uuid NOT NULL,
        "NumFrom" integer NOT NULL,
        "NumTo" integer NULL,
        "AmtPerInsured" numeric(14,2) NOT NULL,
        "UsrCreation" varchar(60) NOT NULL,
        "TstCreation" timestamp(6) NOT NULL,
        "UsrModification" varchar(60) NOT NULL,
        "TstModification" timestamp(6) NOT NULL,
        CONSTRAINT "PK_SProductCollectiveTier" PRIMARY KEY ("IdeProductCollectiveTier"),
        CONSTRAINT "UK_SProductCollectiveTier_01" UNIQUE ("IdeProduct", "NumFrom"),
        CONSTRAINT "FK_SProductCollectiveTier_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct" ("IdeProduct"),
        CONSTRAINT "CK_SProductCollectiveTier_Range" CHECK ("NumFrom" >= 1 AND ("NumTo" IS NULL OR "NumTo" >= "NumFrom")),
        CONSTRAINT "CK_SProductCollectiveTier_Amt" CHECK ("AmtPerInsured" > 0)
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS "IX_SProductCollectiveTier_SProduct" ON ars_platform."SProductCollectiveTier" ("IdeProduct")`,
    );
    await client.query('COMMIT');
    console.log('OK. SProductCollectiveTier lista.');
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
