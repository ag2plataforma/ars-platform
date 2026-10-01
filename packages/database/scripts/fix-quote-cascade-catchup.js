#!/usr/bin/env node
/**
 * Fix idempotente: repara cotizaciones cuya cascada de aceptación quedó
 * interrumpida a mitad de camino -- el caso confirmado es PETS-2026-34,
 * donde TQuote llegó a ACEPTADO pero TQuoteRisk/TQuoteRiskPlan/
 * TQuoteCoverage/TQuoteCoverageConcept se quedaron en BORRADOR porque el
 * botón "Aceptar" llama a QuotesService.transitionState() SIN una
 * transacción explícita: cada entidad se actualiza con su propio
 * tx.X.update() suelto, así que si la cascada truena a mitad de camino
 * (como pasó con el bug de datos SEED_BORRADOR, ya corregido en
 * fix-seed-borrador-state.js), TQuote queda adelantado respecto a sus
 * hijos.
 *
 * Este script termina esa cascada "a mano": para cada TQuote que ya salió
 * de BORRADOR, revisa sus hijos (riesgo -> plan -> cobertura -> concepto)
 * y, para cualquiera que siga en BORRADOR, aplica la MISMA transición
 * "Aceptar" que habría aplicado transitionState -- resuelta dinámicamente
 * contra SStateRule de cada entidad (TQuoteRisk/Plan/Coverage usan ACTIVO
 * como destino, no se asume igual en todas), no hardcodeada. Corre todo
 * dentro de una transacción real esta vez, así que si algo falla no deja
 * nada a medias.
 *
 * Uso:
 *   node packages/database/scripts/fix-quote-cascade-catchup.js --dry-run
 *   node packages/database/scripts/fix-quote-cascade-catchup.js
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
const ACTOR = 'fix-quote-cascade-catchup-script';
const OP = 'Aceptar';

async function resolveRuleMap(codEntity) {
  const entity = await prisma.sEntity.findFirst({ where: { CodEntity: codEntity } });
  if (!entity) return new Map();
  const rules = await prisma.sStateRule.findMany({
    where: { IdeEntity: entity.IdeEntity, DesOperativeCode: OP },
  });
  const map = new Map();
  for (const r of rules) map.set(r.IdeStateFrom, r.IdeStateTo);
  return map;
}

async function main() {
  const borrador = await prisma.sState.findFirst({ where: { CodState: 'BORRADOR' } });
  if (!borrador) {
    throw new Error('No existe ningún SState con CodState="BORRADOR".');
  }

  const [riskRules, planRules, coverageRules, conceptRules] = await Promise.all([
    resolveRuleMap('TQuoteRisk'),
    resolveRuleMap('TQuoteRiskPlan'),
    resolveRuleMap('TQuoteCoverage'),
    resolveRuleMap('TQuoteCoverageConcept'),
  ]);

  const quotes = await prisma.tQuote.findMany({
    where: { NOT: { IdeState: borrador.IdeState } },
    select: {
      IdeQuote: true,
      NumQuote: true,
      TQuoteRisk: {
        select: {
          IdeQuoteRisk: true,
          NumRisk: true,
          IdeState: true,
          TQuoteRiskPlan: {
            select: {
              IdeQuoteRiskPlan: true,
              IdeState: true,
              TQuoteCoverage: {
                select: {
                  IdeQuoteCoverage: true,
                  IdeState: true,
                  TQuoteCoverageConcept: { select: { IdeQuoteCoverageConcept: true, IdeState: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const now = new Date();
  const updates = [];

  for (const quote of quotes) {
    for (const risk of quote.TQuoteRisk) {
      if (risk.IdeState === borrador.IdeState && riskRules.has(risk.IdeState)) {
        updates.push({
          model: 'tQuoteRisk',
          where: { IdeQuoteRisk: risk.IdeQuoteRisk },
          nextState: riskRules.get(risk.IdeState),
          label: `${quote.NumQuote} / TQuoteRisk riesgo #${risk.NumRisk}`,
        });
      }
      for (const plan of risk.TQuoteRiskPlan) {
        if (plan.IdeState === borrador.IdeState && planRules.has(plan.IdeState)) {
          updates.push({
            model: 'tQuoteRiskPlan',
            where: { IdeQuoteRiskPlan: plan.IdeQuoteRiskPlan },
            nextState: planRules.get(plan.IdeState),
            label: `${quote.NumQuote} / TQuoteRiskPlan (riesgo #${risk.NumRisk})`,
          });
        }
        for (const cov of plan.TQuoteCoverage) {
          if (cov.IdeState === borrador.IdeState && coverageRules.has(cov.IdeState)) {
            updates.push({
              model: 'tQuoteCoverage',
              where: { IdeQuoteCoverage: cov.IdeQuoteCoverage },
              nextState: coverageRules.get(cov.IdeState),
              label: `${quote.NumQuote} / TQuoteCoverage (riesgo #${risk.NumRisk})`,
            });
          }
          for (const concept of cov.TQuoteCoverageConcept) {
            if (concept.IdeState === borrador.IdeState && conceptRules.has(concept.IdeState)) {
              updates.push({
                model: 'tQuoteCoverageConcept',
                where: { IdeQuoteCoverageConcept: concept.IdeQuoteCoverageConcept },
                nextState: conceptRules.get(concept.IdeState),
                label: `${quote.NumQuote} / TQuoteCoverageConcept (riesgo #${risk.NumRisk})`,
              });
            }
          }
        }
      }
    }
  }

  console.log(DRY_RUN ? '*** DRY RUN: no se escribirá nada ***\n' : '*** EJECUCIÓN REAL ***\n');
  console.log(`Filas a avanzar con "Aceptar": ${updates.length}\n`);

  const byQuote = new Map();
  for (const u of updates) {
    const key = u.label.split(' / ')[0];
    byQuote.set(key, (byQuote.get(key) ?? 0) + 1);
  }
  for (const [num, count] of byQuote) {
    console.log(`  ${num}: ${count} fila(s)`);
  }

  if (DRY_RUN || updates.length === 0) {
    console.log('\n(nada más que hacer)');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      await tx[u.model].update({
        where: u.where,
        data: { IdeState: u.nextState, UsrModification: ACTOR, TstModification: now },
      });
    }
  });

  console.log(`\n${updates.length} fila(s) migradas correctamente.`);
}

main()
  .catch((e) => {
    console.error('ERR', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
