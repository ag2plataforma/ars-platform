#!/usr/bin/env node
/**
 * Solo lectura. Para decidir cómo mostrar la descripción de «Código de inicio de vigencia»
 * (`SProduct.CodStartTime`, texto libre sin catálogo): lista, por producto, el código guardado,
 * los días de vigencia y los tipos de vigencia asociados (`SProductValidityType` -> `SValidityType`:
 * código, descripción e indicador anual), y los valores distintos de `CodStartTime` en uso.
 *
 * Uso (en la VPS, desde ~/ars-platform/deploy):
 *   bash scripts/db-run.sh investigate-product-start-time.js
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
  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const S = 'ars_platform';
    console.log('=== Valores distintos de SProduct.CodStartTime ===');
    const distinct = await client.query(`SELECT "CodStartTime", count(*)::int AS n FROM ${S}."SProduct" GROUP BY 1 ORDER BY 2 DESC`);
    for (const r of distinct.rows) console.log(`   "${r.CodStartTime}": ${r.n} producto(s)`);

    console.log('\n=== Productos ===');
    const products = await client.query(
      `SELECT "IdeProduct","CodProduct","DesProduct","CodStartTime","ValidityDays" FROM ${S}."SProduct" ORDER BY "CodProduct"`,
    );
    for (const p of products.rows) {
      const vt = await client.query(
        `SELECT v."CodValidityType", v."DesValidityType", v."IndAnnual" FROM ${S}."SProductValidityType" pv
           JOIN ${S}."SValidityType" v ON v."IdeValidityType" = pv."IdeValidityType" WHERE pv."IdeProduct" = $1`,
        [p.IdeProduct],
      );
      console.log(
        `   ${p.CodProduct} ${p.DesProduct}: CodStartTime="${p.CodStartTime}" ValidityDays=${p.ValidityDays ?? '-'} | vigencias: ` +
          (vt.rows.map((v) => `${v.CodValidityType} "${v.DesValidityType}" anual=${v.IndAnnual}`).join('; ') || '(ninguna)'),
      );
    }

    console.log('\n=== Todos los tipos de vigencia ===');
    const all = await client.query(`SELECT "CodValidityType","DesValidityType","IndAnnual" FROM ${S}."SValidityType" ORDER BY 1`);
    for (const v of all.rows) console.log(`   ${v.CodValidityType}: ${v.DesValidityType} (anual=${v.IndAnnual})`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
