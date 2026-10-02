#!/usr/bin/env node
/**
 * Agrega (si no existen) las columnas necesarias para la Etapa 2 de
 * "Requisitos" (ver docs/02-roadmap.md, ítem 4): subida real de archivo
 * para un documento exigido, en vez del toggle "Entregado" sin archivo
 * de la Etapa 1.
 *
 * Mismo criterio ya usado para plantillas de documentos (ver
 * setup-document-templates-columns.js): archivo guardado directo en
 * Postgres como bytea, sin Cloudinary/S3 -- evita sumar infraestructura
 * nueva (ADR docs/00-arquitectura.md).
 *
 * - `TQuoteRequirement.FileData` (bytea, nullable): archivo subido en el
 *   paso "Requisitos" del wizard de Cotización.
 * - `TQuoteRequirement.DesFileName` (varchar, nullable): nombre de
 *   archivo original, para mostrar/descargar.
 * - `TContractRequirement.FileData` (bytea, nullable): archivo del
 *   mismo requisito ya copiado al contrato (o subido directo ahí, en la
 *   pestaña "Requisitos" del detalle de contrato).
 * - `TContractRequirement.DesFileName` (varchar, nullable).
 *
 * Idempotente: usa `ADD COLUMN IF NOT EXISTS`, se puede correr varias
 * veces sin efecto. Después de correrlo hay que actualizar el cliente
 * Prisma:
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 *
 * Uso (desde la raíz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/setup-requirement-file-columns.js
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
    ALTER TABLE ars_platform."TQuoteRequirement"
      ADD COLUMN IF NOT EXISTS "FileData" bytea NULL
  `);
  await client.query(`
    ALTER TABLE ars_platform."TQuoteRequirement"
      ADD COLUMN IF NOT EXISTS "DesFileName" varchar(255) NULL
  `);
  await client.query(`
    ALTER TABLE ars_platform."TContractRequirement"
      ADD COLUMN IF NOT EXISTS "FileData" bytea NULL
  `);
  await client.query(`
    ALTER TABLE ars_platform."TContractRequirement"
      ADD COLUMN IF NOT EXISTS "DesFileName" varchar(255) NULL
  `);

  console.log('OK. Columnas de archivo de Requisitos (Etapa 2) listas:');
  console.log('  - ars_platform."TQuoteRequirement"."FileData" (bytea) / "DesFileName" (varchar)');
  console.log('  - ars_platform."TContractRequirement"."FileData" (bytea) / "DesFileName" (varchar)');

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
