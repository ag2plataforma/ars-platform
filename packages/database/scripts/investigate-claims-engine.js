#!/usr/bin/env node
/**
 * Investigación puntual (una sola corrida, reutilizable) del módulo de
 * Siniestros real -- antes de diseñar cualquier CRUD/flujo en
 * `claims-service`, mismo criterio que se usó con cotización/contrato/
 * reglas de cálculo: no asumir que es un CRUD simple sobre las tablas
 * ya existentes sin confirmar primero si hay lógica de negocio (PL/pgSQL)
 * real que preservar.
 *
 * A diferencia de cotización/contrato, docs/01-especificacion-motor-negocio-actual.md
 * NO tiene ninguna sección sobre Siniestros -- no fue analizado en la
 * extracción original de Fase 0 más allá de listar las tablas. Este
 * script busca, en TODOS los esquemas de la misma base (no asume dónde
 * vive cada función legacy), cualquier función PL/pgSQL cuyo nombre
 * contenga alguno de estos patrones -- Siniestros es un dominio bastante
 * más grande de lo que documentaba el roadmap (11 tablas reales, no 7:
 * SClaimType/SClaimEvent + TClaim/TClaimFile/TClaimOperation/
 * TClaimRequirement/TClaimRisk/TApproval/TApprovalDetail/
 * TCoverageProvision/TGuaranteeProvision -- un pipeline completo de
 * siniestro -> riesgo del siniestro -> provisión por cobertura ->
 * aprobación -> detalle de aprobación -> provisión por garantía).
 *
 * Uso (desde la raíz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/investigate-claims-engine.js
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

  console.log('\n########## 1. FUNCIONES PL/pgSQL reales (patrones de Siniestros) ##########');
  for (const pattern of ['claim', 'approval', 'provision', 'guarantee', 'siniestro', 'indemniz', 'reserv']) {
    console.log(`\n---- patrón "%${pattern}%" ----`);
    await dumpFunctions(client, pattern);
  }

  console.log('\n########## 2. Datos reales de Siniestros (esquema entity, más recientes) ##########');
  for (const table of [
    'SClaimType',
    'SClaimEvent',
    'TClaim',
    'TClaimFile',
    'TClaimOperation',
    'TClaimRequirement',
    'TClaimRisk',
    'TApproval',
    'TApprovalDetail',
    'TCoverageProvision',
    'TGuaranteeProvision',
  ]) {
    await dumpSample(client, 'entity', table);
  }

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
