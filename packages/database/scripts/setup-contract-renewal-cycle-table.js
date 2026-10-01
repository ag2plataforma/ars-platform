#!/usr/bin/env node
/**
 * Crea (si no existe) la tabla `TContractRenewalCycle`, nueva por
 * completo -- no hay nada legado que preservar acá (confirmado contra
 * docs/01-especificacion-motor-negocio-actual.md: ninguna de las 44
 * funciones PL/pgSQL originales implementa renovación). Es el historial
 * de renovaciones de un contrato (backlog item 2, ver docs/02-roadmap.md,
 * "Gestión de renovaciones").
 *
 * Diseño (decidido junto con el usuario, 2026-09-29): una fila por cada
 * vez que `ContractsService.renew()` corre exitosamente -- `TstTrigger`
 * es el `TstEnd` que tenía el contrato ANTES de renovarse, `TstRenewed`
 * cuándo se ejecutó la renovación. Todavía SIN columnas de notificación/
 * opt-out del cliente/operador -- esas llegan en las etapas 2/3 (pantalla
 * de candidatos a renovar y aviso automático por email), se agregan con
 * un ALTER TABLE cuando se implementen esas etapas.
 *
 * Idempotente: usa `CREATE TABLE IF NOT EXISTS`, se puede correr varias
 * veces sin efecto. Después de correrlo hay que actualizar el cliente
 * Prisma (el schema.prisma de este repo ya tiene el modelo
 * `TContractRenewalCycle` agregado -- `db:pull` lo va a confirmar contra
 * la BD real, no lo va a pisar):
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 *
 * Uso (desde la raíz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/setup-contract-renewal-cycle-table.js
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
    CREATE TABLE IF NOT EXISTS ars_platform."TContractRenewalCycle" (
      "IdeContractRenewalCycle" uuid NOT NULL DEFAULT gen_random_uuid(),
      "IdeContract" uuid NOT NULL,
      "TstTrigger" timestamp(6) NOT NULL,
      "TstRenewed" timestamp(6) NOT NULL,
      "UsrCreation" varchar(60) NOT NULL,
      "TstCreation" timestamp(6) NOT NULL,
      "UsrModification" varchar(60) NOT NULL,
      "TstModification" timestamp(6) NOT NULL,
      CONSTRAINT "PK_TContractRenewalCycle" PRIMARY KEY ("IdeContractRenewalCycle"),
      CONSTRAINT "FK_TContractRenewalCycle_TContract" FOREIGN KEY ("IdeContract")
        REFERENCES ars_platform."TContract" ("IdeContract")
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS "IX_TContractRenewalCycle_TContract"
      ON ars_platform."TContractRenewalCycle" ("IdeContract")
  `);

  const check = await client.query(`SELECT count(*)::int AS count FROM ars_platform."TContractRenewalCycle"`);
  console.log('OK. Tabla ars_platform."TContractRenewalCycle" lista.');
  console.log(`Filas actuales: ${check.rows[0].count}`);

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
