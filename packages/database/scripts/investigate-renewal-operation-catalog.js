#!/usr/bin/env node
/**
 * Investigación de solo lectura: qué operaciones/procesos (`SOperation`/
 * `SProcess`/`SOperationProduct`) existen HOY en la base real, para poder
 * diseñar bien una operación dedicada de "Renovación de contrato"
 * (`RENOVGENE`, análoga a `CONTGENE`/`ANULGENE`/`RECEGENE`, todas
 * literales hardcodeadas en `ContractsService`).
 *
 * Motivo: al renovar (Etapa 1, ver docs/02-roadmap.md) solo se genera la
 * operación `RECEGENE` (vía `generateReceipts`, reutilizado tal cual) --
 * a diferencia de los suplementos (`changeInsuredAmount`/`addCoverage`/
 * etc.), que generan 2 operaciones: la propia del suplemento (resuelta
 * por endoso, `resolveOperationCodeByEndorsement`) + `RECEGENE`. Como
 * `RECEGENE` para un producto está configurado con el `SProcess` que se
 * usó originalmente para la Contratación, la renovación queda mostrando
 * "Proceso: Contratación de Póliza" en vez de algo propio -- hay que
 * confirmar los nombres/códigos reales antes de crear la configuración
 * nueva.
 *
 * No escribe nada. Uso:
 *   node packages/database/scripts/investigate-renewal-operation-catalog.js
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

  console.log('=== SProcess (todos) ===');
  const processes = await prisma.sProcess.findMany({ orderBy: { CodProcess: 'asc' } });
  for (const p of processes) {
    console.log(`  ${p.CodProcess} -- "${p.DesProcess}" (IdeProcess=${p.IdeProcess}, IdeState=${p.IdeState})`);
  }

  console.log('\n=== SOperation (todas) ===');
  const operations = await prisma.sOperation.findMany({ orderBy: { CodOperation: 'asc' } });
  for (const o of operations) {
    console.log(`  ${o.CodOperation} -- "${o.DesOperation}" (IdeOperation=${o.IdeOperation}, IdeState=${o.IdeState})`);
  }

  console.log('\n=== SOperationProduct (todas, con Producto + Operación + Proceso) ===');
  const operationProducts = await prisma.sOperationProduct.findMany({
    include: { SProduct: { select: { DesProduct: true } }, SOperation: true, SProcess: true },
    orderBy: [{ IdeProduct: 'asc' }, { Order: 'asc' }],
  });
  for (const row of operationProducts) {
    console.log(
      `  Producto "${row.SProduct?.DesProduct ?? row.IdeProduct}" -> ` +
        `Operación "${row.SOperation.CodOperation}" (${row.SOperation.DesOperation}) -> ` +
        `Proceso "${row.SProcess.CodProcess}" (${row.SProcess.DesProcess}) ` +
        `[Order=${row.Order}, IdeProductEndorsement=${row.IdeProductEndorsement ?? 'null'}]`,
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
