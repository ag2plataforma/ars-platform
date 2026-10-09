#!/usr/bin/env node
/**
 * Solo lectura. Diagnostica "No se encontró valor de tarifa para los factores consultados":
 * para cada tabla de tarifa pedida muestra sus factores (posición y campo del diccionario), cuántas
 * filas tiene, las primeras filas y los valores distintos de Factor1; y, para la tabla que use el
 * token COBERTURA, compara su Factor1 con los códigos reales de `SCoverage`.
 * También lista los campos del diccionario (y si tienen atributo activo) que empiecen por el prefijo.
 *
 * Uso (en la VPS, desde ~/ars-platform/deploy):
 *   bash scripts/db-run.sh investigate-rate-lookup.js ASIS-Dias ASIS-Cobertura
 * Sin argumentos usa ASIS-Dias y ASIS-Cobertura.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const content = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error('No se encontro DATABASE_URL');
  return match[1].trim();
}

async function main() {
  const tables = process.argv.slice(2);
  if (tables.length === 0) tables.push('ASIS-Dias', 'ASIS-Cobertura');
  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const coverages = (await client.query(`SELECT "CodCoverage" FROM ars_platform."SCoverage" ORDER BY 1`)).rows.map((r) => r.CodCoverage);

    for (const cod of tables) {
      console.log(`\n=== Tabla de tarifa "${cod}" ===`);
      const t = await client.query(`SELECT "IdeRateTable" FROM ars_platform."SRateTable" WHERE "CodRateTable" = $1`, [cod]);
      if (t.rows.length === 0) {
        console.log('  NO EXISTE una tabla con ese código.');
        continue;
      }
      const ide = t.rows[0].IdeRateTable;
      const factors = await client.query(
        `SELECT f."NumOrder", d."CodFieldDictionary" FROM ars_platform."SRateFactor" f
           LEFT JOIN ars_platform."SFieldDictionary" d ON d."IdeFieldDictionary" = f."IdeFieldDictionary"
          WHERE f."IdeRateTable" = $1 ORDER BY f."NumOrder"`,
        [ide],
      );
      console.log('  Factores:', factors.rows.map((r) => `#${r.NumOrder}=${r.CodFieldDictionary ?? '(sin campo)'}`).join(', ') || 'ninguno');
      const count = await client.query(`SELECT count(*)::int AS n FROM ars_platform."SRateValue" WHERE "IdeRateTable" = $1`, [ide]);
      console.log(`  Filas: ${count.rows[0].n}`);
      const sample = await client.query(
        `SELECT "Factor1","Factor2","Factor3","Value","TstInit","TstEnd" FROM ars_platform."SRateValue"
          WHERE "IdeRateTable" = $1 ORDER BY "Factor1" LIMIT 8`,
        [ide],
      );
      for (const r of sample.rows) {
        console.log(`   F1=${r.Factor1} F2=${r.Factor2 ?? '-'} F3=${r.Factor3 ?? '-'} Valor=${r.Value} (${r.TstInit.toISOString().slice(0, 10)}..${r.TstEnd.toISOString().slice(0, 10)})`);
      }
      const f1 = (await client.query(`SELECT DISTINCT "Factor1" FROM ars_platform."SRateValue" WHERE "IdeRateTable" = $1`, [ide])).rows.map((r) => r.Factor1);
      const matchCov = f1.filter((v) => coverages.includes(v));
      if (matchCov.length > 0 || cod.toLowerCase().includes('cobert')) {
        console.log(`  Factor1 que coinciden con un código de cobertura: ${matchCov.length}/${f1.length}`);
        const noMatch = f1.filter((v) => !coverages.includes(v));
        if (noMatch.length) console.log(`  Factor1 SIN cobertura con ese código: ${noMatch.slice(0, 15).join(', ')}`);
        const unrated = coverages.filter((c) => !f1.includes(c));
        if (unrated.length) console.log(`  Coberturas SIN fila en la tabla: ${unrated.slice(0, 30).join(', ')}`);
      }
    }

    console.log('\n=== Campos del diccionario que empiezan por "ASIS" ===');
    const fields = await client.query(
      `SELECT d."CodFieldDictionary", count(DISTINCT v."IdeFieldValue")::int AS valores,
              count(DISTINCT a."IdeAttribute")::int AS atributos
         FROM ars_platform."SFieldDictionary" d
         LEFT JOIN ars_platform."SFieldValue" v ON v."IdeFieldDictionary" = d."IdeFieldDictionary"
         LEFT JOIN ars_platform."SAttribute" a ON a."IdeFieldDictionary" = d."IdeFieldDictionary"
        WHERE d."CodFieldDictionary" LIKE 'ASIS%' GROUP BY 1 ORDER BY 1`,
    );
    for (const r of fields.rows) console.log(`  ${r.CodFieldDictionary}: ${r.valores} valores, ${r.atributos} atributo(s)`);
    console.log(`\nCódigos de cobertura existentes (${coverages.length}): ${coverages.slice(0, 40).join(', ')}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
