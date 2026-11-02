#!/usr/bin/env node
/**
 * 1) Hace opcional el canal de SProductProcessFlow ("el flujo lo gobierna la via"; un canal concreto pasa a ser solo
 *    un refinamiento). 2) Crea (si no existe) la via de distribucion BACKOFFICE: la aplicacion backoffice la usa de forma automatica en
 * cada cotizacion/contrato (la via identifica la APLICACION de origen, no la estructura comercial). Muestra las vias
 * existentes. Idempotente.
 *
 * Uso: bash scripts/db-run.sh setup-distribution-way.js
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

async function main() {
  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(`ALTER TABLE ars_platform."SProductProcessFlow" ALTER COLUMN "IdeDistributionChannel" DROP NOT NULL`);
  console.log('= SProductProcessFlow.IdeDistributionChannel ahora admite NULL (el flujo depende de la via).');
  const existing = await client.query(`SELECT 1 FROM ars_platform."SDistributionWay" WHERE "CodDistributionWay" = 'BACKOFFICE'`);
  if (existing.rows.length > 0) {
    console.log('= La via BACKOFFICE ya existe.');
  } else {
    const state = await client.query(`SELECT "IdeState" FROM ars_platform."SState" WHERE "CodState" = 'ACTIVO'`);
    if (state.rows.length === 0) throw new Error('No existe el estado ACTIVO');
    await client.query(
      `INSERT INTO ars_platform."SDistributionWay"
         ("CodDistributionWay", "DesDistributionWay", "IdeState", "UsrCreation", "TstCreation", "UsrModification", "TstModification")
       VALUES ('BACKOFFICE', 'Backoffice', $1, 'setup-distribution-way', now(), 'setup-distribution-way', now())`,
      [state.rows[0].IdeState],
    );
    console.log('+ Via BACKOFFICE creada.');
  }
  const all = await client.query(`SELECT "CodDistributionWay", "DesDistributionWay" FROM ars_platform."SDistributionWay" ORDER BY 1`);
  console.log('Vias existentes:');
  for (const row of all.rows) console.log(`  ${row.CodDistributionWay}  ${row.DesDistributionWay}`);
  await client.end();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
