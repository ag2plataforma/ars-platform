#!/usr/bin/env node
/**
 * Ejecuta un archivo de migración SQL contra la base de datos indicada en
 * DATABASE_URL (leída de services/iam-service/.env, para no duplicar la
 * credencial en varios sitios).
 *
 * Uso:
 *   node db/run-migration.js db/migrations/001_init_ars_platform_schema.sql
 *
 * Requiere el paquete "pg" instalado en la raíz del repo (ver README de esta carpeta).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

async function main() {
  const sqlFileArg = process.argv[2];
  if (!sqlFileArg) {
    console.error('Uso: node db/run-migration.js <archivo.sql>');
    process.exit(1);
  }

  const envPath = path.resolve(__dirname, '..', 'services', 'iam-service', '.env');
  const env = loadEnvFile(envPath);
  const databaseUrl = process.env.DATABASE_URL || env.DATABASE_URL;

  if (!databaseUrl) {
    console.error(
      `No se encontró DATABASE_URL. Revisa que exista en ${envPath} o expórtala como variable de entorno.`,
    );
    process.exit(1);
  }

  const sqlPath = path.resolve(process.cwd(), sqlFileArg);
  if (!fs.existsSync(sqlPath)) {
    console.error(`No existe el archivo: ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require') || /vercel|neon|supabase/i.test(databaseUrl)
      ? { rejectUnauthorized: false }
      : undefined,
  });

  console.log(`Conectando y ejecutando ${sqlFileArg} ...`);
  await client.connect();
  try {
    await client.query(sql);
    console.log('Migración aplicada correctamente sobre el esquema ars_platform.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Error ejecutando la migración:', err.message);
  process.exit(1);
});
