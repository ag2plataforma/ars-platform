#!/usr/bin/env node
/**
 * Carga en `SFieldValue` un rango de valores numéricos consecutivos para un campo del
 * Diccionario de campos (`SFieldDictionary`). Por defecto: campo `ASIS-Dias`, valores 1 a 365
 * (los días del año).
 *
 * Cada valor se crea así:
 *   - `DesFieldValue`  = el número ("1", "2", ... "365") -- es lo que se muestra.
 *   - `CodFieldValue`  = `<codCampo>-<número>` (ej. `ASIS-Dias-1`). OJO: el código de un valor es
 *     ÚNICO en toda la tabla (no solo dentro del campo), por eso lleva el prefijo del campo; es la
 *     misma convención que usa el motor de campos de riesgo.
 *   - Estado ACTIVO, auditoría con usuario `seed-field-values-range`.
 *
 * Idempotente: los valores que ya existen (mismo código) se omiten, así que se puede volver a
 * correr (por ejemplo, para ampliar el rango). Todo va en una sola transacción.
 *
 * Uso (en la VPS, desde ~/ars-platform/deploy):
 *   bash scripts/db-run.sh seed-field-values-range.js                  # ASIS-Dias 1..365
 *   bash scripts/db-run.sh seed-field-values-range.js OTRO-CAMPO 1 12  # otro campo / rango
 * En local (raíz del repo, con packages/database/.env):
 *   node packages/database/scripts/seed-field-values-range.js [CodCampo] [desde] [hasta]
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const USER = 'seed-field-values-range';
const [codField = 'ASIS-Dias', fromArg = '1', toArg = '365'] = process.argv.slice(2);
const from = Number(fromArg);
const to = Number(toArg);

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error(`No se encontro DATABASE_URL en ${envPath}`);
  return match[1].trim();
}

async function main() {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to || to - from > 10000) {
    throw new Error(`Rango invalido: "${fromArg}".."${toArg}" (enteros, desde <= hasta, maximo 10001 valores)`);
  }
  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const field = await client.query(
      `SELECT "IdeFieldDictionary", "DesFieldDictionary" FROM ars_platform."SFieldDictionary" WHERE "CodFieldDictionary" = $1`,
      [codField],
    );
    if (field.rows.length === 0) {
      const similar = await client.query(
        `SELECT "CodFieldDictionary" FROM ars_platform."SFieldDictionary" WHERE "CodFieldDictionary" ILIKE $1 ORDER BY 1 LIMIT 10`,
        [`%${codField.slice(0, 4)}%`],
      );
      throw new Error(
        `No existe el campo "${codField}" en el diccionario (se distingue mayusculas/minusculas).` +
          (similar.rows.length ? ` Parecidos: ${similar.rows.map((r) => r.CodFieldDictionary).join(', ')}` : ''),
      );
    }
    const { IdeFieldDictionary: ideField, DesFieldDictionary: desField } = field.rows[0];

    const state = await client.query(`SELECT "IdeState" FROM ars_platform."SState" WHERE "CodState" = 'ACTIVO'`);
    if (state.rows.length === 0) throw new Error('No existe el estado ACTIVO (SState)');
    const ideState = state.rows[0].IdeState;

    await client.query('BEGIN');
    const now = new Date();
    let created = 0;
    for (let n = from; n <= to; n++) {
      const res = await client.query(
        `INSERT INTO ars_platform."SFieldValue"
           ("CodFieldValue", "DesFieldValue", "IdeFieldDictionary", "IdeState",
            "UsrCreation", "TstCreation", "UsrModification", "TstModification")
         VALUES ($1, $2, $3, $4, $5, $6, $5, $6)
         ON CONFLICT ("CodFieldValue") DO NOTHING`,
        [`${codField}-${n}`, String(n), ideField, ideState, USER, now],
      );
      created += res.rowCount;
    }
    await client.query('COMMIT');

    const total = await client.query(
      `SELECT count(*)::int AS n FROM ars_platform."SFieldValue" WHERE "IdeFieldDictionary" = $1`,
      [ideField],
    );
    console.log(
      `OK. Campo "${codField}" (${desField}): ${created} valores nuevos, ${to - from + 1 - created} ya existian. ` +
        `Total de valores del campo: ${total.rows[0].n}.`,
    );
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
