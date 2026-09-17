#!/usr/bin/env node
/**
 * Investigación puntual (una sola corrida, reutilizable) del motor de
 * "atributos personalizables"/flujos configurables legacy, ANTES de
 * implementar nada -- mismo criterio que se usó con `FGetRateValue`:
 * no adivinar la forma a partir del schema.prisma, confirmarla contra
 * el código y los datos reales.
 *
 * Junta dos cosas en una sola corrida:
 *
 *  1. El código fuente PL/pgSQL real de toda función cuyo nombre matchee
 *     "%attribute%" o "%flow%" (ILIKE, sin distinguir mayúsculas), en
 *     TODOS los esquemas de la base -- mismo mecanismo que
 *     `find-legacy-function.js`, ver ese script para el porqué.
 *
 *  2. Datos reales de ejemplo (hasta 5 filas) de las tablas de
 *     configuración involucradas (`SEntity`, `SFlowStep`,
 *     `SModelAttribute`, `SAttribute`, `SAttributeProperty`) en el
 *     esquema `entity` (v1/legacy) -- NO en `ars_platform`, que es el
 *     esquema nuevo, aislado y vacío de configuración real (ver
 *     docs/00-arquitectura.md, decisión #5). Si `entity` nunca llegó a
 *     usar esta parte del sistema, las tablas van a aparecer vacías --
 *     eso también es información valiosa (podría ser una funcionalidad
 *     que v1 tenía disponible pero nunca configuró de verdad).
 *
 *  3. Un ejemplo real (si existe) del JSON `RiskAttributeValue` guardado
 *     en `TQuoteRisk`/`TFileRisk`, para ver la forma real de las claves
 *     que arma v1 (se espera que sean `IdeAttributeProperty`, según
 *     `PrismaAttributeValueResolver`, pero mejor confirmarlo).
 *
 * Uso (desde la raíz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/investigate-attribute-engine.js
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

async function dumpFunctions(client, pattern) {
  const funcs = await client.query(
    `SELECT n.nspname AS schema, p.proname AS name, p.oid AS oid
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname ILIKE $1
     ORDER BY n.nspname, p.proname`,
    [`%${pattern}%`],
  );

  if (funcs.rows.length === 0) {
    console.log(`(sin funciones que matcheen "%${pattern}%")`);
    return;
  }

  for (const row of funcs.rows) {
    console.log(`\n===== FUNCION: ${row.schema}.${row.name} =====`);
    const def = await client.query(`SELECT pg_get_functiondef($1::oid) AS def`, [row.oid]);
    console.log(def.rows[0].def);
  }
}

async function dumpSample(client, schema, table, limit = 5) {
  console.log(`\n----- DATOS: ${schema}."${table}" (hasta ${limit} filas) -----`);
  try {
    const countRes = await client.query(`SELECT COUNT(*)::int AS n FROM ${schema}."${table}"`);
    console.log(`Total de filas: ${countRes.rows[0].n}`);
    if (countRes.rows[0].n === 0) return;
    const res = await client.query(`SELECT * FROM ${schema}."${table}" LIMIT ${limit}`);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.log(`(no se pudo leer ${schema}."${table}": ${err.message})`);
  }
}

async function dumpAttributeValueSample(client, schema, table, jsonColumn) {
  console.log(`\n----- EJEMPLO REAL: ${schema}."${table}"."${jsonColumn}" (no nulo, 1 fila) -----`);
  try {
    const res = await client.query(
      `SELECT "${jsonColumn}" FROM ${schema}."${table}" WHERE "${jsonColumn}" IS NOT NULL LIMIT 1`,
    );
    if (res.rows.length === 0) {
      console.log('(ninguna fila con este JSON poblado)');
      return;
    }
    console.log(JSON.stringify(res.rows[0][jsonColumn], null, 2));
  } catch (err) {
    console.log(`(no se pudo leer ${schema}."${table}": ${err.message})`);
  }
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('\n########## 1. FUNCIONES PL/pgSQL reales (%attribute%) ##########');
  await dumpFunctions(client, 'attribute');

  console.log('\n########## 2. FUNCIONES PL/pgSQL reales (%flow%) ##########');
  await dumpFunctions(client, 'flow');

  console.log('\n########## 3. Datos reales de configuración (esquema entity) ##########');
  for (const table of ['SEntity', 'SFlowStep', 'SModelAttribute', 'SAttribute', 'SAttributeProperty']) {
    await dumpSample(client, 'entity', table);
  }

  console.log('\n########## 4. Forma real del JSON RiskAttributeValue (esquema entity) ##########');
  await dumpAttributeValueSample(client, 'entity', 'TQuoteRisk', 'RiskAttributeValue');
  await dumpAttributeValueSample(client, 'entity', 'TFileRisk', 'RiskAttributeValue');

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
