#!/usr/bin/env node
/**
 * Solo lectura: diagnostica el error "No existe transición configurada
 * para 'TQuote' desde el estado actual con la operación 'Aceptar'"
 * reportado por el usuario después de una limpieza manual de
 * SStateRule. Compara el `IdeState` REAL de las cotizaciones contra los
 * estados "desde" que SStateRule tiene configurados para TQuote, y
 * busca estados duplicados (mismo CodState, distinto IdeState) que
 * expliquen por qué una cotización pudo quedar "huérfana" de reglas.
 *
 * Uso: node packages/database/scripts/investigate-quote-accept-transition.js
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
  // 1) Reglas configuradas hoy para TQuote (qué estados "desde" tienen
  //    al menos una operación disponible).
  const rules = await prisma.sStateRule.findMany({
    where: { SEntity: { CodEntity: 'TQuote' } },
    include: {
      SState_SStateRule_IdeStateFromToSState: true,
      SState_SStateRule_IdeStateToToSState: true,
    },
  });
  console.log('--- SStateRule configuradas para TQuote ---');
  if (rules.length === 0) {
    console.log('  (ninguna -- esto solo explicaría el error si de verdad no hay NADA configurado)');
  }
  const fromStateIds = new Set();
  for (const r of rules) {
    const from = r.SState_SStateRule_IdeStateFromToSState;
    const to = r.SState_SStateRule_IdeStateToToSState;
    fromStateIds.add(r.IdeStateFrom);
    console.log(
      `  [${from?.CodState ?? r.IdeStateFrom}] --${r.DesOperativeCode || '(inicial)'}--> [${to?.CodState ?? r.IdeStateTo}]` +
        (r.IndInitialState ? '   <- marca de estado inicial' : ''),
    );
  }

  // 2) Estados duplicados: mismo CodState, distinto IdeState -- la causa
  //    más probable si una limpieza consolidó reglas sobre un solo id
  //    "canónico" pero algunas cotizaciones apuntan al id duplicado.
  const allStates = await prisma.sState.findMany({ select: { IdeState: true, CodState: true, DesState: true } });
  const byCode = new Map();
  for (const s of allStates) {
    const bucket = byCode.get(s.CodState) ?? [];
    bucket.push(s);
    byCode.set(s.CodState, bucket);
  }
  const duplicated = [...byCode.entries()].filter(([, rows]) => rows.length > 1);
  console.log('\n--- SState duplicados (mismo CodState, distinto IdeState) ---');
  if (duplicated.length === 0) {
    console.log('  (ninguno)');
  } else {
    for (const [codState, rows] of duplicated) {
      console.log(`  ${codState}:`);
      for (const r of rows) {
        const usedBySStateRule = fromStateIds.has(r.IdeState);
        console.log(`    - ${r.IdeState} (${r.DesState}) ${usedBySStateRule ? '<- SÍ tiene reglas de salida para TQuote' : '<- SIN reglas de salida para TQuote'}`);
      }
    }
  }

  // 3) Cotizaciones reales: su IdeState actual, si coincide con alguno
  //    de los "from" configurados arriba, y si el id pertenece a un
  //    CodState que tiene duplicados (bandera de alerta).
  const quotes = await prisma.tQuote.findMany({
    select: { IdeQuote: true, NumQuote: true, IdeState: true, TstCreation: true },
    orderBy: { TstCreation: 'desc' },
    take: 20,
  });
  const stateById = new Map(allStates.map((s) => [s.IdeState, s]));
  console.log('\n--- Últimas 20 cotizaciones: su estado actual vs. las reglas disponibles ---');
  for (const q of quotes) {
    const state = stateById.get(q.IdeState);
    const tieneReglas = fromStateIds.has(q.IdeState);
    const flag = tieneReglas ? 'OK (tiene reglas de salida)' : '*** SIN NINGUNA REGLA DE SALIDA ***';
    console.log(
      `  ${q.NumQuote ?? q.IdeQuote} | estado: ${state?.CodState ?? q.IdeState} (${state?.DesState ?? '???'}) | ${flag}`,
    );
  }
}

main()
  .catch((e) => {
    console.error('ERR', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
