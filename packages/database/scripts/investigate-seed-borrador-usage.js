#!/usr/bin/env node
/**
 * Solo lectura: el fix de TQuote (`fix-quote-seed-borrador-state.js`)
 * resolvió el error de "Aceptar" en TQuote, pero el mismo problema
 * reapareció en TQuoteRisk ("No existe transición configurada para
 * 'TQuoteRisk' ... 'Aceptar'") -- señal de que CUALQUIER tabla con una
 * columna `IdeState` pudo haber quedado apuntando al mismo estado legado
 * `SEED_BORRADOR` en vez del `BORRADOR` real (misma cotización de prueba
 * vieja, sembrada de punta a punta con el código legado). Este script
 * escanea TODAS las tablas con columna `IdeState` (vía information_schema,
 * no hace falta mantener una lista a mano) y cuenta cuántas filas de cada
 * una están en `SEED_BORRADOR` -- para migrar todo de una vez en vez de ir
 * encontrando el error tabla por tabla.
 *
 * Uso: node packages/database/scripts/investigate-seed-borrador-usage.js
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(path.join(__dirname, '..', '..', '..', 'services', 'underwriting-service', '.env'));

const prisma = new PrismaClient();

async function main() {
  const seedBorrador = await prisma.sState.findFirst({ where: { CodState: 'SEED_BORRADOR' } });
  if (!seedBorrador) {
    console.log('No existe ningún SState con CodState="SEED_BORRADOR" -- nada que escanear.');
    return;
  }
  console.log(`SEED_BORRADOR = ${seedBorrador.IdeState}\n`);

  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE column_name = 'IdeState'
    ORDER BY table_schema, table_name;
  `);

  console.log(`Tablas con columna "IdeState": ${tables.length}\n`);
  console.log('--- Filas en SEED_BORRADOR por tabla (solo las que tienen >0) ---');
  let totalAffected = 0;
  for (const t of tables) {
    const schema = t.table_schema;
    const table = t.table_name;
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM "${schema}"."${table}" WHERE "IdeState" = $1::uuid`,
        seedBorrador.IdeState,
      );
      const n = rows[0]?.n ?? 0;
      if (n > 0) {
        console.log(`  ${schema}.${table}: ${n}`);
        totalAffected += n;
      }
    } catch (e) {
      console.log(`  ${schema}.${table}: ERROR (${e.message})`);
    }
  }
  console.log(`\nTotal de filas afectadas en todas las tablas: ${totalAffected}`);
}

main()
  .catch((e) => {
    console.error('ERR', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
