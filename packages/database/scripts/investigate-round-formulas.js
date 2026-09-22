#!/usr/bin/env node
/**
 * El usuario probó cotizar y `RulesEngineService` explotó con:
 *   "Expresión de regla no soportada: identificador \"round\" sin resolver"
 * -- alguna `SCalculationRule.FormulaJson` real usa `round(...)` (función
 * SQL estándar de Postgres) en su IF/THEN/ELSE, y el evaluador propio
 * (`formula-expression.ts`) todavía no reconoce llamadas a funciones, solo
 * números/booleanos/operadores (ver su comentario de cabecera).
 *
 * Antes de decidir cómo soportarlo (¿un solo argumento? ¿dos, con
 * precisión decimal, como `ROUND(numeric, integer)` de Postgres?) hace
 * falta ver la forma EXACTA en que aparece en datos reales -- no adivinar.
 * Este script junta, tanto del esquema real `ars_platform` como del
 * legado `entity` (para comparar si es un patrón heredado o nuevo),
 * TODAS las filas de SCalculationRule cuyo FormulaJson (If/Then/Else)
 * contenga "round" (case-insensitive), con el texto completo de las tres
 * expresiones y el código/orden de la regla.
 *
 * Uso (desde la raíz del repo, con packages/database/.env configurado):
 *   node packages/database/scripts/investigate-round-formulas.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error(`No se encontró DATABASE_URL en ${envPath}`);
  return match[1].trim();
}

async function dumpSchema(client, schema) {
  const exists = await client.query(
    `select 1 from information_schema.tables where table_schema = $1 and table_name = 'SCalculationRule'`,
    [schema],
  );
  if (exists.rowCount === 0) {
    console.log(`\n=== Esquema "${schema}": no tiene tabla SCalculationRule, se omite ===`);
    return;
  }

  const { rows } = await client.query(
    `select "IdeCalculationRule", "CodCalculationRule", "Order", "FormulaJSON", "TstCreation"
     from "${schema}"."SCalculationRule"
     where "FormulaJSON"::text ilike '%round%'
     order by "TstCreation" asc`,
  );

  console.log(`\n=== Esquema "${schema}": ${rows.length} regla(s) con "round" en FormulaJSON ===`);
  const seenShapes = new Set();
  let printedCount = 0;
  for (const row of rows) {
    let parsed;
    try {
      parsed = typeof row.FormulaJSON === 'string' ? JSON.parse(row.FormulaJSON) : row.FormulaJSON;
    } catch (err) {
      console.log(`\n--- ${row.CodCalculationRule} (Order=${row.Order}) --- (FormulaJSON no es JSON válido: ${err.message})`);
      console.log(`  Raw: ${row.FormulaJSON}`);
      continue;
    }
    // Dedupe: muchas reglas comparten literalmente la misma forma de
    // fórmula (solo cambia a qué concepto/cobertura aplican) -- para no
    // saturar la salida, solo se imprime un ejemplo por forma distinta de
    // IF+THEN+ELSE, pero se cuentan todas.
    const shape = JSON.stringify([parsed.IF, parsed.THEN, parsed.ELSE]);
    if (seenShapes.has(shape)) continue;
    seenShapes.add(shape);
    printedCount++;
    console.log(`\n--- Ejemplo ${printedCount} (ej. ${row.CodCalculationRule}, Order=${row.Order}) ---`);
    console.log(`  IF:   ${JSON.stringify(parsed.IF)}`);
    console.log(`  THEN: ${JSON.stringify(parsed.THEN)}`);
    console.log(`  ELSE: ${JSON.stringify(parsed.ELSE)}`);
  }
  console.log(`\n(${seenShapes.size} forma(s) distinta(s) de fórmula entre las ${rows.length} reglas)`);
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await dumpSchema(client, 'ars_platform');
    await dumpSchema(client, 'entity');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
