#!/usr/bin/env node
/**
 * Diagnóstico SOLO LECTURA de los importes de una anulación con fraccionamiento
 * (ContractsService.cancel -> setCancelPrime -> generateReceipts).
 *
 * Muestra, para un contrato:
 *   1. Contrato, producto, fracción de pago (NumFraction, recargo) y períodos de facturación.
 *   2. Operaciones (movimientos del contrato) y endoso de anulación (ConditionData).
 *   3. Por cobertura: movimientos con cada concepto (bruto anual vs neto/cuota).
 *   4. Recálculo de la devolución con la MISMA fórmula del código, comparado con lo guardado,
 *      y con dos referencias: (a) devolución sobre la prima ANUAL bruta (pro-rata por días) y
 *      (b) devolución sobre lo realmente cobrable/emitido (recibos de cuotas).
 *   5. Todos los recibos (tipo, fechas, prima, comisión, cancelación) y su suma.
 *
 * Uso: node packages/database/scripts/investigate-cancellation-amounts.js 2060-2026-11
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
const d = (x) => (x ? new Date(x).toISOString().slice(0, 19).replace('T', ' ') : '(null)');
const n = (x) => Number(x);
const r4 = (x) => Math.round(x * 10000) / 10000;
const daysBetween = (a, b) => Math.floor((b.getTime() - a.getTime()) / 86_400_000);

async function main() {
  const numContract = process.argv[2];
  if (!numContract) throw new Error('Uso: node investigate-cancellation-amounts.js <NumContract>');
  const contract = await prisma.tContract.findFirst({ where: { NumContract: numContract } });
  if (!contract) return console.log(`No existe el contrato "${numContract}"`);

  const product = await prisma.sProduct.findUnique({ where: { IdeProduct: contract.IdeProduct } });
  const fraction = await prisma.sPaymentFraction.findUnique({ where: { IdePaymentFraction: contract.IdePaymentFraction } });
  const pf = await prisma.sProductPaymentFraction.findFirst({
    where: { IdeProduct: contract.IdeProduct, IdePaymentFraction: contract.IdePaymentFraction },
  });
  console.log(`=== 1. CONTRATO ${contract.NumContract} ===`);
  console.log(`Producto: ${product?.DesProduct} | IndProportionalPrime=${product?.IndProportionalPrime} | IndGenerateAllFraction=${product?.IndGenerateAllFraction}`);
  console.log(`Vigencia: ${d(contract.TstInitial)} -> ${d(contract.TstEnd)} (${contract.TstEnd ? daysBetween(contract.TstInitial, contract.TstEnd) : '?'} días) | ContractAge=${contract.ContractAge}`);
  console.log(`Anulación: ${d(contract.TstCancellation)} | motivo=${contract.DesCancellation ?? '(null)'}`);
  console.log(`Fracción: ${fraction?.DesPaymentFraction} NumFraction=${fraction?.NumFraction} | recargo PorSurCharge=${pf?.PorSurCharge}%`);
  const numFraction = fraction?.NumFraction ?? 1;
  const sur = n(pf?.PorSurCharge ?? 0);

  const billing = await prisma.tContractBilling.findMany({ where: { IdeContract: contract.IdeContract }, orderBy: { NumPeriod: 'asc' }, include: { SState: true } });
  console.log('\nPeríodos de facturación (TContractBilling):');
  for (const b of billing) console.log(`  #${b.NumPeriod} ${d(b.TstInitial)} -> ${d(b.TstEnd)} (${daysBetween(b.TstInitial, b.TstEnd)} d) estado=${b.SState.DesState}`);

  console.log('\n=== 2. OPERACIONES ===');
  const ops = await prisma.tContractOperation.findMany({
    where: { IdeContract: contract.IdeContract },
    orderBy: { NumOperation: 'asc' },
    include: { SOperationProduct: { include: { SOperation: true, SProductEndorsement: true } } },
  });
  let cancelEndorsement = null;
  for (const o of ops) {
    const e = o.SOperationProduct.SProductEndorsement;
    console.log(`  #${o.NumOperation} ${o.SOperationProduct.SOperation.CodOperation} | solicitud ${d(o.TstRequest)} | endoso=${e?.DesProductEndorsement ?? '-'} ConditionData=${e ? JSON.stringify(e.ConditionData) : '-'}`);
    if (o.SOperationProduct.SOperation.CodOperation.toUpperCase().includes('CANCEL') || o.SOperationProduct.SOperation.CodOperation.toUpperCase().includes('ANUL')) cancelEndorsement = e;
  }
  console.log(`Endoso de anulación: ${cancelEndorsement ? JSON.stringify(cancelEndorsement.ConditionData) : '(no identificado)'}`);

  console.log('\n=== 3/4. MOVIMIENTOS Y RECÁLCULO POR COBERTURA ===');
  const files = await prisma.tContractFile.findMany({
    where: { IdeContract: contract.IdeContract },
    include: { TFileRisk: { include: { TRiskCoverage: true } } },
    orderBy: { NumContractFile: 'asc' },
  });
  let totalStoredRefund = 0, totalCodeFormula = 0, totalAnnualProrata = 0;
  for (const f of files) {
    for (const risk of f.TFileRisk) {
      for (const rc of risk.TRiskCoverage) {
        const mv = await prisma.tCoverageMovement.findMany({
          where: { IdeRiskCoverage: rc.IdeRiskCoverage },
          orderBy: { NumCoverageMovement: 'asc' },
          include: { SState: true, TMovementConcept: { include: { SConcept: { include: { SConceptType: true } } } } },
        });
        console.log(`\n-- Cobertura ${rc.IdeRiskCoverage} (certificado ${f.NumContractFile}) Prime=${rc.Prime} --`);
        for (const m of mv) {
          console.log(`  Mov #${m.NumCoverageMovement} [${m.SState.DesState}] ${d(m.TstInitial)} -> ${d(m.TstEnd)} (${daysBetween(m.TstInitial, m.TstEnd)} d) Amount=${m.Amount} Prime=${m.Prime} op=${m.IdeContractOperation ? 'sí' : 'null'}`);
          for (const c of m.TMovementConcept) {
            console.log(`      ${c.SConcept.CodConcept.padEnd(14)} [${c.SConcept.SConceptType?.CodConceptType ?? '-'}] bruto(ConceptValue)=${c.ConceptValue}  neto(ConceptNetValue)=${c.ConceptNetValue}`);
          }
        }
        const closing = mv.filter((m) => n(m.Amount) === 0 && m.NumCoverageMovement > 1).pop();
        const original = mv.find((m) => m.NumCoverageMovement === 1);
        if (closing && original && contract.TstCancellation) {
          const daysOld = daysBetween(original.TstInitial, original.TstEnd);
          // el código itera día a día INCLUSIVO: días del cierre = daysBetween + 1
          let iter = 0;
          for (let c = new Date(closing.TstInitial); c.getTime() <= closing.TstEnd.getTime(); c.setDate(c.getDate() + 1)) iter++;
          const diasRestantesExactos = daysBetween(closing.TstInitial, closing.TstEnd);
          console.log(`  >> Recálculo: días vigencia original=${daysOld} | días recorridos por setCancelPrime=${iter} (restantes exactos=${diasRestantesExactos}) | numFraction=${numFraction}`);
          for (const oc of original.TMovementConcept) {
            const cc = closing.TMovementConcept.find((x) => x.IdeConcept === oc.IdeConcept);
            if (!cc) continue;
            const t = oc.SConcept.SConceptType?.CodConceptType;
            if (!['CALCPRIMA', 'CALCCOMISION', 'CALCIMPUESTO'].includes(t ?? '')) continue;
            const gross = n(oc.ConceptValue), net = n(oc.ConceptNetValue);
            const byCode = -(net / daysOld) * iter;               // fórmula actual del código
            const annualProrata = -(gross / daysOld) * iter;      // misma pro-rata pero sobre la prima ANUAL bruta
            const annualExact = -(gross / daysOld) * diasRestantesExactos;
            console.log(`     ${oc.SConcept.CodConcept.padEnd(12)} guardado=${r4(n(cc.ConceptNetValue))} | fórmula código (neto/cuota ÷ días × ${iter})=${r4(byCode)} | sobre anual bruto ×${iter} d=${r4(annualProrata)} | sobre anual bruto ×${diasRestantesExactos} d=${r4(annualExact)}`);
            if (oc.SConcept.CodConcept === 'PrimaNeta') {
              totalStoredRefund += n(cc.ConceptNetValue); totalCodeFormula += byCode; totalAnnualProrata += annualProrata;
            }
          }
        }
      }
    }
  }
  console.log(`\nPrimaNeta devuelta (suma coberturas): guardado=${r4(totalStoredRefund)} | fórmula código=${r4(totalCodeFormula)} | pro-rata anual bruto=${r4(totalAnnualProrata)}`);

  console.log('\n=== 5. RECIBOS ===');
  const receipts = await prisma.tReceipt.findMany({
    where: { IdeContract: contract.IdeContract },
    orderBy: [{ TstIssue: 'asc' }, { NumReceipt: 'asc' }],
    include: { SReceiptType: true, SState: true, TContractOperation: true, TReceiptDetail: { include: { SConcept: true } } },
  });
  let sumPrime = 0, sumFee = 0;
  for (const r of receipts) {
    sumPrime += n(r.Prime); sumFee += n(r.Fee);
    console.log(`- ${r.NumReceipt} [${r.SReceiptType.CodReceiptType}] op#${r.TContractOperation.NumOperation} estado=${r.SState.DesState} período ${d(r.TstInitial)} -> ${d(r.TstEnd)} | Prime=${r.Prime} Fee=${r.Fee} | vence=${d(r.TstDueDate)} | anulado=${d(r.TstCancellation)}`);
    const agg = new Map();
    for (const x of r.TReceiptDetail) agg.set(x.SConcept.CodConcept, (agg.get(x.SConcept.CodConcept) ?? 0) + n(x.ConceptValue));
    console.log('    ' + [...agg].map(([k, v]) => `${k}=${r4(v)}`).join(' | '));
  }
  console.log(`\nSuma de recibos: Prime=${r4(sumPrime)} Fee=${r4(sumFee)}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
