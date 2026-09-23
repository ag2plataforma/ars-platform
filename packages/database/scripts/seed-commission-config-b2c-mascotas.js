#!/usr/bin/env node
/**
 * Carga la cadena de comisión (`SCommissionTree` -> `SCommissionTable` ->
 * `SCommission`) que faltaba para el canal "Canal B2C" + producto
 * "Mascotas" -- confirmado con `investigate-missing-commission.js` que
 * el corte estaba en el primer eslabón (no existía NINGÚN
 * `SCommissionTree` para ese canal), causa de que `CONT-2026-28`
 * generara su recibo con `Fee=0`.
 *
 * Comodín (`IdePlanProductRisk`/`IdeCoveragePlan` en NULL -- aplica a
 * TODO el producto Mascotas, no a un plan/cobertura puntual), vigente
 * en un rango amplio (2000-01-01 a 2099-12-31), sobre el proceso real
 * de generación de recibo (`RECEGENE`) del producto. Porcentaje
 * PLACEHOLDER (10% por defecto, o el primer argumento) -- ajustar al
 * valor comercial real cuando se defina (por ahora sin pantalla propia,
 * ver docs/02-roadmap.md; se puede editar después vía
 * `PATCH /commissions/:id` en `party-service`).
 *
 * Idempotente (no duplica si ya corriste esto antes). Uso:
 *   node packages/database/scripts/seed-commission-config-b2c-mascotas.js [porcentaje]
 *
 * Ejemplo: node packages/database/scripts/seed-commission-config-b2c-mascotas.js 12
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
loadEnvFile(path.join(__dirname, '..', '.env'));

const prisma = new PrismaClient();
const SYSTEM = 'seed-script';
const FAR_PAST = new Date('2000-01-01T00:00:00.000Z');
const FAR_FUTURE = new Date('2099-12-31T00:00:00.000Z');

async function main() {
  const percentageArg = process.argv[2] ? Number(process.argv[2]) : 10;
  if (Number.isNaN(percentageArg) || percentageArg <= 0) {
    throw new Error(`Porcentaje inválido: "${process.argv[2]}" -- pasá un número mayor a 0.`);
  }

  const now = new Date();
  const audit = { UsrCreation: SYSTEM, TstCreation: now, UsrModification: SYSTEM, TstModification: now };

  const activeState = await prisma.sState.findFirst({ where: { CodState: 'ACTIVO' } });
  if (!activeState) throw new Error('No existe SState con CodState="ACTIVO".');
  const ideActivo = activeState.IdeState;

  const channel = await prisma.sDistributionChannel.findFirst({ where: { DesDistributionChannel: 'Canal B2C' } });
  if (!channel) throw new Error('No se encontró SDistributionChannel con DesDistributionChannel="Canal B2C".');

  const product = await prisma.sProduct.findFirst({ where: { DesProduct: 'Mascotas' } });
  if (!product) throw new Error('No se encontró SProduct con DesProduct="Mascotas".');

  const receiptOperationProduct = await prisma.sOperationProduct.findFirst({
    where: { IdeProduct: product.IdeProduct, SOperation: { CodOperation: 'RECEGENE' } },
    include: { SProcess: true },
  });
  if (!receiptOperationProduct) {
    throw new Error(`No se encontró SOperationProduct para el producto "Mascotas" + CodOperation="RECEGENE".`);
  }
  console.log(`Canal: Canal B2C (${channel.IdeDistributionChannel})`);
  console.log(`Producto: Mascotas (${product.IdeProduct})`);
  console.log(`Proceso de RECEGENE: ${receiptOperationProduct.SProcess.DesProcess} (${receiptOperationProduct.IdeProcess})`);

  // --- SCommissionTree ---
  let tree = await prisma.sCommissionTree.findFirst({ where: { IdeDistributionChannel: channel.IdeDistributionChannel } });
  if (tree) {
    console.log(`= SCommissionTree ya existía (${tree.CodCommissionTree})`);
  } else {
    tree = await prisma.sCommissionTree.create({
      data: {
        CodCommissionTree: 'CT-B2C',
        DesCommissionTree: 'Canal B2C',
        IdeDistributionChannel: channel.IdeDistributionChannel,
        IdeState: ideActivo,
        ...audit,
      },
    });
    console.log(`+ SCommissionTree creado (${tree.CodCommissionTree})`);
  }

  // --- SCommissionTable (comodín: todo el producto Mascotas) ---
  let table = await prisma.sCommissionTable.findFirst({
    where: { IdeCommissionTree: tree.IdeCommissionTree, IdeProduct: product.IdeProduct, IdePlanProductRisk: null, IdeCoveragePlan: null },
  });
  if (table) {
    console.log(`= SCommissionTable ya existía (${table.CodCommissionTable})`);
  } else {
    table = await prisma.sCommissionTable.create({
      data: {
        CodCommissionTable: 'CTA-B2C-MASCOTAS',
        DesCommissionTable: 'Canal B2C -- Mascotas (comodín)',
        IdeCommissionTree: tree.IdeCommissionTree,
        IdeProduct: product.IdeProduct,
        IdePlanProductRisk: null,
        IdeCoveragePlan: null,
        IdeState: ideActivo,
        ...audit,
      },
    });
    console.log(`+ SCommissionTable creada (${table.CodCommissionTable})`);
  }

  // --- SCommission (10% u otro % pasado por argumento) ---
  let commission = await prisma.sCommission.findFirst({
    where: { IdeCommissionTable: table.IdeCommissionTable, IdeProcess: receiptOperationProduct.IdeProcess, NumMovement: 1 },
  });
  if (commission) {
    console.log(`= SCommission ya existía (${commission.Percentaje}%)`);
  } else {
    commission = await prisma.sCommission.create({
      data: {
        IdeCommissionTable: table.IdeCommissionTable,
        IdeProcess: receiptOperationProduct.IdeProcess,
        Percentaje: percentageArg,
        TstInitial: FAR_PAST,
        TstEnd: FAR_FUTURE,
        NumMovement: 1,
        IdeState: ideActivo,
        ...audit,
      },
    });
    console.log(`+ SCommission creada (${percentageArg}%) -- PLACEHOLDER, ajustar al valor comercial real cuando se defina.`);
  }

  console.log('\nListo. El PRÓXIMO contrato que se genere sobre Canal B2C + Mascotas ya va a calcular comisión real.');
  console.log('El contrato CONT-2026-28 ya probado NO se recalcula solo -- su recibo ya existente queda con Fee=0 (no se toca nada retroactivamente).');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
