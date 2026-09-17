#!/usr/bin/env node
/**
 * Investigación puntual (una sola corrida, reutilizable) de la cascada
 * de creación de contrato (`FContract` y todo lo que orquesta) antes de
 * implementarla -- "el trabajo de mayor riesgo del proyecto" (ver
 * README de underwriting-service). Mismo criterio que con
 * `FGetRateValue`, el motor de atributos, el motor de cotización y
 * party-service: no adivinar el algoritmo a partir de
 * `docs/01-especificacion-motor-negocio-actual.md` §4 (que ya documenta
 * el ORDEN de la cascada y las reglas de negocio a alto nivel, ver ahí)
 * ni del schema, confirmarlo contra el código real.
 *
 * `FContractPerson`/`FContractFilePerson` ya se investigaron en
 * `investigate-party-service.js` (confirmado: copian `TQuotePerson` a
 * `TContractPerson`/`TContractFilePerson` según el rol, y
 * `FContractPerson` es lo que marca `TPerson.IndClient=true` -- no hace
 * falta volver a traerlas acá).
 *
 * Preguntas abiertas que esta investigación busca cerrar:
 *   - `FContract`: ¿qué casos (`pCase`) maneja, además de
 *     `CONTRACTNEW`/`CANCELCONTRACT` (mencionados en docs/01 §4)? ¿Qué
 *     valida antes de crear? ¿Cómo arma el número de contrato (mismo
 *     riesgo de colisión que tenía `FQuote('GETQUOTENUMBER',...)`?).
 *   - `FContractOperation`: ¿qué campos arma, qué relación tiene con el
 *     ciclo de vida del contrato (una fila por operación: alta, endoso,
 *     anulación...)?
 *   - `FContractDistributionChannel`: split de comisión por canal
 *     (`SCommissionProduct`), 100% al canal de origen si no hay
 *     configuración -- confirmar el algoritmo exacto.
 *   - `FContractBilling`: los dos casos mencionados en docs/01
 *     (`SET`/`BILL`) -- qué arma cada uno.
 *   - `FRiskCoverage`/`FCoverageMovement`/`FMovementConcept`: equivalen
 *     a `FQuoteRiskPlan`/`FQuoteCoverage`/`FQuoteCoverageConcept` del
 *     lado de contrato -- confirmar si el algoritmo es realmente
 *     paralelo (candidato a reusar `RulesEngineService` con
 *     `origin: 'Movement'`, que la firma de `evaluateChain` ya soporta)
 *     o si difiere en algo importante.
 *   - `FReceipt`: fecha de inicio del contrato (`NOW` o fecha
 *     configurada, día siguiente por defecto -- confirmar), vigencia
 *     anual vs. los 3 tipos sin implementar (`TempPack`/`TempDays`/
 *     `TempDate`, placeholder que cae a 1 año según docs/01 -- confirmar
 *     que sigue así), y el árbol de comisiones
 *     (`SCommissionTree`/`SCommissionTable`/`SCommission`, con
 *     comodines NULL, tomando el canal `IndMain=true`) -- alcance
 *     reducido acá: solo mirar cómo dispara el cálculo, el árbol de
 *     comisiones en sí (`TBroker`/`SCommission*`) sigue siendo su propia
 *     investigación separada (ver `docs/02-roadmap.md`).
 *
 * Uso (desde la raíz del repo, con packages/database/.env ya configurado):
 *   node packages/database/scripts/investigate-contract-engine.js
 *
 * La salida puede ser larga (varias funciones x 3 copias de esquema) --
 * si el resultado no entra en un solo mensaje, se puede pegar en partes,
 * igual que con el motor de cotización.
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

async function dumpFunctions(client, pattern, exclude = []) {
  const funcs = await client.query(
    `SELECT n.nspname AS schema, p.proname AS name, p.oid AS oid
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname ILIKE $1
     ORDER BY n.nspname, p.proname`,
    [`%${pattern}%`],
  );

  const rows = funcs.rows.filter((row) => !exclude.includes(row.name));

  if (rows.length === 0) {
    console.log(`(sin funciones nuevas que matcheen "%${pattern}%")`);
    return;
  }

  for (const row of rows) {
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

  // Ya investigadas en investigate-party-service.js -- no repetir.
  const alreadyKnown = ['FContractPerson', 'FContractFilePerson'];

  console.log('\n########## 1. FUNCIONES PL/pgSQL reales (%contract%) ##########');
  await dumpFunctions(client, 'contract', alreadyKnown);

  console.log('\n########## 2. FUNCIONES PL/pgSQL reales (%movement%) ##########');
  await dumpFunctions(client, 'movement');

  console.log('\n########## 3. FUNCIONES PL/pgSQL reales (%riskcoverage%) ##########');
  await dumpFunctions(client, 'riskcoverage');

  console.log('\n########## 4. FUNCIONES PL/pgSQL reales (%receipt%) ##########');
  await dumpFunctions(client, 'receipt');

  console.log('\n########## 5. Datos reales de contratación (esquema entity, más recientes) ##########');
  for (const table of [
    'TContract',
    'TContractOperation',
    'TContractDistributionChannel',
    'TContractBilling',
    'TContractFile',
    'TFileRisk',
    'TRiskCoverage',
    'TCoverageMovement',
    'TMovementConcept',
    'TReceipt',
  ]) {
    await dumpSample(client, 'entity', table, 3);
  }

  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
