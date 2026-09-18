// Correr en la carpeta del proyecto: node packages/database/scripts/verify_receipt.js
// (o copiarlo a esa carpeta primero) -- usa dotenv manual, mismo patrón usado
// en toda esta sesión para queries que no puede correr el device_bash.
const { execSync } = require('child_process');
const envContent = require('fs').readFileSync('services/underwriting-service/.env', 'utf-8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const IDE_CONTRACT = '13ead789-d1b5-494e-a539-1b2d7174dbed';

async function main() {
  const receipts = await prisma.tReceipt.findMany({
    where: { IdeContract: IDE_CONTRACT },
    include: {
      TReceiptDetail: {
        include: { SConcept: { select: { CodConcept: true } } },
      },
      TContractOperation: { select: { NumOperation: true } },
      SReceiptType: { select: { CodReceiptType: true } },
    },
  });
  console.log(JSON.stringify(receipts, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
