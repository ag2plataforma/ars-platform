#!/usr/bin/env node
/**
 * Agrega (si no existe) la columna `TstRenewalNoticeSent` a `TContract`
 * -- sub-item pendiente de la Etapa 3 de "Gestión de renovaciones" (ver
 * docs/02-roadmap.md): el aviso automático por email al cliente antes
 * del vencimiento de su contrato (`RenewalNoticeJobHandler`).
 *
 * Diseño (decidido junto con el usuario, 2026-10-01): timestamp nullable
 * en `TContract` -- `NULL` significa "todavía no se avisó de este
 * ciclo de renovación", se fija a `now()` cuando el job envía el aviso.
 * `ContractsService.renew()` lo vuelve a poner en `NULL` al renovar
 * (nuevo `TstEnd`), para que el PRÓXIMO ciclo dispare un aviso nuevo.
 * Sin tabla de historial aparte -- alcanza con esta sola columna,
 * mismo criterio que `IndNoRenovar` (ver
 * setup-renewal-optout-column.js).
 *
 * Idempotente: usa `ADD COLUMN IF NOT EXISTS`, se puede correr varias
 * veces sin efecto. Después de correrlo hay que actualizar el cliente
 * Prisma (introspección agrega el campo solo, no hace falta tocar
 * schema.prisma a mano):
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 *
 * Uso (desde la raíz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/setup-renewal-notice-column.js
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
    ALTER TABLE ars_platform."TContract"
      ADD COLUMN IF NOT EXISTS "TstRenewalNoticeSent" timestamp(6) NULL
  `);

  const check = await client.query(
    `SELECT count(*)::int AS count FROM ars_platform."TContract" WHERE "TstRenewalNoticeSent" IS NOT NULL`,
  );
  console.log('OK. Columna ars_platform."TContract"."TstRenewalNoticeSent" lista.');
  console.log(`Contratos ya notificados actualmente: ${check.rows[0].count}`);

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
