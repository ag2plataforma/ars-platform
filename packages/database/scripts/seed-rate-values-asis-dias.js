#!/usr/bin/env node
/**
 * Carga la tabla de tarifa `ASIS-Dias`: un valor de factor por cada día del año (1 a 365), tomado
 * de "Factor_dias.xlsx". Los valores van abajo en `TRAMOS` (el Excel tiene el mismo valor en
 * rangos de días consecutivos) porque el script corre en la VPS, sin acceso al Excel.
 *
 * Cada fila de `SRateValue` queda así:
 *   - Factor1 = `<codCampo>-<día>` (ej. `ASIS-Dias-1`), el CÓDIGO del valor del campo del
 *     diccionario (`SFieldValue.CodFieldValue`). Es lo que devuelve `attribute('...')` en una fórmula
 *     (el motor resuelve el atributo al `CodFieldValue`), y `FGetRateValue` compara Factor1 por
 *     igualdad exacta, así que tiene que ser el código y no el número suelto.
 *   - Value = el factor del día (texto, ej. "0.25").
 *   - Vigencia 01/10/2026 .. 31/12/2026, estado ACTIVO.
 *
 * Antes de escribir comprueba que existan: la tabla `ASIS-Dias`, su factor 1 (con el campo del
 * diccionario `ASIS-Dias`) y los 365 valores `ASIS-Dias-1..365` (los crea
 * `seed-field-values-range.js`, que hay que correr ANTES). Idempotente: si la fila de un día ya
 * existe, solo actualiza valor/vigencia si cambiaron. Todo en una transacción.
 *
 * Uso (en la VPS, desde ~/ars-platform/deploy):
 *   bash scripts/db-run.sh seed-rate-values-asis-dias.js
 * En local: node packages/database/scripts/seed-rate-values-asis-dias.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const COD_RATE_TABLE = 'ASIS-Dias';
const COD_FIELD = 'ASIS-Dias';
const USER = 'seed-rate-values-asis-dias';
const FROM = new Date('2026-10-01T00:00:00.000Z');
const TO = new Date('2026-12-31T00:00:00.000Z');

// [díaDesde, díaHasta, factor] -- fuente: Factor_dias.xlsx (cubre los 365 días sin huecos).
const TRAMOS = [
  [1, 2, 0.25],
  [3, 4, 0.45],
  [5, 6, 0.6],
  [7, 14, 0.75],
  [15, 29, 1.1],
  [30, 59, 1.6],
  [60, 89, 2.4],
  [90, 364, 3],
  [365, 365, 6],
];

/** Factor de cada día (índice 0 = día 1), validando que los tramos cubran 1..365 sin huecos ni solapes. */
function expandTramos() {
  const values = [];
  for (const [from, to, factor] of TRAMOS) {
    if (from !== values.length + 1 || to < from) throw new Error(`Tramo incoherente en [${from}, ${to}]`);
    for (let day = from; day <= to; day++) values.push(factor);
  }
  if (values.length !== 365) throw new Error(`Se esperaban 365 dias y los tramos cubren ${values.length}`);
  return values;
}

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error(`No se encontro DATABASE_URL en ${envPath}`);
  return match[1].trim();
}

