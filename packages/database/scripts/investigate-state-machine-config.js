#!/usr/bin/env node
/**
 * Solo lectura: cuenta y lista `SEntity`/`SStateRule` reales en la BD,
 * para confirmar si la máquina de estados de cotización/contrato
 * (investigada en una sesión anterior como "vacía, salvo un SState
 * ACTIVO suelto", ver `seed-contract-testing-fixtures.js`) sigue así o
 * ya tiene datos reales cargados -- el usuario probó "Aceptar
 * cotización"/"Generar contrato" con éxito sin recordar haber corrido
 * el script de fixtures de prueba, así que hace falta confirmar contra
 * la BD real cuál es el estado actual antes de documentarlo.
 *
 * Uso: node packages/database/scripts/investigate-state-machine-config.js
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

async function main() {
  const entityCount = await prisma.sEntity.count();
  const ruleCount = await prisma.sStateRule.count();
  const stateCount = await prisma.sState.count();
  console.log(`SEntity: ${entityCount} filas`);
  console.log(`SStateRule: ${ruleCount} filas`);
  console.log(`SState: ${stateCount} filas\n`);

  const states = await prisma.sState.findMany({ select: { CodState: true, DesState: true } });
  console.log('--- SState ---');
  for (const s of states) console.log(`  ${s.CodState} (${s.DesState})`);

  const entities = await prisma.sEntity.findMany({ select: { CodEntity: true, DesEntity: true } });
  console.log('\n--- SEntity ---');
  if (entities.length === 0) {
    console.log('  (ninguna)');
  } else {
    for (const e of entities) console.log(`  ${e.CodEntity} (${e.DesEntity})`);
  }

  const rules = await prisma.sStateRule.findMany({
    include: {
      SEntity: true,
      SState_SStateRule_IdeStateFromToSState: true,
      SState_SStateRule_IdeStateToToSState: true,
    },
  });
  console.log('\n--- SStateRule ---');
  if (rules.length === 0) {
    console.log('  (ninguna)');
  } else {
    for (const r of rules) {
      const entity = r.SEntity?.CodEntity ?? r.IdeEntity;
      const from = r.SState_SStateRule_IdeStateFromToSState?.CodState ?? r.IdeStateFrom;
      const to = r.SState_SStateRule_IdeStateToToSState?.CodState ?? r.IdeStateTo;
      console.log(`  ${entity}: ${from} --[${r.DesOperativeCode}]--> ${to} (inicial=${r.IndInitialState})`);
    }
  }

  const seedMarked = await prisma.sStateRule.count({ where: { UsrCreation: 'seed-script' } });
  console.log(`\nFilas de SStateRule creadas por 'seed-script': ${seedMarked}`);
}

main()
  .catch((e) => {
    console.error('ERR', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
