#!/usr/bin/env node
/**
 * Fase 4 (IA) -- extracción de datos de documentos de requisitos.
 *
 * 1) `SProductRequirement."DesExtractionHint"`: pista opcional (texto libre) de qué
 *    datos debe buscar la IA en el documento de ese requisito
 *    (p. ej. "nombre, número de documento, fecha de nacimiento"). La IA solo se
 *    ofrece en los requisitos con `IndApplyOCR = true`.
 *
 * 2) `ars_platform."TAiRequest"`: trazabilidad de CADA llamada a la IA (quién la pidió,
 *    para qué entidad, con qué archivo -- nombre, tamaño y huella SHA-256, NO el
 *    contenido --, proveedor/modelo, tokens, resultado). Es lo que permite auditar
 *    qué datos personales salieron hacia un proveedor externo.
 *
 * Idempotente. Después de correrlo:
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 * (el código usa SQL crudo para estas columnas/tablas, así que compila igual antes).
 *
 * Uso (desde la raíz del repo, con packages/database/.env configurado):
 *   node packages/database/scripts/setup-ai-extraction.js
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

    await client.query(`ALTER TABLE ars_platform."SProductRequirement" ADD COLUMN IF NOT EXISTS "DesExtractionHint" varchar(500)`);
    console.log('= SProductRequirement.DesExtractionHint lista');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ars_platform."TAiRequest" (
        "IdeAiRequest" uuid NOT NULL DEFAULT gen_random_uuid(),
        "CodTask" varchar(30) NOT NULL,
        "CodEntity" varchar(30) NOT NULL,
        "IdeEntity" uuid NOT NULL,
        "CodProvider" varchar(30) NOT NULL,
        "DesModel" varchar(80),
        "DesFileName" varchar(255),
        "NumFileBytes" integer,
        "DesFileHash" varchar(64),
        "CodStatus" varchar(15) NOT NULL DEFAULT 'PENDIENTE',
        "NumFields" integer,
        "NumInputTokens" integer,
        "NumOutputTokens" integer,
        "DesError" varchar(500),
        "UsrCreation" varchar(60) NOT NULL,
        "TstCreation" timestamp(6) NOT NULL,
        "UsrModification" varchar(60) NOT NULL,
        "TstModification" timestamp(6) NOT NULL,
        CONSTRAINT "PK_TAiRequest" PRIMARY KEY ("IdeAiRequest"),
        CONSTRAINT "CK_TAiRequest_CodStatus" CHECK ("CodStatus" IN ('PENDIENTE', 'OK', 'ERROR'))
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS "IX_TAiRequest_Entity" ON ars_platform."TAiRequest" ("CodEntity", "IdeEntity", "TstCreation" DESC)`,
    );
    console.log('= TAiRequest lista');

    await client.query('COMMIT');
    console.log('OK. Extracción con IA lista.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
