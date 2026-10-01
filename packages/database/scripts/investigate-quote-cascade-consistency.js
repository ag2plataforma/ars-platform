#!/usr/bin/env node
/**
 * Solo lectura. Hallazgo: `QuotesService.transitionState()` (la operación
 * genérica detrás de los botones "Aceptar"/"Contratar") actualiza TQuote
 * PRIMERO y luego, en el mismo bucle, va bajando en cascada por
 * TQuoteRisk -> TQuoteRiskPlan -> TQuoteCoverage -> TQuoteCoverageConcept,
 * llamando a StateMachineService.getNextState() para cada uno ANTES de
 * escribir su UPDATE. Cuando se llama sin una transacción explícita (el
 * botón "Aceptar" la llama con el `tx` por defecto = this.prisma, sin
 * wrapping), cada `await tx.X.update(...)` se compromete en el acto -- así
 * que si la cascada se interrumpe a mitad de camino (como pasó con el bug
 * de SEED_BORRADOR), TQuote queda adelantado respecto a sus hijos, que se
 * quedan pegados en BORRADOR.
 *
 * Este script busca exactamente esa inconsistencia: cotizaciones cuyo
 * TQuote ya NO está en BORRADOR, pero con hijos (riesgo / plan / cobertura
 * / concepto) que siguen en BORRADOR -- es decir, nunca recibieron su
 * "Aceptar".
 *
 * Uso: node packages/database/scripts/investigate-quote-cascade-consistency.js
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

const ENTITIES = ['TQuoteRisk', 'TQuoteRiskPlan', 'TQuoteCoverage', 'TQuoteCoverageConcept'];

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
  for (const r of rules) {
    const from = r.SState_SStateRule_IdeStateFromToSState.CodState;
    const to = r.SState_SStateRule_IdeStateToToSState.CodState;
    const marker = r.IndInitialState ? '  <- marca de estado inicial' : '';
    console.log(`  [${from}] --${r.DesOperativeCode ?? '(inicial)'}--> [${to}]${marker}`);
  }
}

async function main() {
  console.log('=== Reglas SStateRule por entidad ===\n');
  for (const codEntity of ENTITIES) {
    console.log(`--- ${codEntity} ---`);
    await printRules(codEntity);
    console.log('');
  }

  console.log('=== Cotizaciones con TQuote fuera de BORRADOR pero hijos pegados en BORRADOR ===\n');

  const borrador = await prisma.sState.findFirst({ where: { CodState: 'BORRADOR' } });

  const quotes = await prisma.tQuote.findMany({
    where: { NOT: { IdeState: borrador.IdeState } },
    select: { IdeQuote: true, NumQuote: true, IdeState: true, SState: { select: { CodState: true } } },
  });

  let totalFlagged = 0;
  for (const quote of quotes) {
    const risks = await prisma.tQuoteRisk.findMany({
      where: { IdeQuote: quote.IdeQuote },
      select: {
        IdeQuoteRisk: true,
        NumRisk: true,
        IdeState: true,
        SState: { select: { CodState: true } },
        TQuoteRiskPlan: {
          select: {
            IdeQuoteRiskPlan: true,
            IdeState: true,
            SState: { select: { CodState: true } },
            TQuoteCoverage: {
              select: {
                IdeQuoteCoverage: true,
                IdeState: true,
                SState: { select: { CodState: true } },
                TQuoteCoverageConcept: {
                  select: { IdeQuoteCoverageConcept: true, IdeState: true, SState: { select: { CodState: true } } },
                },
              },
            },
          },
        },
      },
    });

    const lines = [];
    for (const risk of risks) {
      if (risk.SState.CodState === 'BORRADOR') {
        lines.push(`    TQuoteRisk #${risk.NumRisk} (${risk.IdeQuoteRisk}): BORRADOR`);
      }
      for (const plan of risk.TQuoteRiskPlan) {
        if (plan.SState.CodState === 'BORRADOR') {
          lines.push(`    TQuoteRiskPlan (${plan.IdeQuoteRiskPlan}), riesgo #${risk.NumRisk}: BORRADOR`);
        }
        for (const cov of plan.TQuoteCoverage) {
          if (cov.SState.CodState === 'BORRADOR') {
            lines.push(`    TQuoteCoverage (${cov.IdeQuoteCoverage}), riesgo #${risk.NumRisk}: BORRADOR`);
          }
          for (const concept of cov.TQuoteCoverageConcept) {
            if (concept.SState.CodState === 'BORRADOR') {
              lines.push(
                `    TQuoteCoverageConcept (${concept.IdeQuoteCoverageConcept}), riesgo #${risk.NumRisk}: BORRADOR`,
              );
            }
          }
        }
      }
    }

    if (lines.length > 0) {
      console.log(`  ${quote.NumQuote} (TQuote está en ${quote.SState.CodState}):`);
      for (const l of lines) console.log(l);
      totalFlagged += lines.length;
    }
  }

  console.log(`\nTotal de filas hijas pegadas en BORRADOR: ${totalFlagged}`);
}

main()
  .catch((e) => {
    console.error('ERR', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
