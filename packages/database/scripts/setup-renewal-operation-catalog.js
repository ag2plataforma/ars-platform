#!/usr/bin/env node
/**
 * Completa la configuración de catálogo que le falta a "Renovar contrato"
 * (Etapa 1, ver docs/02-roadmap.md) para generar 2 operaciones como los
 * demás suplementos, en vez de 1 sola.
 *
 * Causa raíz (encontrada por el usuario al probar en pantalla): `renew()`
 * solo llama a `generateReceipts()`, que crea la operación `RECEGENE` --
 * a diferencia de `changeInsuredAmount`/`addCoverage`/etc., que primero
 * crean SU PROPIA operación (resuelta por el endoso elegido) y RECIÉN
 * DESPUÉS llaman a `generateReceipts()`. Como `RECEGENE` para "Mascotas"
 * está configurado bajo el proceso `CONTRATACION` ("Contratacion de
 * Poliza", confirmado con `investigate-renewal-operation-catalog.js`), la
 * renovación queda mostrando ese proceso en vez de uno propio.
 *
 * Confirmado contra la BD real (mismo script de investigación): el
 * `SProcess` "RENOVACION" ("Renovacion de Poliza") YA EXISTE -- viene de
 * la migración original, hoy sin usar salvo como comodín en Requisitos
 * (ver docs/02-roadmap.md, ítem "Gestión de renovaciones"). Lo que NO
 * existe es una `SOperation` dedicada a la renovación en sí (no hay
 * función legado `FContract('RENEW', ...)` que replicar -- confirmado,
 * ver docs/01-especificacion-motor-negocio-actual.md) ni su
 * `SOperationProduct`.
 *
 * Este script (idempotente, `findOrCreateByCode`/`findOrCreate` igual que
 * los demás `setup-*`/`seed-*` de esta carpeta):
 *   1. Crea `SOperation` `RENOVGENE` ("Generación de Renovación") si no
 *      existe -- mismo patrón de nombre que `CONTGENE`/`RECEGENE`
 *      ("Generación de X").
 *   2. Por cada producto que YA tiene configurada la operación `CONTGENE`
 *      (es decir, cada producto real habilitado para Contratación), crea
 *      su `SOperationProduct` para `RENOVGENE` bajo el proceso
 *      `RENOVACION` existente -- sin `IdeProductEndorsement` (la
 *      renovación no depende de un endoso, igual que `CONTGENE`/
 *      `RECEGENE`).
 *
 * Después de correr esto, `ContractsService.renew()` pasa a llamar
 * `createContractOperation(ideContract, ideProduct, 'RENOVGENE', actor, tx)`
 * ANTES de `generateReceipts` (mismo orden que los suplementos) -- ese
 * cambio de código ya está hecho, este script solo prepara el catálogo
 * que ese código necesita encontrar.
 *
 * Uso (desde la raíz del repo, con services/iam-service/.env configurado):
 *   node packages/database/scripts/setup-renewal-operation-catalog.js
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

const SYSTEM = 'seed-script';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('No se encontró DATABASE_URL (ver services/iam-service/.env).');
  }
  const prisma = new PrismaClient();
  try {
    const now = new Date();
    const audit = { UsrCreation: SYSTEM, TstCreation: now, UsrModification: SYSTEM, TstModification: now };

    const activeState = await prisma.sState.findFirst({ where: { CodState: 'ACTIVO' } });
    if (!activeState) throw new Error('No existe SState con CodState="ACTIVO" en ars_platform.');
    const ideActivo = activeState.IdeState;

    async function findOrCreateByCode(model, codeField, code, extraData, label) {
      const existing = await prisma[model].findUnique({ where: { [codeField]: code } });
      if (existing) {
        console.log(`= ${label} ya existía (${code})`);
        return existing;
      }
      const created = await prisma[model].create({ data: { [codeField]: code, ...extraData, ...audit } });
      console.log(`+ ${label} creado (${code})`);
      return created;
    }

    // --- 1. SOperation RENOVGENE ---
    const renovOperation = await findOrCreateByCode(
      'sOperation',
      'CodOperation',
      'RENOVGENE',
      { DesOperation: 'Generación de Renovación', IdeState: ideActivo },
      'SOperation',
    );

    // --- 2. SProcess RENOVACION -- YA EXISTE, no se crea, solo se busca ---
    const renovProcess = await prisma.sProcess.findUnique({ where: { CodProcess: 'RENOVACION' } });
    if (!renovProcess) {
      throw new Error(
        'No existe SProcess "RENOVACION" -- se esperaba que ya existiera en la BD real (confirmado antes con investigate-renewal-operation-catalog.js). Abortando para no inventar un proceso nuevo por error.',
      );
    }
    console.log(`= SProcess "RENOVACION" encontrado ("${renovProcess.DesProcess}")`);

    // --- 3. SOperationProduct RENOVGENE, uno por cada producto con CONTGENE configurado ---
    const productsWithContgene = await prisma.sOperationProduct.findMany({
      where: { SOperation: { CodOperation: 'CONTGENE' } },
      include: { SProduct: { select: { IdeProduct: true, DesProduct: true } } },
    });
    if (productsWithContgene.length === 0) {
      console.log('(!) Ningún producto tiene CONTGENE configurado -- nada que enlazar en el paso 3.');
    }
    for (const row of productsWithContgene) {
      const existing = await prisma.sOperationProduct.findFirst({
        where: { IdeProduct: row.IdeProduct, IdeOperation: renovOperation.IdeOperation, IdeProcess: renovProcess.IdeProcess },
      });
      if (existing) {
        console.log(`= SOperationProduct (RENOVGENE) ya existía para "${row.SProduct.DesProduct}"`);
        continue;
      }
      const lastOrder = await prisma.sOperationProduct.findFirst({
        where: { IdeProduct: row.IdeProduct },
        orderBy: { Order: 'desc' },
        select: { Order: true },
      });
      const nextOrder = (lastOrder ? Number(lastOrder.Order) : 0) + 1;
      await prisma.sOperationProduct.create({
        data: {
          IdeProduct: row.IdeProduct,
          IdeOperation: renovOperation.IdeOperation,
          IdeProcess: renovProcess.IdeProcess,
          Order: nextOrder,
          IdeState: ideActivo,
          ...audit,
        },
      });
      console.log(`+ SOperationProduct (RENOVGENE) creado para "${row.SProduct.DesProduct}" (Order=${nextOrder})`);
    }

    console.log('\nOK. Catálogo de renovación listo.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
