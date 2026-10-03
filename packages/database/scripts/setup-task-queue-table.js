#!/usr/bin/env node
/**
 * Crea (si no existe) la tabla de la COLA DE TAREAS en segundo plano
 * (`TBackgroundTask`) -- roadmap Fase 2, ítem "Cola en segundo plano".
 *
 * Es distinta de `SBackgroundJob`/`TBackgroundJobRun` (ver
 * `setup-background-jobs-tables.js`): aquellas son trabajos PROGRAMADOS por
 * horario (cron, ej. renovación automática). Ésta es una cola de trabajo
 * PUNTUAL, encolado por una acción del usuario (ej. "Activar contrato"
 * encola el correo de bienvenida; "Generar documento" encola la generación
 * del PDF) y consumido por un worker que reintenta con espera creciente.
 *
 * Una fila = una tarea:
 *  - `CodTaskType`: qué hacer (WELCOME_EMAIL, GENERATE_DOCUMENT, ...).
 *  - `IdeEntity`: a qué se refiere (hoy siempre el IdeContract) -- sirve
 *    para listar las tareas de un contrato en pantalla.
 *  - `DesPayload` (jsonb): parámetros de la tarea.
 *  - `DesResult` (jsonb): resultado/progreso (ej. id del documento ya
 *    generado, para no duplicarlo si el correo se reintenta).
 *  - `CodStatus`: PENDIENTE -> EN_PROCESO -> COMPLETADA | FALLIDA
 *    (columna simple con CHECK, no la máquina de estados SState: los
 *    estados de una cola son internos de infraestructura, no del negocio).
 *  - `NumAttempts`/`NumMaxAttempts`/`TstNextAttempt`: reintentos con
 *    espera exponencial.
 *
 * Idempotente (`IF NOT EXISTS`). Después de correrlo:
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 *
 * Uso (desde la raíz del repo, con packages/database/.env configurado):
 *   node packages/database/scripts/setup-task-queue-table.js
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

  await client.query(`
    CREATE TABLE IF NOT EXISTS ars_platform."TBackgroundTask" (
      "IdeBackgroundTask" uuid NOT NULL DEFAULT gen_random_uuid(),
      "CodTaskType" varchar(50) NOT NULL,
      "IdeEntity" uuid,
      "DesPayload" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "DesResult" jsonb,
      "CodStatus" varchar(20) NOT NULL DEFAULT 'PENDIENTE',
      "NumAttempts" integer NOT NULL DEFAULT 0,
      "NumMaxAttempts" integer NOT NULL DEFAULT 5,
      "TstNextAttempt" timestamp(6) NOT NULL,
      "TstStarted" timestamp(6),
      "TstFinished" timestamp(6),
      "DesError" varchar,
      "UsrCreation" varchar(60) NOT NULL,
      "TstCreation" timestamp(6) NOT NULL,
      "UsrModification" varchar(60) NOT NULL,
      "TstModification" timestamp(6) NOT NULL,
      CONSTRAINT "PK_TBackgroundTask" PRIMARY KEY ("IdeBackgroundTask"),
      CONSTRAINT "CK_TBackgroundTask_CodStatus"
        CHECK ("CodStatus" IN ('PENDIENTE', 'EN_PROCESO', 'COMPLETADA', 'FALLIDA'))
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS "IX_TBackgroundTask_Status_NextAttempt"
      ON ars_platform."TBackgroundTask" ("CodStatus", "TstNextAttempt")
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS "IX_TBackgroundTask_IdeEntity"
      ON ars_platform."TBackgroundTask" ("IdeEntity", "TstCreation" DESC)
  `);

  const count = await client.query(`SELECT count(*)::int AS count FROM ars_platform."TBackgroundTask"`);
  console.log('OK. Tabla de la cola de tareas lista.');
  console.log(`TBackgroundTask: ${count.rows[0].count} fila(s).`);

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
