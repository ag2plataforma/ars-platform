// Correr en la raíz del proyecto: node packages/database/scripts/list_broker_catalogs.js
// Lista los códigos/ids reales disponibles para probar el nuevo BrokersModule
// (SBrokerType, SDistributionChannel, SProcess, SProduct, y algunas TPerson de
// ejemplo) -- mismo patrón dotenv manual usado en verify_receipt.js, porque
// device_bash no puede correr Prisma contra la BD real (mismatch de arquitectura
// del binario del engine).
const envContent = require('fs').readFileSync('services/party-service/.env', 'utf-8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const [brokerTypes, channels, processes, products, persons] = await Promise.all([
    prisma.sBrokerType.findMany({ take: 10, select: { CodBrokerType: true, DesBrokerType: true } }),
    prisma.sDistributionChannel.findMany({ take: 10, select: { CodDistributionChannel: true, DesDistributionChannel: true } }),
    prisma.sProcess.findMany({ take: 10, select: { CodProcess: true, DesProcess: true } }),
    prisma.sProduct.findMany({ take: 10, select: { CodProduct: true, DesProduct: true } }),
    prisma.tPerson.findMany({ take: 5, select: { IdePerson: true, NumIdentification: true } }),
  ]);

  console.log('--- SBrokerType (codBrokerType) ---');
  console.log(brokerTypes);
  console.log('--- SDistributionChannel (codDistributionChannel) ---');
  console.log(channels);
  console.log('--- SProcess (codProcess) ---');
  console.log(processes);
  console.log('--- SProduct (codProduct) ---');
  console.log(products);
  console.log('--- TPerson (idePerson, para el broker) ---');
  console.log(persons);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
