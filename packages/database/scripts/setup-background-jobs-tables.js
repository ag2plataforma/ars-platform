#!/usr/bin/env node
/**
 * Crea (si no existen) las tablas GENÉRICAS de administración de
 * "trabajos en segundo plano" -- reemplaza el diseño inicial de Etapa 3
 * de "Gestión de renovaciones" (que era específico de renovaciones,
 * `SRenewalBatchConfig`/`TRenewalBatchRun`, nunca llegó a correrse
 * contra la base real). Pedido explícito del usuario (2026-10-01): la
 * pantalla/infraestructura de jobs debe servir para CUALQUIER proceso
 * en segundo plano futuro, no solo renovaciones (ver
 * `BackgroundJobHandler` en underwriting-service).
 *
 * - `SBackgroundJob`: una fila por cada job registrado por el backend
 *   (identificado por `CodJob`, ej. "RENOVACION_AUTOMATICA" -- la crea
 *   `BackgroundJobsService` sola la primera vez que arranca el servicio
 *   y encuentra un handler nuevo, con valores por defecto inactivo/02:00).
 *   `IndActive` + `NumHour`/`NumMinute` (horario "simple" acordado con
 *   el usuario -- hora del día, no una expresión cron completa).
 * - `TBackgroundJobRun`: una fila por cada corrida completa de un job
 *   (manual, vía "Ejecutar ahora", o automática por el cron) --
 *   `NumSucceeded`/`NumFailed`/`NumSkipped` (semántica de cada uno la
 *   define el handler, ej. para renovaciones: contratos renovados,
 *   fallidos, saltados por "No renovar") + `DesDetail` (resumen legible
 *   opcional) y `DesError` (solo si el job COMPLETO explotó, no un ítem
 *   puntual del lote).
 *
 * Idempotente: usa `CREATE TABLE IF NOT EXISTS`, se puede correr varias
 * veces sin efecto. Después de correrlo hay que actualizar el cliente
 * Prisma (introspección agrega los modelos solos):
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 *
 * Uso (desde la raíz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/setup-background-jobs-tables.js
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
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS ars_platform."SBackgroundJob" (
      "IdeBackgroundJob" uuid NOT NULL DEFAULT gen_random_uuid(),
      "CodJob" varchar(50) NOT NULL,
      "DesJob" varchar(200) NOT NULL,
      "IndActive" boolean NOT NULL DEFAULT false,
      "NumHour" integer NOT NULL DEFAULT 2,
      "NumMinute" integer NOT NULL DEFAULT 0,
      "UsrCreation" varchar(60) NOT NULL,
      "TstCreation" timestamp(6) NOT NULL,
      "UsrModification" varchar(60) NOT NULL,
      "TstModification" timestamp(6) NOT NULL,
      CONSTRAINT "PK_SBackgroundJob" PRIMARY KEY ("IdeBackgroundJob"),
      CONSTRAINT "UQ_SBackgroundJob_CodJob" UNIQUE ("CodJob"),
      CONSTRAINT "CK_SBackgroundJob_NumHour" CHECK ("NumHour" BETWEEN 0 AND 23),
      CONSTRAINT "CK_SBackgroundJob_NumMinute" CHECK ("NumMinute" BETWEEN 0 AND 59)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ars_platform."TBackgroundJobRun" (
      "IdeBackgroundJobRun" uuid NOT NULL DEFAULT gen_random_uuid(),
      "IdeBackgroundJob" uuid NOT NULL,
      "TstStart" timestamp(6) NOT NULL,
      "TstEnd" timestamp(6) NOT NULL,
      "IndManual" boolean NOT NULL,
      "NumSucceeded" integer NOT NULL DEFAULT 0,
      "NumFailed" integer NOT NULL DEFAULT 0,
      "NumSkipped" integer NOT NULL DEFAULT 0,
      "DesDetail" varchar,
      "DesError" varchar,
      "UsrCreation" varchar(60) NOT NULL,
      "TstCreation" timestamp(6) NOT NULL,
      "UsrModification" varchar(60) NOT NULL,
      "TstModification" timestamp(6) NOT NULL,
      CONSTRAINT "PK_TBackgroundJobRun" PRIMARY KEY ("IdeBackgroundJobRun"),
      CONSTRAINT "FK_TBackgroundJobRun_SBackgroundJob" FOREIGN KEY ("IdeBackgroundJob")
        REFERENCES ars_platform."SBackgroundJob" ("IdeBackgroundJob")
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS "IX_TBackgroundJobRun_IdeBackgroundJob_TstStart"
      ON ars_platform."TBackgroundJobRun" ("IdeBackgroundJob", "TstStart" DESC)
  `);

  const jobCount = await client.query(`SELECT count(*)::int AS count FROM ars_platform."SBackgroundJob"`);
  const runCount = await client.query(`SELECT count(*)::int AS count FROM ars_platform."TBackgroundJobRun"`);
  console.log('OK. Tablas genéricas de trabajos en segundo plano listas.');
  console.log(`SBackgroundJob: ${jobCount.rows[0].count} fila(s).`);
  console.log(`TBackgroundJobRun: ${runCount.rows[0].count} fila(s).`);

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
