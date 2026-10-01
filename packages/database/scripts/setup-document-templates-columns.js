#!/usr/bin/env node
/**
 * Agrega (si no existen) las columnas necesarias para "Gestión de
 * plantillas de documentos físicos" (ver docs/02-roadmap.md, item 5):
 *
 * - `SOperationProductTemplate.TemplateFile` (bytea, nullable): el
 *   archivo .docx de la plantilla en sí. La tabla ya existía (legado),
 *   pero `TemplateContent` (varchar) en v1 guardaba un ID/URL de
 *   Cloudinary -- decisión explícita del usuario (2026-10-01): servicio
 *   nuevo propio del monorepo (`documents-service`), sin Cloudinary, así
 *   que el archivo se guarda directo en Postgres como bytea (mismo
 *   criterio ya usado en el proyecto para no sumar infraestructura
 *   -- "evita añadir Redis/RabbitMQ... mientras no sea necesario", ADR
 *   docs/00-arquitectura.md). `TemplateContent` se sigue usando, ahora
 *   para el nombre de archivo original (display).
 * - `TContractOperationDocument.PdfData` (bytea, nullable): el PDF ya
 *   generado/mergeado para un contrato puntual.
 * - `TContractOperationDocument.DesFileName` (varchar, nullable): nombre
 *   de archivo para mostrar/descargar.
 *
 * Idempotente: usa `ADD COLUMN IF NOT EXISTS`, se puede correr varias
 * veces sin efecto. Después de correrlo hay que actualizar el cliente
 * Prisma:
 *   npm run db:pull --workspace=packages/database
 *   npm run db:generate --workspace=packages/database
 *
 * Uso (desde la raíz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/setup-document-templates-columns.js
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
    ALTER TABLE ars_platform."SOperationProductTemplate"
      ADD COLUMN IF NOT EXISTS "TemplateFile" bytea NULL
  `);
  await client.query(`
    ALTER TABLE ars_platform."TContractOperationDocument"
      ADD COLUMN IF NOT EXISTS "PdfData" bytea NULL
  `);
  await client.query(`
    ALTER TABLE ars_platform."TContractOperationDocument"
      ADD COLUMN IF NOT EXISTS "DesFileName" varchar(255) NULL
  `);

  console.log('OK. Columnas de plantillas/documentos de contrato listas:');
  console.log('  - ars_platform."SOperationProductTemplate"."TemplateFile" (bytea)');
  console.log('  - ars_platform."TContractOperationDocument"."PdfData" (bytea)');
  console.log('  - ars_platform."TContractOperationDocument"."DesFileName" (varchar)');

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