async function main() {
  const VALUES = expandTramos();
  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const table = await client.query(
      `SELECT "IdeRateTable" FROM ars_platform."SRateTable" WHERE "CodRateTable" = $1`,
      [COD_RATE_TABLE],
    );
    if (table.rows.length === 0) throw new Error(`No existe la tabla de tarifa "${COD_RATE_TABLE}"`);
    const ideRateTable = table.rows[0].IdeRateTable;

    const factor = await client.query(
      `SELECT f."NumOrder", d."CodFieldDictionary", d."IdeFieldDictionary"
         FROM ars_platform."SRateFactor" f
         LEFT JOIN ars_platform."SFieldDictionary" d ON d."IdeFieldDictionary" = f."IdeFieldDictionary"
        WHERE f."IdeRateTable" = $1 ORDER BY f."NumOrder"`,
      [ideRateTable],
    );
    if (factor.rows.length !== 1 || factor.rows[0].NumOrder !== 1) {
      throw new Error(
        `La tabla "${COD_RATE_TABLE}" debe tener exactamente un factor (posicion 1); tiene: ` +
          (factor.rows.map((r) => `#${r.NumOrder}(${r.CodFieldDictionary ?? 'sin campo'})`).join(', ') || 'ninguno'),
      );
    }
    if (factor.rows[0].CodFieldDictionary !== COD_FIELD) {
      throw new Error(
        `El factor 1 de "${COD_RATE_TABLE}" apunta al campo "${factor.rows[0].CodFieldDictionary ?? '(ninguno)'}", se esperaba "${COD_FIELD}"`,
      );
    }

    const fieldValues = await client.query(
      `SELECT "CodFieldValue" FROM ars_platform."SFieldValue" WHERE "IdeFieldDictionary" = $1`,
      [factor.rows[0].IdeFieldDictionary],
    );
    const known = new Set(fieldValues.rows.map((r) => r.CodFieldValue));
    const missing = [];
    for (let day = 1; day <= 365; day++) if (!known.has(`${COD_FIELD}-${day}`)) missing.push(day);
    if (missing.length > 0) {
      throw new Error(
        `Faltan ${missing.length} valores del campo "${COD_FIELD}" (dias ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '...' : ''}). ` +
          `Corre antes: bash scripts/db-run.sh seed-field-values-range.js`,
      );
    }

    const state = await client.query(`SELECT "IdeState" FROM ars_platform."SState" WHERE "CodState" = 'ACTIVO'`);
    if (state.rows.length === 0) throw new Error('No existe el estado ACTIVO (SState)');
    const ideState = state.rows[0].IdeState;

    const existing = await client.query(
      `SELECT "IdeRateValue", "Factor1", "Value", "TstInit", "TstEnd" FROM ars_platform."SRateValue" WHERE "IdeRateTable" = $1`,
      [ideRateTable],
    );
    const byFactor = new Map();
    for (const row of existing.rows) {
      if (byFactor.has(row.Factor1)) throw new Error(`La tabla ya tiene filas duplicadas para Factor1="${row.Factor1}"`);
      byFactor.set(row.Factor1, row);
    }

    await client.query('BEGIN');
    const now = new Date();
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    for (let day = 1; day <= 365; day++) {
      const factor1 = `${COD_FIELD}-${day}`;
      const value = String(VALUES[day - 1]);
      const row = byFactor.get(factor1);
      if (!row) {
        await client.query(
          `INSERT INTO ars_platform."SRateValue"
             ("IdeRateTable", "TstInit", "TstEnd", "Factor1", "Value", "IdeState",
              "UsrCreation", "TstCreation", "UsrModification", "TstModification")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7, $8)`,
          [ideRateTable, FROM, TO, factor1, value, ideState, USER, now],
        );
        created++;
      } else if (
        Number(row.Value) !== Number(value) ||
        new Date(row.TstInit).getTime() !== FROM.getTime() ||
        new Date(row.TstEnd).getTime() !== TO.getTime()
      ) {
        await client.query(
          `UPDATE ars_platform."SRateValue"
              SET "Value" = $1, "TstInit" = $2, "TstEnd" = $3, "UsrModification" = $4, "TstModification" = $5
            WHERE "IdeRateValue" = $6`,
          [value, FROM, TO, USER, now, row.IdeRateValue],
        );
        updated++;
      } else {
        unchanged++;
      }
    }
    await client.query('COMMIT');

    const total = await client.query(
      `SELECT count(*)::int AS n FROM ars_platform."SRateValue" WHERE "IdeRateTable" = $1`,
      [ideRateTable],
    );
    console.log(
      `OK. Tabla "${COD_RATE_TABLE}": ${created} filas creadas, ${updated} actualizadas, ${unchanged} sin cambios. ` +
        `Total de filas de la tabla: ${total.rows[0].n}. Vigencia 01/10/2026 - 31/12/2026.`,
    );
    for (const day of [1, 3, 5, 7, 15, 30, 60, 90, 365]) {
      console.log(`  dia ${day}: ${COD_FIELD}-${day} -> ${VALUES[day - 1]}`);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
