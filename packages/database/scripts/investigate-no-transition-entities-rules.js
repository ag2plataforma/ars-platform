#!/usr/bin/env node
/**
 * Solo lectura: tras confirmar con datos reales que, en CONT-2026-52, solo
 * TContractDistributionChannel quedó en Activo justo después de
 * "Contratar" (todo lo demás -- TContract, TContractFile, TContractPerson,
 * TContractBilling, TFileRisk, TRiskCoverage, TCoverageMovement,
 * TMovementConcept -- quedó correctamente en Borrador, tal como documenta
 * el código), este script revisa las reglas de SStateRule configuradas
 * para TContractDistributionChannel (y de paso TContractBilling y
 * TContractPerson, para comparar) y así confirmar si Activo es realmente
 * su estado inicial "por diseño" (sin ninguna transición configurada,
 * mismo patrón que TReceipt/TReceiptDetail documentado en
 * ContractsService.activate()) o si es un hueco real que falta cubrir.
 *
 * Uso: node packages/database/scripts/investigate-no-transition-entities-rules.js
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

async function printRules(codEntity) {
  const entity = await prisma.sEntity.findFirst({ where: { CodEntity: codEntity } });
  if (!entity) {
    console.log(`  (no existe SEntity "${codEntity}")`);
    return;
  }
  const rules = await prisma.sStateRule.findMany({
    where: { IdeEntity: entity.IdeEntity },
    include: {
      SState_SStateRule_IdeStateFromToSState: true,
      SState_SStateRule_IdeStateToToSState: true,
    },
  });
  if (rules.length === 0) {
    console.log('  (ninguna regla configurada -- la entidad nunca transiciona)');
  }
  for (const r of rules) {
    const from = r.SState_SStateRule_IdeStateFromToSState.CodState;
    const to = r.SState_SStateRule_IdeStateToToSState.CodState;
    const marker = r.IndInitialState ? '  <- marca de estado inicial' : '';
    console.log(`  [${from}] --${r.DesOperativeCode ?? '(inicial)'}--> [${to}]${marker}`);
  }
}

async function main() {
  for (const codEntity of ['TContractDistributionChannel', 'TContractBilling', 'TContractPerson', 'TReceipt']) {
    console.log(`--- ${codEntity} ---`);
    await printRules(codEntity);
    console.log('');
  }
}

main()
  .catch((e) => {
    console.error('ERR', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
