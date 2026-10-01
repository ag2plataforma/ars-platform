#!/usr/bin/env node
/**
 * Solo lectura: tras resolver el problema de datos (SEED_BORRADOR), aparece
 * un nuevo error al intentar "Contratar":
 *   No existe transición configurada para "TQuoteRisk" desde el estado
 *   actual con la operación "Contratar"
 *
 * A diferencia del problema anterior, esto puede deberse a que falte la
 * propia regla en SStateRule para la entidad TQuoteRisk (p.ej. borrada
 * durante la limpieza manual de reglas de estado), no a datos corruptos.
 * Este script lista las reglas configuradas para TQuoteRisk y el estado
 * actual de las filas de TQuoteRisk más recientes, marcando cualquiera sin
 * regla de salida para la operación en cuestión.
 *
 * Uso: node packages/database/scripts/investigate-quoterisk-contratar-transition.js
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
  const entity = await prisma.sEntity.findFirst({ where: { CodEntity: 'TQuoteRisk' } });
  if (!entity) {
    console.log('No existe SEntity con CodEntity="TQuoteRisk".');
    return;
  }

  const rules = await prisma.sStateRule.findMany({
    where: { IdeEntity: entity.IdeEntity },
    include: {
      SState_SStateRule_IdeStateFromToSState: true,
      SState_SStateRule_IdeStateToToSState: true,
    },
  });

  console.log('--- SStateRule configuradas para TQuoteRisk ---');
  if (rules.length === 0) {
    console.log('  (ninguna)');
  }
  for (const r of rules) {
    const from = r.SState_SStateRule_IdeStateFromToSState.CodState;
    const to = r.SState_SStateRule_IdeStateToToSState.CodState;
    const marker = r.IndInitialState ? '  <- marca de estado inicial' : '';
    console.log(`  [${from}] --${r.DesOperativeCode ?? '(inicial)'}--> [${to}]${marker}`);
  }

  console.log('\n--- Últimas 30 filas de TQuoteRisk ---');
  const risks = await prisma.tQuoteRisk.findMany({
    orderBy: { TstModification: 'desc' },
    take: 30,
    include: {
      SState: true,
      TQuote: { select: { NumQuote: true } },
      SRiskProduct: { select: { DesShort: true } },
    },
  });

  const stateIdsWithOutboundRule = new Set(rules.map((r) => r.IdeStateFrom));

  for (const risk of risks) {
    const stateCode = risk.SState.CodState;
    const hasRule = stateIdsWithOutboundRule.has(risk.IdeState);
    const flag = hasRule ? 'OK' : '*** SIN NINGUNA REGLA DE SALIDA ***';
    console.log(
      `  ${risk.TQuote.NumQuote} / riesgo #${risk.NumRisk} (${risk.SRiskProduct?.DesShort ?? '?'}) | estado: ${stateCode} (${risk.SState.DesState ?? ''}) | ${flag}`,
    );
  }
}

main()
  .catch((e) => {
    console.error('ERR', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
