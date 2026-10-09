#!/usr/bin/env node
/**
 * Fix: pasa el Factor1 de una tabla de tarifa por cobertura del código del valor del diccionario
 * (ej. `ASIS-Cobertura-01`) al CÓDIGO REAL de la cobertura (`SCoverage.CodCoverage`, ej. `ASIS-0001`),
 * que es lo que devuelve el token `COBERTURA` del motor de reglas y lo que `FGetRateValue` compara
 * (igualdad exacta) contra Factor1.
 *
 * Emparejamiento: por DESCRIPCIÓN. Para cada Factor1 distinto de la tabla se busca el valor del
 * diccionario con ese código (`SFieldValue.DesFieldValue`) y la cobertura con esa misma descripción
 * (`SCoverage.DesCoverage`, sin distinguir mayúsculas ni espacios sobrantes). Solo se actualiza si
 * hay UNA coincidencia exacta; lo ambiguo o sin pareja se lista y no se toca. Las filas cuyo Factor1
 * ya es un código de cobertura se dejan igual (idempotente). Todo en una transacción.
 *
 * Uso (en la VPS, desde ~/ars-platform/deploy; pide "si" y hace backup):
 *   bash scripts/db-run.sh fix-rate-cobertura-codes.js --dry-run     (solo muestra el emparejamiento)
 *   bash scripts/db-run.sh fix-rate-cobertura-codes.js               (aplica)
 *   bash scripts/db-run.sh fix-rate-cobertura-codes.js ASIS-Cobertura  (otra tabla: primer argumento sin --)
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const COD_RATE_TABLE = args.find((a) => !a.startsWith('--')) || 'ASIS-Cobertura';
const USER = 'fix-rate-cobertura-codes';

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const content = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error('No se encontro DATABASE_URL');
  return match[1].trim();
}

async function main() {
  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const t = await client.query(`SELECT "IdeRateTable" FROM ars_platform."SRateTable" WHERE "CodRateTable" = $1`, [COD_RATE_TABLE]);
    if (t.rows.length === 0) throw new Error(`No existe la tabla de tarifa "${COD_RATE_TABLE}"`);
    const ide = t.rows[0].IdeRateTable;

    const coverages = (await client.query(`SELECT "CodCoverage","DesCoverage" FROM ars_platform."SCoverage"`)).rows;
    const coverageCodes = new Set(coverages.map((c) => c.CodCoverage));
    const byDes = new Map();
    for (const c of coverages) {
      const k = norm(c.DesCoverage);
      byDes.set(k, [...(byDes.get(k) ?? []), c.CodCoverage]);
    }

    const f1 = (await client.query(`SELECT DISTINCT "Factor1" FROM ars_platform."SRateValue" WHERE "IdeRateTable" = $1 ORDER BY 1`, [ide])).rows.map((r) => r.Factor1);
    const plan = [];
    const unresolved = [];
    for (const value of f1) {
      if (coverageCodes.has(value)) {
        console.log(`  = ${value} (ya es un codigo de cobertura)`);
        continue;
      }
      const fv = await client.query(`SELECT "DesFieldValue" FROM ars_platform."SFieldValue" WHERE "CodFieldValue" = $1`, [value]);
      if (fv.rows.length === 0) {
        unresolved.push(`${value}: no existe como valor del diccionario`);
        continue;
      }
      const des = fv.rows[0].DesFieldValue;
      const matches = byDes.get(norm(des)) ?? [];
      if (matches.length !== 1) {
        unresolved.push(`${value} ("${des}"): ${matches.length === 0 ? 'ninguna cobertura con esa descripcion' : `ambiguo, coberturas ${matches.join(', ')}`}`);
        continue;
      }
      plan.push({ from: value, to: matches[0], des });
      console.log(`  ${value} -> ${matches[0]}   ("${des}")`);
    }
    for (const u of unresolved) console.log(`  ? ${u}`);

    if (plan.length === 0) {
      console.log('\nNada que actualizar.');
      return;
    }
    const targets = plan.map((p) => p.to);
    if (new Set(targets).size !== targets.length) throw new Error('Dos Factor1 distintos apuntan a la misma cobertura; revisa las descripciones.');
    if (DRY) {
      console.log(`\n(dry-run) se actualizarian ${plan.length} Factor1. No se escribio nada.`);
      return;
    }

    await client.query('BEGIN');
    let rows = 0;
    for (const p of plan) {
      const r = await client.query(
        `UPDATE ars_platform."SRateValue" SET "Factor1" = $1, "UsrModification" = $2, "TstModification" = now()
          WHERE "IdeRateTable" = $3 AND "Factor1" = $4`,
        [p.to, USER, ide, p.from],
      );
      rows += r.rowCount;
    }
    await client.query('COMMIT');
    console.log(`\nActualizadas ${rows} filas (${plan.length} coberturas) en la tabla "${COD_RATE_TABLE}".`);
    if (unresolved.length) console.log(`Quedan ${unresolved.length} sin resolver (ver arriba).`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
