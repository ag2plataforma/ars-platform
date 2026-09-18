#!/usr/bin/env node
/**
 * Verifica (solo lectura) que la cascada de creación de contrato haya
 * generado correctamente las filas que `ContractsService.findOne()` NO
 * incluye en su respuesta: TContractPerson, TContractDistributionChannel,
 * TContractBilling y TReceipt/TReceiptDetail.
 *
 * Uso:
 *   node packages/database/scripts/verify-contract-cascade.js <ideContract>
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
  const ideContract = process.argv[2];
  if (!ideContract) {
    console.error('Uso: node packages/database/scripts/verify-contract-cascade.js <ideContract>');
    process.exit(1);
  }

  console.log(`=== Verificando contrato ${ideContract} ===\n`);

  console.log('--- TContractPerson ---');
  const contractPersons = await prisma.tContractPerson.findMany({
    where: { IdeContract: ideContract },
    include: {
      TPerson: { select: { IdePerson: true, DesFirstName: true, DesLastName1: true, IndClient: true, IndLead: true } },
      SPersonRol: { select: { CodPersonRol: true } },
    },
  });
  if (contractPersons.length === 0) {
    console.log('  ¡NINGUNA fila encontrada! (se esperaba al menos TOMADOR)');
  } else {
    for (const cp of contractPersons) {
      console.log(
        `  Rol=${cp.SPersonRol?.CodPersonRol ?? '(sin rol)'} Persona=${cp.TPerson?.DesFirstName ?? ''} ${cp.TPerson?.DesLastName1 ?? ''} IndClient=${cp.TPerson?.IndClient} IndLead=${cp.TPerson?.IndLead}`,
      );
    }
  }

  console.log('\n--- TContractDistributionChannel ---');
  const channels = await prisma.tContractDistributionChannel.findMany({
    where: { IdeContract: ideContract },
  });
  if (channels.length === 0) {
    console.log('  ¡NINGUNA fila encontrada!');
  } else {
    const channelIds = [...new Set(channels.map((c) => c.IdeDistributionChannel))];
    const channelCodes = await prisma.sDistributionChannel.findMany({
      where: { IdeDistributionChannel: { in: channelIds } },
      select: { IdeDistributionChannel: true, CodDistributionChannel: true },
    });
    const codeById = Object.fromEntries(channelCodes.map((c) => [c.IdeDistributionChannel, c.CodDistributionChannel]));
    for (const c of channels) {
      console.log(`  Canal=${codeById[c.IdeDistributionChannel] ?? c.IdeDistributionChannel} Porcentaje=${c.Percentaje} IndMain=${c.IndMain}`);
    }
  }

  console.log('\n--- TContractBilling ---');
  const billing = await prisma.tContractBilling.findMany({
    where: { IdeContract: ideContract },
    orderBy: { NumPeriod: 'asc' },
  });
  console.log(`  ${billing.length} período(s) de facturación encontrados${billing.length !== 12 ? '  <-- se esperaban 12 (fracción mensual)' : ''}`);
  for (const b of billing.slice(0, 3)) {
    console.log(`    #${b.NumPeriod}: ${b.TstInitial?.toISOString?.().slice(0, 10)} -> ${b.TstEnd?.toISOString?.().slice(0, 10)}`);
  }
  if (billing.length > 3) console.log(`    ... (${billing.length - 3} más)`);

  console.log('\n--- TReceipt / TReceiptDetail ---');
  const receipts = await prisma.tReceipt.findMany({
    where: { IdeContract: ideContract },
    include: {
      SReceiptType: { select: { CodReceiptType: true } },
      TReceiptDetail: true,
    },
  });
  if (receipts.length === 0) {
    console.log('  ¡NINGÚN recibo encontrado!');
  } else {
    for (const r of receipts) {
      console.log(
        `  Recibo NumReceipt=${r.NumReceipt} Tipo=${r.SReceiptType?.CodReceiptType} Fee=${r.Fee} Prime=${r.Prime} -- ${r.TReceiptDetail.length} detalle(s)`,
      );
      for (const d of r.TReceiptDetail) {
        console.log(`    detalle: ConceptValue=${d.ConceptValue}`);
      }
    }
  }

  console.log('\n=== Fin de la verificación ===');
}

main()
  .catch((err) => {
    console.error('ERROR:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
