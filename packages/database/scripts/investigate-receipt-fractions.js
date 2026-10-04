#!/usr/bin/env node
/**
 * Solo lectura: ¿cuándo se generan en el sistema VIEJO los recibos de las
 * cuotas 2..N de una póliza fraccionada? Busca en el código de TODAS las
 * funciones/procedimientos de la BD (cualquier esquema) las referencias a
 * `IndGenerateAllFraction`, `BILLFRACTION`, `GENERATEALLFRACTION`, y vuelca
 * `FReceipt`, `FContractBilling` y las funciones que mencionan esos
 * términos. También cuenta, por producto, el valor de
 * `SProduct.IndGenerateAllFraction`, y lista triggers y extensiones de
 * agenda (pg_cron) que pudieran emitir recibos.
 *
 * No escribe nada en la BD. Imprime en consola y deja el mismo texto en
 * `investigate-receipt-fractions.out.txt` (descartable, no se versiona).
 *
 * Uso: node packages/database/scripts/investigate-receipt-fractions.js
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

const OUT_FILE = path.join(__dirname, 'investigate-receipt-fractions.out.txt');
const lines = [];
function log(text = '') {
  console.log(text);
  lines.push(text);
}

const TERMS = ['IndGenerateAllFraction', 'GenerateAllFraction', 'BILLFRACTION', 'GENERATEALL', 'NumFraction'];

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    log('=== 1. Funciones cuyo código menciona los términos buscados ===');
    const funcs = await client.query(
      `SELECT n.nspname AS schema, p.proname AS name, p.oid AS oid, pg_get_functiondef(p.oid) AS def
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND p.prokind IN ('f', 'p')`,
    );
    const matches = new Map(); // "schema.name" -> { def, terms:Set }
    for (const row of funcs.rows) {
      const found = TERMS.filter((t) => row.def.toLowerCase().includes(t.toLowerCase()));
      if (found.length) matches.set(`${row.schema}.${row.name}`, { def: row.def, terms: found });
    }
    if (matches.size === 0) log('(ninguna función menciona esos términos)');
    for (const [name, { terms }] of matches) log(`- ${name}  ->  ${terms.join(', ')}`);

    log('\n=== 2. Definición de FReceipt* y FContractBilling* (todas las copias) ===');
    const core = funcs.rows.filter((r) => /^(freceipt|fcontractbilling)/i.test(r.name));
    if (core.length === 0) log('(no hay funciones FReceipt*/FContractBilling*)');
    for (const row of core) {
      log(`\n----- ${row.schema}.${row.name} -----`);
      log(row.def);
    }

    log('\n=== 3. Definición de las demás funciones que mencionan los términos ===');
    for (const [name, { def }] of matches) {
      if (core.some((r) => `${r.schema}.${r.name}` === name)) continue;
      log(`\n----- ${name} -----`);
      log(def);
    }

    log('\n=== 4. SProduct.IndGenerateAllFraction por producto (esquema ars_platform) ===');
    try {
      const rows = await client.query(
        `SELECT "CodProduct", "DesProduct", "IndGenerateAllFraction", "IndProportionalPrime"
           FROM ars_platform."SProduct" ORDER BY "CodProduct"`,
      );
      for (const r of rows.rows) {
        log(`${r.CodProduct}\tGenerateAllFraction=${r.IndGenerateAllFraction}\tProportionalPrime=${r.IndProportionalPrime}\t${r.DesProduct}`);
      }
    } catch (err) {
      log(`(no se pudo leer SProduct: ${err.message})`);
    }

    log('\n=== 5. Triggers sobre tablas de recibos/facturación ===');
    const triggers = await client.query(
      `SELECT event_object_schema AS schema, event_object_table AS tbl, trigger_name, action_timing, event_manipulation
         FROM information_schema.triggers
        WHERE event_object_table IN ('TReceipt', 'TReceiptDetail', 'TContractBilling', 'TContract')
        ORDER BY 1, 2, 3`,
    );
    if (triggers.rows.length === 0) log('(sin triggers)');
    for (const t of triggers.rows) log(`${t.schema}.${t.tbl}: ${t.trigger_name} (${t.action_timing} ${t.event_manipulation})`);

    log('\n=== 6. Extensión de agenda (pg_cron) y sus trabajos ===');
    const ext = await client.query(`SELECT extname FROM pg_extension WHERE extname = 'pg_cron'`);
    if (ext.rows.length === 0) {
      log('(pg_cron no está instalada)');
    } else {
      try {
        const jobs = await client.query(`SELECT jobid, schedule, command FROM cron.job ORDER BY jobid`);
        for (const j of jobs.rows) log(`#${j.jobid} [${j.schedule}] ${j.command}`);
      } catch (err) {
        log(`(no se pudo leer cron.job: ${err.message})`);
      }
    }

    log('\n=== 7. Estados/reglas de TContractBilling y TReceipt (esquema ars_platform) ===');
    const rules = await client.query(
      `SELECT e."CodEntity", f."CodState" AS "From", t."CodState" AS "To", r."DesOperativeCode", r."IndInitialState"
         FROM ars_platform."SStateRule" r
         JOIN ars_platform."SEntity" e ON e."IdeEntity" = r."IdeEntity"
         JOIN ars_platform."SState" f ON f."IdeState" = r."IdeStateFrom"
         JOIN ars_platform."SState" t ON t."IdeState" = r."IdeStateTo"
        WHERE e."CodEntity" IN ('TContractBilling', 'TReceipt')
        ORDER BY e."CodEntity", f."CodState", t."CodState"`,
    );
    for (const r of rules.rows) {
      log(`${r.CodEntity}: ${r.From} -> ${r.To} [${r.DesOperativeCode ?? '-'}]${r.IndInitialState ? ' (inicial)' : ''}`);
    }
  } finally {
    await client.end();
    fs.writeFileSync(OUT_FILE, lines.join('\n'));
    console.log(`\n(Salida guardada en ${OUT_FILE})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
