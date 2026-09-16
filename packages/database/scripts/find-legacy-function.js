#!/usr/bin/env node
/**
 * Utilidad de una sola vez (reutilizable) para consultar, directo contra
 * Postgres, el código fuente real de una función PL/pgSQL legacy —
 * mismo mecanismo que se usó en la Fase 0 para extraer y documentar las
 * 44 funciones originales (ver docs/01-especificacion-motor-negocio-actual.md).
 *
 * No asume el esquema `entity` (el legacy) porque `DATABASE_URL` apunta
 * a `ars_platform` por default en el connection string — busca en TODOS
 * los esquemas de la misma base y muestra en cuál vive cada función.
 *
 * Uso (desde la raíz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/find-legacy-function.js rate
 *   node packages/database/scripts/find-legacy-function.js FGetRateValue
 *
 * El primer argumento es un patrón ILIKE (sin %, se agregan solos).
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
    throw new Error(`No se encontró DATABASE_URL en ${envPath}`);
  }
  return match[1].trim();
}

async function main() {
  const pattern = process.argv[2];
  if (!pattern) {
    console.error('Uso: node find-legacy-function.js <patrón del nombre de función>');
    process.exit(1);
  }

  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const funcs = await client.query(
    `SELECT n.nspname AS schema, p.proname AS name, p.oid AS oid
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname ILIKE $1
     ORDER BY n.nspname, p.proname`,
    [`%${pattern}%`],
  );

  if (funcs.rows.length === 0) {
    console.log(`Sin coincidencias para "${pattern}".`);
  }

  for (const row of funcs.rows) {
    console.log(`\n===== ${row.schema}.${row.name} =====`);
    const def = await client.query(`SELECT pg_get_functiondef($1::oid) AS def`, [row.oid]);
    console.log(def.rows[0].def);
  }

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
