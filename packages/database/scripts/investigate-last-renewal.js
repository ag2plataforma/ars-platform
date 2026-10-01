#!/usr/bin/env node
/**
 * Investigación de solo lectura: mira la última fila de
 * `TContractRenewalCycle` (la renovación que el usuario acaba de probar
 * en pantalla) y muestra el historial completo de `TContractOperation` +
 * `TReceipt` de ESE contrato, para confirmar qué `NumOperation` quedó y
 * qué `SReceiptType` (NEW/REN/SUP) resultó -- necesario para saber si el
 * cálculo de tipo de recibo de `generateReceipts` (`NumOperation===2 &&
 * ContractAge>1 -> 'REN'`) de verdad aplica a una renovación real, o si
 * la cuenta de operaciones ya viene en 3+ desde la contratación inicial
 * (CONTGENE=1, RECEGENE=2) y por lo tanto siempre cae en 'SUP'.
 *
 * No escribe nada. Uso:
 *   node packages/database/scripts/investigate-last-renewal.js
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error(`No se encontro DATABASE_URL en ${envPath}`);
  return match[1].trim();
}

async function main() {
  process.env.DATABASE_URL = loadDatabaseUrl();
  const prisma = new PrismaClient();

  const lastCycle = await prisma.tContractRenewalCycle.findFirst({ orderBy: { TstRenewed: 'desc' } });
  if (!lastCycle) {
    console.log('No hay ninguna fila en TContractRenewalCycle todavía.');
    await prisma.$disconnect();
    return;
  }
  console.log(`Última renovación: IdeContract=${lastCycle.IdeContract}, TstTrigger=${lastCycle.TstTrigger.toISOString()}, TstRenewed=${lastCycle.TstRenewed.toISOString()}`);

  const contract = await prisma.tContract.findUnique({ where: { IdeContract: lastCycle.IdeContract } });
  console.log(`\nContrato: ContractAge=${contract.ContractAge}, TstInitial=${contract.TstInitial.toISOString()}, TstEnd=${contract.TstEnd?.toISOString()}`);

  console.log('\n=== TContractOperation (orden cronológico) ===');
  const operations = await prisma.tContractOperation.findMany({
    where: { IdeContract: lastCycle.IdeContract },
    include: { SOperationProduct: { include: { SOperation: true, SProcess: true } } },
    orderBy: { NumOperation: 'asc' },
  });
  for (const op of operations) {
    console.log(
      `  NumOperation=${op.NumOperation} -- Operación "${op.SOperationProduct.SOperation.CodOperation}" ` +
        `(${op.SOperationProduct.SOperation.DesOperation}) -- Proceso "${op.SOperationProduct.SProcess.CodProcess}" ` +
        `(${op.SOperationProduct.SProcess.DesProcess}) -- TstRequest=${op.TstRequest.toISOString()}`,
    );
  }

  console.log('\n=== TReceipt (orden cronológico) ===');
  const receipts = await prisma.tReceipt.findMany({
    where: { IdeContract: lastCycle.IdeContract },
    include: { SReceiptType: true, TContractOperation: true },
    orderBy: { TstIssue: 'asc' },
  });
  for (const r of receipts) {
    console.log(
      `  Recibo tipo "${r.SReceiptType.CodReceiptType}" (${r.SReceiptType.DesReceiptType}) -- ` +
        `NumOperation=${r.TContractOperation?.NumOperation ?? 'null'} -- Prime=${r.Prime} -- TstIssue=${r.TstIssue.toISOString()}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
