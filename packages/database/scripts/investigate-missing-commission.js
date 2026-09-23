#!/usr/bin/env node
/**
 * Diagnóstico de por qué un contrato puntual no generó comisión al
 * canal de distribución (`TReceipt.Fee=0`) -- reportado por el usuario
 * el 23/09/2026 al probar la pantalla de detalle de contrato ("puede
 * ser configuración"). Replica, paso a paso y solo lectura, la MISMA
 * cadena de resolución real de `ContractsService.resolveMainDistributionChannel`
 * / `resolveCommissionPercentage` (`services/underwriting-service/src/contracts/contracts.service.ts`)
 * para decir exactamente en qué eslabón se corta:
 *
 *   1. Canal de distribución principal vigente del contrato
 *      (`TContractDistributionChannel`, `IndMain=true`, `Activo`).
 *   2. `SCommissionTree` activo para ese canal.
 *   3. `SCommissionTable` activa para ese árbol + el producto del contrato.
 *   4. `SCommission` activa para esa tabla + el proceso de la operación
 *      de recibo (`RECEGENE`) + vigente a la fecha de hoy.
 *
 * No modifica nada -- solo lectura. Uso:
 *   node packages/database/scripts/investigate-missing-commission.js [NumContract]
 *
 * Sin argumento, toma el contrato más reciente (`TstCreation` desc).
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

async function main() {
  const numContractArg = process.argv[2] ?? null;

  const contract = numContractArg
    ? await prisma.tContract.findFirst({ where: { NumContract: numContractArg } })
    : await prisma.tContract.findFirst({ orderBy: { TstCreation: 'desc' } });

  if (!contract) {
    console.log(numContractArg ? `No existe ningún contrato con NumContract="${numContractArg}".` : 'No hay ningún contrato en la base.');
    return;
  }
  console.log(`=== Contrato ${contract.NumContract} (IdeContract=${contract.IdeContract}) ===`);
  const product = await prisma.sProduct.findUnique({ where: { IdeProduct: contract.IdeProduct } });
  console.log(`Producto: ${product?.DesProduct ?? '???'} (IdeProduct=${contract.IdeProduct})`);

  const ideActivo = (await prisma.sState.findFirst({ where: { CodState: 'ACTIVO' } }))?.IdeState;
  if (!ideActivo) {
    console.log('\nNo existe el estado "Activo" (SState) -- algo más grave, revisar la máquina de estados.');
    return;
  }

  console.log('\n=== Paso 1: Canal de distribución principal vigente (TContractDistributionChannel) ===');
  const now = new Date();
  const allChannels = await prisma.tContractDistributionChannel.findMany({
    where: { IdeContract: contract.IdeContract },
    include: { SState: true },
  });
  if (allChannels.length === 0) {
    console.log('El contrato no tiene NINGÚN TContractDistributionChannel -- eso ya explicaría el Fee=0 (resolveMainDistributionChannel tira NotFoundException, generateReceipts fallaría entero, no solo el Fee).');
    return;
  }
  for (const ch of allChannels) {
    const dist = await prisma.sDistributionChannel.findUnique({ where: { IdeDistributionChannel: ch.IdeDistributionChannel } });
    console.log(
      `- ${dist?.DesDistributionChannel ?? '???'} (IdeDistributionChannel=${ch.IdeDistributionChannel}) | IndMain=${ch.IndMain} | Estado=${ch.SState.DesState} | NumMovement=${ch.NumMovement} | vigencia ${ch.TstInitial.toISOString().slice(0, 10)} -> ${ch.TstEnd.toISOString().slice(0, 10)}`,
    );
  }

  const mainCandidates = allChannels.filter((ch) => ch.IndMain && ch.IdeState === ideActivo);
  const eligible = mainCandidates.filter((ch) => {
    const greatest = ch.TstInitial.getTime() > now.getTime() ? ch.TstInitial : now;
    return greatest.getTime() <= ch.TstEnd.getTime();
  });
  eligible.sort((a, b) => b.NumMovement - a.NumMovement);
  const mainChannel = eligible[0];

  if (!mainChannel) {
    console.log(
      '\n>>> CORTE ACÁ: ningún canal cumple IndMain=true + Estado=Activo + vigente hoy -- `resolveMainDistributionChannel` tiraría NotFoundException (generateReceipts fallaría entero). Si el contrato SÍ tiene recibo con Fee=0, esto no es la causa (habría fallado antes); revisar el paso 2 igual, puede que se haya resuelto distinto en el momento de contratar (vigencias por fecha).',
    );
  } else {
    const mainDist = await prisma.sDistributionChannel.findUnique({ where: { IdeDistributionChannel: mainChannel.IdeDistributionChannel } });
    console.log(`\nCanal principal resuelto: ${mainDist?.DesDistributionChannel ?? '???'} (IdeDistributionChannel=${mainChannel.IdeDistributionChannel})`);

    console.log('\n=== Paso 2: SCommissionTree activo para ese canal ===');
    const trees = await prisma.sCommissionTree.findMany({
      where: { IdeDistributionChannel: mainChannel.IdeDistributionChannel },
      include: { SState: true },
    });
    if (trees.length === 0) {
      console.log('>>> CORTE ACÁ: no existe NINGÚN SCommissionTree (ni siquiera inactivo) para este canal -- hay que crear uno y su árbol completo (SCommissionTable + SCommission) para que este canal pague comisión.');
    } else {
      for (const t of trees) console.log(`- IdeCommissionTree=${t.IdeCommissionTree} | Estado=${t.SState.DesState}`);
      const activeTrees = trees.filter((t) => t.IdeState === ideActivo);
      if (activeTrees.length === 0) {
        console.log('>>> CORTE ACÁ: existe(n) SCommissionTree para este canal pero ninguno está Activo.');
      } else {
        console.log('\n=== Paso 3: SCommissionTable activa para ese árbol + el producto del contrato ===');
        const tables = await prisma.sCommissionTable.findMany({
          where: { IdeCommissionTree: { in: activeTrees.map((t) => t.IdeCommissionTree) } },
          include: { SState: true },
        });
        const forProduct = tables.filter((t) => t.IdeProduct === contract.IdeProduct);
        if (forProduct.length === 0) {
          console.log(
            `>>> CORTE ACÁ: el árbol tiene ${tables.length} SCommissionTable en total, pero NINGUNA para el producto "${product?.DesProduct}" (IdeProduct=${contract.IdeProduct}) -- hay que agregar una fila de SCommissionTable para este producto (con IdePlanProductRisk/IdeCoveragePlan null si aplica a todo el producto).`,
          );
        } else {
          for (const t of forProduct) {
            console.log(`- IdeCommissionTable=${t.IdeCommissionTable} | Estado=${t.SState.DesState} | IdePlanProductRisk=${t.IdePlanProductRisk ?? '(todos)'} | IdeCoveragePlan=${t.IdeCoveragePlan ?? '(todas)'}`);
          }
          const activeForProduct = forProduct.filter((t) => t.IdeState === ideActivo);
          if (activeForProduct.length === 0) {
            console.log('>>> CORTE ACÁ: hay SCommissionTable para este producto pero ninguna está Activa.');
          } else {
            console.log('\n=== Paso 4: SCommission activa, vigente hoy, para el proceso de la operación de recibo (RECEGENE) ===');
            const recegeneOperationProduct = await prisma.sOperationProduct.findFirst({
              where: { IdeProduct: contract.IdeProduct, SOperation: { CodOperation: 'RECEGENE' } },
              include: { SProcess: true },
            });
            if (!recegeneOperationProduct) {
              console.log(`>>> No se encontró SOperationProduct para IdeProduct=${contract.IdeProduct} + CodOperation="RECEGENE" -- revisar configuración del producto (esto es lo que usa la propia generación del recibo, no específico de comisión).`);
            } else {
              console.log(`Proceso de RECEGENE para este producto: ${recegeneOperationProduct.SProcess.DesProcess} (IdeProcess=${recegeneOperationProduct.IdeProcess})`);
              for (const t of activeForProduct) {
                const commissions = await prisma.sCommission.findMany({
                  where: { IdeCommissionTable: t.IdeCommissionTable },
                  include: { SState: true, SProcess: true },
                });
                console.log(`\n  Tabla ${t.IdeCommissionTable} -- ${commissions.length} fila(s) de SCommission:`);
                for (const c of commissions) {
                  console.log(
                    `  - Proceso=${c.SProcess.DesProcess} | Estado=${c.SState.DesState} | ${c.Percentaje}% | vigencia ${c.TstInitial.toISOString().slice(0, 10)} -> ${c.TstEnd.toISOString().slice(0, 10)} | NumMovement=${c.NumMovement}`,
                  );
                }
                const match = commissions.find(
                  (c) =>
                    c.IdeProcess === recegeneOperationProduct.IdeProcess &&
                    c.IdeState === ideActivo &&
                    c.TstInitial.getTime() <= now.getTime() &&
                    c.TstEnd.getTime() >= now.getTime(),
                );
                if (!match) {
                  console.log(
                    `  >>> CORTE ACÁ: ninguna fila de SCommission de esta tabla matchea proceso="${recegeneOperationProduct.SProcess.DesProcess}" + Activa + vigente hoy -- por eso "resolveCommissionPercentage" devuelve null y el Fee queda en 0.`,
                  );
                } else {
                  console.log(`  Match encontrado: ${match.Percentaje}% -- ¡la configuración está OK! Si el Fee del recibo real sigue en 0, el problema puede estar en otro lado (revisar TReceiptDetail del recibo real, o si el contrato se generó ANTES de cargar esta configuración).`);
                }
              }
            }
          }
        }
      }
    }
  }

  console.log('\n=== Recibos reales ya generados para este contrato (TReceipt) ===');
  const receipts = await prisma.tReceipt.findMany({
    where: { IdeContract: contract.IdeContract },
    include: { SReceiptType: true, SState: true },
    orderBy: { TstIssue: 'asc' },
  });
  for (const r of receipts) {
    console.log(`- ${r.NumReceipt} (${r.SReceiptType.DesReceiptType}) | Prime=${r.Prime} | Fee=${r.Fee} | Estado=${r.SState.DesState}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
