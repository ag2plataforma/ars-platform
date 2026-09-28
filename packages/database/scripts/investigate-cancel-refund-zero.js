#!/usr/bin/env node
/**
 * Diagnóstico de por qué el recibo de anulación generó Prime/Fee en 0
 * (reportado por el usuario el 28/09/2026 al probar la pantalla de
 * "Anular contrato") -- replica, paso a paso y SOLO LECTURA, la cadena
 * real de `ContractsService.setCancelPrime`/`generateReceipts`
 * (`services/underwriting-service/src/contracts/contracts.service.ts`)
 * para decir exactamente en qué eslabón se corta:
 *
 *   1. `SProductEndorsement.ConditionData` del endoso elegido --
 *      refundPremium/refundCommission/refundTax.
 *   2. Por cada `TRiskCoverage`: el movimiento VIEJO (el que tenía la
 *      prima activa) y sus `TMovementConcept`, con el `CodConceptType`
 *      real de cada uno (`setCancelPrime` solo copia los tipados
 *      literalmente CALCPRIMA/CALCCOMISION/CALCIMPUESTO).
 *   3. El movimiento NUEVO (de cierre, creado por
 *      `createCancellationMovement`/`setCancelConcept`) y sus conceptos
 *      -- si no tiene un concepto con el MISMO IdeConcept que el viejo,
 *      `setCancelPrime` lo salta (nunca le suma la devolución).
 *   4. Si existen, con esos códigos LITERALES, los conceptos
 *      "PrimaNeta"/"PrimaTotal"/"Comision" (`SConcept.CodConcept`) --
 *      sin ellos, `setCancelPrime` nunca actualiza
 *      `TCoverageMovement.Prime` (se queda en el 0 con el que nace) y
 *      `generateReceipts` nunca genera la línea de comisión.
 *   5. El recibo de anulación ya generado (`TReceipt`/`TReceiptDetail`).
 *
 * No modifica nada -- solo lectura. Uso:
 *   node packages/database/scripts/investigate-cancel-refund-zero.js [NumContract]
 *
 * Sin argumento, toma el contrato más reciente que tenga una operación
 * de anulación (NumOperation > 1).
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
loadEnvFile(path.resolve(__dirname, '../../../services/iam-service/.env'));

const prisma = new PrismaClient();

function fmt(v) {
  return v === null || v === undefined ? '(null)' : String(v);
}

async function main() {
  const numContractArg = process.argv[2] ?? null;

  const contract = numContractArg
    ? await prisma.tContract.findFirst({ where: { NumContract: numContractArg } })
    : await prisma.tContract.findFirst({
        where: { TContractOperation: { some: { NumOperation: { gt: 1 } } } },
        orderBy: { TstCreation: 'desc' },
      });

  if (!contract) {
    console.log(numContractArg ? `No existe ningún contrato con NumContract="${numContractArg}".` : 'No se encontró ningún contrato con una operación de anulación/endoso.');
    return;
  }
  console.log(`=== Contrato ${contract.NumContract} (IdeContract=${contract.IdeContract}) ===`);
  const product = await prisma.sProduct.findUnique({ where: { IdeProduct: contract.IdeProduct } });
  console.log(`Producto: ${product?.DesProduct ?? '???'} (IdeProduct=${contract.IdeProduct})\n`);

  console.log('=== Paso 1: SProductEndorsement configurados para este producto (ConditionData) ===');
  const endorsements = await prisma.sProductEndorsement.findMany({ where: { IdeProduct: contract.IdeProduct } });
  for (const e of endorsements) {
    console.log(`- ${e.DesProductEndorsement} (IdeProductEndorsement=${e.IdeProductEndorsement}) | ConditionData=${JSON.stringify(e.ConditionData)}`);
  }
  console.log('');

  console.log('=== Paso 2: PrimaNeta / PrimaTotal / Comision -- existencia y tipo (SConcept.CodConcept literal) ===');
  const [primaNeta, primaTotal, comision] = await Promise.all([
    prisma.sConcept.findFirst({ where: { CodConcept: 'PrimaNeta' }, include: { SConceptType: true } }),
    prisma.sConcept.findFirst({ where: { CodConcept: 'PrimaTotal' }, include: { SConceptType: true } }),
    prisma.sConcept.findFirst({ where: { CodConcept: 'Comision' }, include: { SConceptType: true } }),
  ]);
  console.log(`PrimaNeta: ${primaNeta ? `existe (IdeConcept=${primaNeta.IdeConcept}, CodConceptType=${primaNeta.SConceptType?.CodConceptType ?? '(sin tipo)'})` : '>>> NO EXISTE (CodConcept="PrimaNeta") -- setCancelPrime nunca recalcula TCoverageMovement.Prime sin esto.'}`);
  console.log(`PrimaTotal: ${primaTotal ? `existe (IdeConcept=${primaTotal.IdeConcept}, CodConceptType=${primaTotal.SConceptType?.CodConceptType ?? '(sin tipo)'})` : '>>> NO EXISTE (CodConcept="PrimaTotal") -- setCancelPrime nunca recalcula TCoverageMovement.Prime sin esto.'}`);
  console.log(`Comision: ${comision ? `existe (IdeConcept=${comision.IdeConcept}, CodConceptType=${comision.SConceptType?.CodConceptType ?? '(sin tipo)'})` : '>>> NO EXISTE (CodConcept="Comision") -- generateReceipts explota o no genera línea de comisión sin esto.'}`);
  console.log('');

  console.log('=== Paso 3: por cada TRiskCoverage, movimiento VIEJO vs NUEVO y sus conceptos ===');
  const files = await prisma.tContractFile.findMany({
    where: { IdeContract: contract.IdeContract },
    include: { TFileRisk: { include: { TRiskCoverage: true } } },
  });
  for (const file of files) {
    for (const risk of file.TFileRisk) {
      for (const rc of risk.TRiskCoverage) {
        console.log(`\n-- TRiskCoverage ${rc.IdeRiskCoverage} (Prime actual=${rc.Prime}) --`);
        const movements = await prisma.tCoverageMovement.findMany({
          where: { IdeRiskCoverage: rc.IdeRiskCoverage },
          orderBy: { NumCoverageMovement: 'asc' },
          include: { SState: true },
        });
        for (const m of movements) {
          console.log(`  Movimiento #${m.NumCoverageMovement} (IdeCoverageMovement=${m.IdeCoverageMovement}) | Estado=${m.SState.DesState} | Prime=${m.Prime} | IdeContractOperation=${fmt(m.IdeContractOperation)} | vigencia ${m.TstInitial.toISOString().slice(0, 10)} -> ${m.TstEnd.toISOString().slice(0, 10)}`);
          const concepts = await prisma.tMovementConcept.findMany({
            where: { IdeCoverageMovement: m.IdeCoverageMovement },
            include: { SConcept: { include: { SConceptType: true } } },
          });
          if (concepts.length === 0) {
            console.log('    (sin TMovementConcept)');
          }
          for (const c of concepts) {
            console.log(`    - ${c.SConcept.CodConcept} | CodConceptType=${c.SConcept.SConceptType?.CodConceptType ?? '(sin tipo)'} | ConceptValue=${c.ConceptValue} | ConceptNetValue=${c.ConceptNetValue}`);
          }
        }
      }
    }
  }

  console.log('\n\n=== Paso 4: recibos ya generados para este contrato ===');
  const receipts = await prisma.tReceipt.findMany({
    where: { IdeContract: contract.IdeContract },
    include: { SReceiptType: true, TReceiptDetail: { include: { SConcept: true } } },
    orderBy: { TstIssue: 'asc' },
  });
  for (const r of receipts) {
    console.log(`- ${r.NumReceipt} (${r.SReceiptType.DesReceiptType}) | Prime=${r.Prime} | Fee=${r.Fee}`);
    for (const d of r.TReceiptDetail) {
      console.log(`    detalle: ${d.SConcept.CodConcept} = ${d.ConceptValue}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
