#!/usr/bin/env node
/**
 * Corrige los movimientos de pólizas YA anuladas con la versión anterior de `ContractsService.cancel()`, que dejaba
 * TODOS los movimientos (y sus conceptos) en estado "Anulado" por la cascada de estado.
 *
 * Regla vigente (2026-11-09): anular una póliza no anula sus movimientos --
 *   - el movimiento de cierre (el último de cada cobertura, con vigencia desde la fecha de anulación) queda ACTIVO;
 *   - los movimientos anteriores quedan en el estado que da 'Modificar' sobre ACTIVO (igual que en un suplemento);
 *   - los conceptos de cada movimiento quedan ACTIVOS.
 *
 * Solo toca filas que estén en el mismo estado que el contrato anulado (el que dejó la cascada). Idempotente.
 *
 * Uso: node packages/database/scripts/fix-cancelled-movement-states.js [NumContract]   (sin argumento: todos)
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(key in process.env)) process.env[key] = v;
  }
}
loadEnvFile(path.resolve(__dirname, '../../../services/iam-service/.env'));

const prisma = new PrismaClient();
const day = (d) => Math.floor(new Date(d).getTime() / 86_400_000);

async function nextState(codEntity, fromState, operative) {
  const rule = await prisma.sStateRule.findFirst({
    where: { IdeStateFrom: fromState, DesOperativeCode: operative, SEntity: { CodEntity: codEntity } },
    select: { IdeStateTo: true },
  });
  return rule?.IdeStateTo ?? null;
}

async function main() {
  const numContract = process.argv[2] ?? null;
  const activo = await prisma.sState.findFirst({ where: { CodState: 'ACTIVO' } });
  if (!activo) throw new Error('No existe el estado ACTIVO');
  const modificado = await nextState('TCoverageMovement', activo.IdeState, 'Modificar');
  if (!modificado) throw new Error("No hay regla 'Modificar' para TCoverageMovement desde ACTIVO");

  const contracts = await prisma.tContract.findMany({
    where: { TstCancellation: { not: null }, ...(numContract ? { NumContract: numContract } : {}) },
    select: { IdeContract: true, NumContract: true, IdeState: true, TstCancellation: true },
  });
  console.log(`Contratos anulados a revisar: ${contracts.length}`);

  let movementsFixed = 0;
  let conceptsFixed = 0;
  for (const contract of contracts) {
    const anulado = contract.IdeState;
    const coverages = await prisma.tRiskCoverage.findMany({
      where: { TFileRisk: { TContractFile: { IdeContract: contract.IdeContract } } },
      select: { IdeRiskCoverage: true },
    });
    for (const { IdeRiskCoverage } of coverages) {
      const movements = await prisma.tCoverageMovement.findMany({
        where: { IdeRiskCoverage },
        orderBy: { NumCoverageMovement: 'asc' },
      });
      if (movements.length === 0) continue;
      const last = movements[movements.length - 1];
      const lastIsClosing = day(last.TstInitial) === day(contract.TstCancellation);
      for (const movement of movements) {
        const target = movement === last && lastIsClosing ? activo.IdeState : modificado;
        if (movement.IdeState === anulado) {
          await prisma.tCoverageMovement.update({
            where: { IdeCoverageMovement: movement.IdeCoverageMovement },
            data: { IdeState: target, UsrModification: 'fix-cancelled-movement-states', TstModification: new Date() },
          });
          movementsFixed++;
        }
        const r = await prisma.tMovementConcept.updateMany({
          where: { IdeCoverageMovement: movement.IdeCoverageMovement, IdeState: anulado },
          data: { IdeState: activo.IdeState, UsrModification: 'fix-cancelled-movement-states', TstModification: new Date() },
        });
        conceptsFixed += r.count;
      }
    }
    console.log(`- ${contract.NumContract}: revisado`);
  }
  console.log(`\nMovimientos corregidos: ${movementsFixed} | conceptos corregidos: ${conceptsFixed}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
