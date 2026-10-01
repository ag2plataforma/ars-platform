#!/usr/bin/env node
/**
 * Fix idempotente: migra todas las filas que quedaron apuntando al estado
 * legado `SEED_BORRADOR` (en cualquier tabla de negocio del schema
 * ars_platform) hacia el estado real `BORRADOR`, que es el único que tiene
 * transiciones configuradas en SStateRule.
 *
 * Este problema ya se detectó primero en TQuote (fix-quote-seed-borrador-state.js)
 * y luego reapareció en TQuoteRisk. El script de diagnóstico
 * investigate-seed-borrador-usage.js confirmó que además afecta a:
 * TClaim, TClaimRisk, TContractBilling, TContractOperation,
 * TCoverageProvision, TQuoteCoverage, TQuoteCoverageConcept,
 * TQuoteRequirement, TQuoteRiskPlan, TReceipt y TReceiptDetail.
 *
 * En vez de hardcodear la lista de tablas y columnas de auditoría, este
 * script vuelve a escanear information_schema en el momento de ejecutarse
 * (igual que el script de diagnóstico) y arma el UPDATE dinámicamente según
 * qué columnas de auditoría (UsrModification / TstModification) tenga cada
 * tabla -- así cubre también cualquier tabla nueva que aparezca con el
 * mismo problema en el futuro.
 *
 * Uso:
 *   node packages/database/scripts/fix-seed-borrador-state.js --dry-run
 *   node packages/database/scripts/fix-seed-borrador-state.js
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(path.join(__dirname, '..', '..', '..', 'services', 'underwriting-service', '.env'));

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const ACTOR = 'fix-seed-borrador-state-script';

async function main() {
  const [seedBorrador, borrador] = await Promise.all([
    prisma.sState.findFirst({ where: { CodState: 'SEED_BORRADOR' } }),
    prisma.sState.findFirst({ where: { CodState: 'BORRADOR' } }),
  ]);
  if (!seedBorrador) {
    console.log('No existe ningún SState con CodState="SEED_BORRADOR" -- nada que migrar.');
    return;
  }
  if (!borrador) {
    throw new Error('No existe ningún SState con CodState="BORRADOR" -- no se puede migrar.');
  }
  console.log(`SEED_BORRADOR = ${seedBorrador.IdeState}`);
  console.log(`BORRADOR      = ${borrador.IdeState}`);
  console.log(DRY_RUN ? '\n*** DRY RUN: no se escribirá nada ***\n' : '\n*** EJECUCIÓN REAL ***\n');

  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE column_name = 'IdeState'
      AND table_schema = 'ars_platform'
      AND table_name <> 'SState'
    ORDER BY table_schema, table_name;
  `);

  let totalFixed = 0;
  let tablesFixed = 0;
  for (const t of tables) {
    const schema = t.table_schema;
    const table = t.table_name;

    const countRows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS n FROM "${schema}"."${table}" WHERE "IdeState" = $1::uuid`,
      seedBorrador.IdeState,
    );
    const n = countRows[0]?.n ?? 0;
    if (n === 0) continue;

    const cols = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name IN ('UsrModification', 'TstModification')`,
      schema,
      table,
    );
    const colNames = cols.map((c) => c.column_name);

    const setClauses = ['"IdeState" = $1::uuid'];
    const params = [borrador.IdeState];
    let paramIdx = 2;
    if (colNames.includes('UsrModification')) {
      setClauses.push(`"UsrModification" = $${paramIdx}`);
      params.push(ACTOR);
      paramIdx += 1;
    }
    if (colNames.includes('TstModification')) {
      setClauses.push(`"TstModification" = now()`);
    }

    const whereParamIdx = paramIdx;
    const sql = `UPDATE "${schema}"."${table}" SET ${setClauses.join(', ')} WHERE "IdeState" = $${whereParamIdx}::uuid`;
    params.push(seedBorrador.IdeState);

    console.log(`${schema}.${table}: ${n} fila(s) ${DRY_RUN ? 'se migrarían' : 'migradas'}`);
    if (!DRY_RUN) {
      await prisma.$executeRawUnsafe(sql, ...params);
    }
    totalFixed += n;
    tablesFixed += 1;
  }

  console.log(`\nTotal: ${totalFixed} fila(s) en ${tablesFixed} tabla(s) ${DRY_RUN ? 'pendientes de migrar' : 'migradas'}.`);
}

main()
  .catch((e) => {
    console.error('ERR', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
