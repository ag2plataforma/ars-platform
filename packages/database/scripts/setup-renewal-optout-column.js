#!/usr/bin/env node
/**
 * Agrega (si no existe) la columna `IndNoRenovar` a `TContract` --
 * Etapa 2 de "Gestión de renovaciones" (ver docs/02-roadmap.md): el
 * operador, desde la nueva pantalla "Renovaciones", puede marcar un
 * contrato candidato para que NO se renueve automáticamente al vencer
 * (ej. no rentable para la compañía). Sin esta columna no hay dónde
 * persistir esa decisión.
 *
 * Diseño (decidido junto con el usuario, 2026-10-01): un booleano simple
 * en `TContract` (`default false` = se renueva normalmente), sin tabla
 * de historial aparte -- alcanza con el `UsrModification`/
 * `TstModification` que `TContract` ya tiene para saber quién/cuándo lo
 * cambió por última vez. La Etapa 3 (cron de renovación automática)
 * va a filtrar por `IndNoRenovar=false` antes de renovar.
 *
 * Idempotente: usa `ADD COLUMN IF NOT EXISTS`, se puede correr varias
 * veces sin efecto. Después de correrlo hay que actualizar el cliente
 * Prisma (introspección agrega el campo solo, no hace falta tocar
 * schema.prisma a mano):
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 *
 * Uso (desde la raíz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/setup-renewal-optout-column.js
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
    ALTER TABLE ars_platform."TContract"
      ADD COLUMN IF NOT EXISTS "IndNoRenovar" boolean NOT NULL DEFAULT false
  `);

  const check = await client.query(
    `SELECT count(*)::int AS count FROM ars_platform."TContract" WHERE "IndNoRenovar" = true`,
  );
  console.log('OK. Columna ars_platform."TContract"."IndNoRenovar" lista.');
  console.log(`Contratos marcados "no renovar" actualmente: ${check.rows[0].count}`);

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
