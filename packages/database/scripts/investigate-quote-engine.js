#!/usr/bin/env node
/**
 * Investigacion puntual (una sola corrida, reutilizable) del motor de
 * cotizacion real (`FQuote` y las funciones que orquesta), antes de
 * implementarlo en `underwriting-service` -- mismo criterio que se uso
 * con `FGetRateValue` y con el motor de atributos: no adivinar el
 * algoritmo a partir de la especificacion (docs/01, S3.2) ni del
 * schema.prisma, confirmarlo contra el codigo real.
 *
 * docs/01-especificacion-motor-negocio-actual.md S3.2 ya describe el
 * algoritmo en 4 pasos (FQuoteRiskPlan -> FQuoteCoverage ->
 * FQuoteCoverageConcept -> Prime = concepto PrimaTotal), pero faltan
 * los detalles finos que solo estan en el codigo real:
 *   - Que significa "vigentes" al generar combinaciones de plan en
 *     FQuoteRiskPlan (fechas? estado? algo mas?).
 *   - Como decide FQuoteCoverage los montos por defecto exactos
 *     (IndFixedAmount/IndFixedRate/IndFixedPrime -- si existen asi) y
 *     la preseleccion de obligatorias.
 *   - Como arma FGetQuoteSummary el resumen que ve el usuario.
 *   - Como genera FQuote el numero de cotizacion (NumQuote) -- ya hay
 *     un hallazgo de Fase 0 (correlativos por parseo de texto, riesgo
 *     de colision bajo concurrencia) que conviene revisar aca tambien
 *     para decidir si se reemplaza por una secuencia real.
 *   - Que hace exactamente `FQuote` con el parametro de operacion
 *     (mismo patron "un solo procedimiento, dispatch por string" que
 *     `FContract`) y que pasa en `FQuote_SetState`.
 *
 * Uso (desde la raiz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/investigate-quote-engine.js
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

async function dumpSample(client, schema, table, limit = 3) {
  console.log(`\n----- DATOS: ${schema}."${table}" (hasta ${limit} filas) -----`);
  try {
    const countRes = await client.query(`SELECT COUNT(*)::int AS n FROM ${schema}."${table}"`);
    console.log(`Total de filas: ${countRes.rows[0].n}`);
    if (countRes.rows[0].n === 0) return;
    const res = await client.query(`SELECT * FROM ${schema}."${table}" ORDER BY "TstCreation" DESC LIMIT ${limit}`);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.log(`(no se pudo leer ${schema}."${table}": ${err.message})`);
  }
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('\n########## 1. FUNCIONES PL/pgSQL reales (%quote%) ##########');
  await dumpFunctions(client, 'quote');

  console.log('\n########## 2. Datos reales de cotizaciones (esquema entity, mas recientes) ##########');
  for (const table of ['TQuote', 'TQuoteRisk', 'TQuoteRiskPlan', 'TQuoteCoverage', 'TQuoteCoverageConcept']) {
    await dumpSample(client, 'entity', table);
  }

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
