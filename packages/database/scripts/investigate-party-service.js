#!/usr/bin/env node
/**
 * Investigación puntual (una sola corrida, reutilizable) de la primera
 * mitad del alcance de `party-service` -- personas y consentimiento
 * GDPR -- antes de implementarlo. Mismo criterio que se usó con
 * `FGetRateValue`, el motor de atributos y el motor de cotización: no
 * adivinar el algoritmo a partir de `docs/01-especificacion-motor-negocio-actual.md`
 * (que NO tiene todavía una sección dedicada a esto, solo menciona
 * `FContractPerson`/`FConsent` de pasada en §4) ni del schema.prisma,
 * confirmarlo contra el código real.
 *
 * Alcance DELIBERADAMENTE ACOTADO de esta investigación (mismo criterio
 * de "separar configuración de orquestación" que se usó con el motor de
 * atributos): personas (`TPerson`/`TAddress`/`TContactData`) + roles de
 * persona (`SPersonRol`) + consentimiento (`SConsent`/`TPersonConsent`).
 * QUEDA AFUERA a propósito, para una investigación separada más
 * adelante: brokers (`TBroker`) y el árbol de comisiones
 * (`SCommissionTree`/`SCommissionTable`/`SCommission`/`SCommissionProduct`,
 * que además no se necesita hasta `FReceipt`, bastante más adelante en
 * la cascada de creación de contrato).
 *
 * Preguntas abiertas que esta investigación busca cerrar:
 *   - ¿Qué códigos reales tiene `SPersonRol` (`CodPersonRol`)? El
 *     roadmap y los comentarios del código mencionan "TOMADOR"/"TITULAR"
 *     como nombres informales -- no hay ningún seed/constante en el
 *     repo que los confirme.
 *   - ¿Existe alguna función PL/pgSQL que cree/valide `TPerson` (ej.
 *     duplicados por `NumIdentification`/`DesEmail`), o es CRUD directo
 *     de la capa LoopBack como pasaba con `TQuote`/`TQuoteRisk`?
 *   - ¿Qué hace `FConsent` exactamente? ¿Valida que el consentimiento
 *     esté dentro de `[TstInitial, TstEnd]`? ¿Impide duplicados por
 *     persona+consentimiento? ¿Qué pasa con los obligatorios
 *     (`IndMandatory`) -- se exigen antes de aceptar una cotización?
 *   - ¿Qué hace `FContractPerson` con el rol -- valida que existan los
 *     roles obligatorios (ej. un TOMADOR) antes de crear el contrato?
 *     (Relevante para diseñar bien `TQuotePerson`, aunque `FContractPerson`
 *     en sí es del ítem de contratación, no de esta fase).
 *   - ¿`TQuote.IdePerson` (FK directa) y `TQuotePerson` (join con rol)
 *     se usan juntos o son alternativos? ¿Hay algún dato real que lo
 *     aclare?
 *
 * Uso (desde la raíz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/investigate-party-service.js
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

async function dumpAll(client, schema, table, orderBy = 'TstCreation') {
  console.log(`\n----- DATOS COMPLETOS: ${schema}."${table}" -----`);
  try {
    const res = await client.query(`SELECT * FROM ${schema}."${table}" ORDER BY "${orderBy}" ASC`);
    console.log(`Total de filas: ${res.rows.length}`);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.log(`(no se pudo leer ${schema}."${table}": ${err.message})`);
  }
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('\n########## 1. FUNCIONES PL/pgSQL reales (%person%) ##########');
  await dumpFunctions(client, 'person');

  console.log('\n########## 2. FUNCIONES PL/pgSQL reales (%consent%) ##########');
  await dumpFunctions(client, 'consent');

  console.log('\n########## 3. Catálogo completo de roles de persona (SPersonRol) ##########');
  await dumpAll(client, 'entity', 'SPersonRol');

  console.log('\n########## 4. Catálogo completo de consentimientos configurados (SConsent) ##########');
  await dumpAll(client, 'entity', 'SConsent');

  console.log('\n########## 5. Datos reales de personas y consentimiento (esquema entity, más recientes) ##########');
  for (const table of ['TPerson', 'TAddress', 'TContactData', 'TPersonConsent', 'TQuotePerson', 'TContractPerson']) {
    await dumpSample(client, 'entity', table, 5);
  }

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
