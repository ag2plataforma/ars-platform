#!/usr/bin/env node
/**
 * Crea las claves foraneas hacia ars_platform."SDistributionChannel" que faltaban en la BD:
 *   SCommissionTree.IdeDistributionChannel, TQuote.IdeDistributionChannel, TContract.IdeDistributionChannelSale,
 *   TContractDistributionChannel.IdeDistributionChannel y SCommissionProduct.IdeDistributionChannelOrigin/Destiny.
 *
 * Antes de crear cada FK comprueba que no haya filas huerfanas (valores que no existen en SDistributionChannel).
 * Si las hay, NO crea esa FK y lista las filas para corregirlas. Si ya existe una FK sobre esa columna (con
 * cualquier nombre), la omite. Idempotente.
 *
 * Uso: bash scripts/db-run.sh setup-distribution-fks.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error(`No se encontro DATABASE_URL en ${envPath}`);
  return match[1].trim();
}

const FKS = [
  { table: 'SCommissionTree', column: 'IdeDistributionChannel', name: 'FK_SCommissionTree_SDistributionChannel' },
  { table: 'TQuote', column: 'IdeDistributionChannel', name: 'FK_TQuote_SDistributionChannel' },
  { table: 'TContract', column: 'IdeDistributionChannelSale', name: 'FK_TContract_SDistributionChannel' },
  { table: 'TContractDistributionChannel', column: 'IdeDistributionChannel', name: 'FK_TContractDistributionChannel_SDistributionChannel' },
  { table: 'SCommissionProduct', column: 'IdeDistributionChannelOrigin', name: 'FK_SCommissionProduct_SDistributionChannelOrigin' },
  { table: 'SCommissionProduct', column: 'IdeDistributionChannelDestiny', name: 'FK_SCommissionProduct_SDistributionChannelDestiny' },
];

async function main() {
  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  let problems = 0;
  for (const fk of FKS) {
    const label = `${fk.table}.${fk.column}`;
    const existing = await client.query(
      `SELECT c.conname
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
         JOIN pg_class r ON r.oid = c.confrelid
        WHERE c.contype = 'f' AND n.nspname = 'ars_platform' AND t.relname = $1 AND a.attname = $2
          AND r.relname = 'SDistributionChannel'`,
      [fk.table, fk.column],
    );
    if (existing.rows.length > 0) {
      console.log(`= ${label}: ya tiene FK (${existing.rows[0].conname})`);
      continue;
    }
    const orphans = await client.query(
      `SELECT DISTINCT x."${fk.column}"::text AS id, count(*) OVER (PARTITION BY x."${fk.column}") AS n
         FROM ars_platform."${fk.table}" x
         LEFT JOIN ars_platform."SDistributionChannel" d ON d."IdeDistributionChannel" = x."${fk.column}"
        WHERE x."${fk.column}" IS NOT NULL AND d."IdeDistributionChannel" IS NULL`,
    );
    if (orphans.rows.length > 0) {
      problems++;
      console.log(`! ${label}: ${orphans.rows.length} valor(es) sin canal -> NO se crea la FK:`);
      for (const row of orphans.rows) console.log(`    ${row.id} (${row.n} fila/s)`);
      continue;
    }
    await client.query(
      `ALTER TABLE ars_platform."${fk.table}" ADD CONSTRAINT "${fk.name}"
         FOREIGN KEY ("${fk.column}") REFERENCES ars_platform."SDistributionChannel" ("IdeDistributionChannel")`,
    );
    console.log(`+ ${label}: FK creada (${fk.name})`);
  }
  await client.end();
  console.log(problems ? `Terminado con ${problems} FK pendientes por filas huerfanas.` : 'OK. Todas las FK de canal estan en su sitio.');
  if (problems) process.exit(2);
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
