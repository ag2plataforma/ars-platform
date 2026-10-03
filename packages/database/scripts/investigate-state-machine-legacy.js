#!/usr/bin/env node
/**
 * Solo lectura: compara la máquina de estados ACTUAL de `ars_platform`
 * (`SEntity`/`SState`/`SStateRule`, hoy con los códigos de prueba
 * `SEED_*` conviviendo con los reales) contra la del sistema VIEJO, si
 * sus esquemas (`entity`/`ag2ars`/`temporal`) están en el mismo servidor
 * Postgres, y cuenta cuántas filas de cada tabla transaccional usan cada
 * estado -- para decidir con datos si conviene migrar a los estados reales
 * del legado o normalizar los actuales (ver docs/02-roadmap.md, "Máquina
 * de estados `SEED_`").
 *
 * No escribe nada en la BD. Imprime en consola y además deja el mismo
 * texto en `investigate-state-machine-legacy.out.txt` (junto a este
 * script) para poder revisarlo sin copiar y pegar -- ese archivo es
 * descartable, no se versiona.
 *
 * Uso: node packages/database/scripts/investigate-state-machine-legacy.js
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
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
const OUT_FILE = path.join(__dirname, 'investigate-state-machine-legacy.out.txt');
const lines = [];
function log(text = '') {
  console.log(text);
  lines.push(text);
}

const CANDIDATE_SCHEMAS = ['ars_platform', 'entity', 'ag2ars', 'temporal'];

async function tableExists(schema, table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    schema,
    table,
  );
  return rows.length > 0;
}

async function dumpStateMachine(schema) {
  log(`\n================ Esquema "${schema}" ================`);
  for (const table of ['SState', 'SEntity', 'SStateRule']) {
    if (!(await tableExists(schema, table))) {
      log(`  (no existe la tabla ${table} en este esquema -- se omite)`);
      return;
    }
  }
  try {
    const states = await prisma.$queryRawUnsafe(`SELECT "CodState", "DesState" FROM "${schema}"."SState" ORDER BY "CodState"`);
    log(`\n--- SState (${states.length}) ---`);
    for (const s of states) log(`  ${s.CodState}  (${s.DesState})`);

    const entities = await prisma.$queryRawUnsafe(`SELECT "CodEntity", "DesEntity" FROM "${schema}"."SEntity" ORDER BY "CodEntity"`);
    log(`\n--- SEntity (${entities.length}) ---`);
    for (const e of entities) log(`  ${e.CodEntity}  (${e.DesEntity})`);

    const rules = await prisma.$queryRawUnsafe(
      `SELECT e."CodEntity" AS entity, f."CodState" AS state_from, t."CodState" AS state_to,
              r."DesOperativeCode" AS operative, r."IndInitialState" AS initial
         FROM "${schema}"."SStateRule" r
         JOIN "${schema}"."SEntity" e ON e."IdeEntity" = r."IdeEntity"
         JOIN "${schema}"."SState" f ON f."IdeState" = r."IdeStateFrom"
         JOIN "${schema}"."SState" t ON t."IdeState" = r."IdeStateTo"
        ORDER BY e."CodEntity", r."IndInitialState" DESC, f."CodState", t."CodState"`,
    );
    log(`\n--- SStateRule (${rules.length}) ---`);
    let currentEntity = null;
    for (const r of rules) {
      if (r.entity !== currentEntity) {
        currentEntity = r.entity;
        log(`  [${currentEntity}]`);
      }
      log(`     ${r.state_from} --[${r.operative ?? '-'}]--> ${r.state_to}${r.initial ? '   (inicial)' : ''}`);
    }
  } catch (err) {
    log(`  ERROR consultando "${schema}": ${err.message}`);
  }
}

async function usageByState() {
  log(`\n================ Uso de estados en ars_platform (filas por tabla/estado) ================`);
  const tables = await prisma.$queryRawUnsafe(
    `SELECT c.table_name FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'ars_platform' AND c.column_name = 'IdeState' AND c.table_name LIKE 'T%'
      ORDER BY c.table_name`,
  );
  const seedTotals = {};
  for (const { table_name } of tables) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT s."CodState" AS cod, count(*)::int AS n
           FROM "ars_platform"."${table_name}" x
           JOIN "ars_platform"."SState" s ON s."IdeState" = x."IdeState"
          GROUP BY s."CodState" ORDER BY n DESC`,
      );
      if (rows.length === 0) continue;
      log(`  ${table_name}: ${rows.map((r) => `${r.cod}=${r.n}`).join(', ')}`);
      for (const r of rows) {
        if (r.cod.startsWith('SEED_')) seedTotals[r.cod] = (seedTotals[r.cod] ?? 0) + r.n;
      }
    } catch (err) {
      log(`  ${table_name}: ERROR ${err.message}`);
    }
  }
  log('\n--- Total de filas con estados SEED_* ---');
  const keys = Object.keys(seedTotals);
  if (keys.length === 0) log('  (ninguna)');
  for (const k of keys) log(`  ${k}: ${seedTotals[k]}`);
}

async function main() {
  const schemas = await prisma.$queryRawUnsafe(`SELECT schema_name FROM information_schema.schemata ORDER BY schema_name`);
  log(`Esquemas visibles en el servidor: ${schemas.map((s) => s.schema_name).join(', ')}`);
  for (const schema of CANDIDATE_SCHEMAS) {
    if (schemas.some((s) => s.schema_name === schema)) {
      await dumpStateMachine(schema);
    } else {
      log(`\n(esquema "${schema}" no existe en este servidor -- se omite)`);
    }
  }
  await usageByState();
  fs.writeFileSync(OUT_FILE, lines.join('\n') + '\n');
  console.log(`\nTambién guardado en ${OUT_FILE}`);
}

main()
  .catch((e) => {
    console.error('ERR', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
