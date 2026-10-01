#!/usr/bin/env node
/**
 * Migra cualquier `TQuote` que haya quedado con `IdeState` apuntando al
 * estado legado `SEED_BORRADOR` ("[SEED] Borrador") al estado real
 * `BORRADOR` que usa hoy la máquina de estados (`SStateRule` solo tiene
 * reglas configuradas desde `BORRADOR`, no desde `SEED_BORRADOR` -- ver
 * `investigate-quote-accept-transition.js`, que encontró a PETS-2026-34
 * en esta situación: "No existe transición configurada para 'TQuote'
 * ... con la operación 'Aceptar'").
 *
 * Idempotente: si no hay ninguna fila en `SEED_BORRADOR`, no hace nada.
 * Soporta --dry-run (mismo criterio que
 * apply-social-impact-adjustment-to-prima-total.js) para ver el impacto
 * antes de aplicar.
 *
 * Uso:
 *   node packages/database/scripts/fix-quote-seed-borrador-state.js --dry-run
 *   node packages/database/scripts/fix-quote-seed-borrador-state.js
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
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const [borrador, seedBorrador] = await Promise.all([
    prisma.sState.findFirst({ where: { CodState: 'BORRADOR' } }),
    prisma.sState.findFirst({ where: { CodState: 'SEED_BORRADOR' } }),
  ]);

  if (!borrador) {
    console.log('No existe un SState con CodState="BORRADOR" -- no se puede migrar, revisar manualmente.');
    return;
  }
  if (!seedBorrador) {
    console.log('No existe ningún SState con CodState="SEED_BORRADOR" -- nada que migrar (ya está limpio).');
    return;
  }

  const affected = await prisma.tQuote.findMany({
    where: { IdeState: seedBorrador.IdeState },
    select: { IdeQuote: true, NumQuote: true },
  });

  console.log(`BORRADOR:      ${borrador.IdeState}`);
  console.log(`SEED_BORRADOR: ${seedBorrador.IdeState}`);
  console.log(`\nCotizaciones en SEED_BORRADOR: ${affected.length}`);
  for (const q of affected) console.log(`  - ${q.NumQuote}`);

  if (affected.length === 0) return;

  if (dryRun) {
    console.log('\n--dry-run: no se modificó nada.');
    return;
  }

  const now = new Date();
  const result = await prisma.tQuote.updateMany({
    where: { IdeState: seedBorrador.IdeState },
    data: { IdeState: borrador.IdeState, UsrModification: 'fix-quote-seed-borrador-state-script', TstModification: now },
  });
  console.log(`\nMigradas ${result.count} cotización(es) de SEED_BORRADOR a BORRADOR.`);
}

main()
  .catch((e) => {
    console.error('ERR', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
