#!/usr/bin/env node
/**
 * Fase 4 (IA) -- triage y priorización de siniestros.
 *
 * Requiere haber corrido antes `setup-ai-extraction.js` (tabla `TAiRequest`, la
 * trazabilidad de las llamadas a la IA).
 *
 * `ars_platform."TClaimTriage"`: una fila por cada triage pedido sobre una carpeta de
 * siniestro (`TClaimFile`). Guarda la SUGERENCIA de la IA (prioridad, complejidad,
 * resumen, motivos y próximos pasos) y, aparte, la DECISIÓN humana (prioridad
 * confirmada o cambiada, quién y cuándo). La IA solo sugiere; vale lo que decida la
 * persona. Volver a pedir un triage crea una fila nueva (queda el historial).
 *
 * Idempotente. Después de correrlo:
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 * (el código usa SQL crudo para esta tabla, así que compila igual antes de eso).
 *
 * Uso (desde la raíz del repo, con packages/database/.env configurado):
 *   node packages/database/scripts/setup-claim-triage.js
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

    const hasTrace = await client.query(`SELECT to_regclass('ars_platform."TAiRequest"') AS t`);
    if (!hasTrace.rows[0].t) throw new Error('Falta la tabla TAiRequest -- corré primero setup-ai-extraction.js');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ars_platform."TClaimTriage" (
        "IdeClaimTriage" uuid NOT NULL DEFAULT gen_random_uuid(),
        "IdeClaimFile" uuid NOT NULL,
        "IdeAiRequest" uuid,
        "CodPriority" varchar(10) NOT NULL,
        "CodComplexity" varchar(10) NOT NULL,
        "DesSummary" varchar(1000) NOT NULL,
        "DesReasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "DesNextSteps" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "DesModel" varchar(80),
        "CodPriorityFinal" varchar(10),
        "DesDecisionNote" varchar(500),
        "UsrDecision" varchar(60),
        "TstDecision" timestamp(6),
        "UsrCreation" varchar(60) NOT NULL,
        "TstCreation" timestamp(6) NOT NULL,
        "UsrModification" varchar(60) NOT NULL,
        "TstModification" timestamp(6) NOT NULL,
        CONSTRAINT "PK_TClaimTriage" PRIMARY KEY ("IdeClaimTriage"),
        CONSTRAINT "FK_TClaimTriage_TClaimFile" FOREIGN KEY ("IdeClaimFile") REFERENCES ars_platform."TClaimFile" ("IdeClaimFile"),
        CONSTRAINT "CK_TClaimTriage_CodPriority" CHECK ("CodPriority" IN ('URGENTE', 'ALTA', 'NORMAL', 'BAJA')),
        CONSTRAINT "CK_TClaimTriage_CodPriorityFinal"
          CHECK ("CodPriorityFinal" IS NULL OR "CodPriorityFinal" IN ('URGENTE', 'ALTA', 'NORMAL', 'BAJA')),
        CONSTRAINT "CK_TClaimTriage_CodComplexity" CHECK ("CodComplexity" IN ('SIMPLE', 'MEDIA', 'COMPLEJA'))
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS "IX_TClaimTriage_ClaimFile" ON ars_platform."TClaimTriage" ("IdeClaimFile", "TstCreation" DESC)`,
    );
    console.log('= TClaimTriage lista');

    await client.query('COMMIT');
    console.log('OK. Triage de siniestros listo.');
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
