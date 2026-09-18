#!/usr/bin/env node
/**
 * Corrige un bug de fixture real: `SEED_PRODUCT` (creado por
 * `seed-example-rules.js`) nació sin `TstEnd` (columna `SProduct.TstEnd`
 * queda NULL). Eso rompe `setNetPrime` (`FMovementConcept('SetNetPrime', ...)`
 * en `underwriting-service`): el original hace
 * `now() between pro."TstInitial" and pro."TstEnd"`, y con `TstEnd` NULL
 * ese `BETWEEN` da NULL/false -- la función entera termina sin hacer nada
 * (confirmado, no es un bug del código nuevo). Ya se corrigió
 * `seed-example-rules.js` para que un producto nuevo nazca con
 * `TstEnd = FAR_FUTURE` (mismo criterio que ya usa para `SPlanProductRisk`)
 * -- este script solo pone al día la fila que ya existe en tu BD real,
 * porque `findOrCreateByCode` no toca una fila que ya existe.
 *
 * Uso: node packages/database/scripts/fix-seed-product-tstend.js
 * Idempotente.
 */
const fs = require('fs');
const path = require('path');

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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, '../../../services/underwriting-service/.env'));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const FAR_FUTURE = new Date('2099-12-31T00:00:00.000Z');

async function main() {
  const product = await prisma.sProduct.findUnique({ where: { CodProduct: 'SEED_PRODUCT' } });
  if (!product) {
    console.log('No existe SEED_PRODUCT todavía -- corré antes seed-example-rules.js.');
    return;
  }
  if (product.TstEnd) {
    console.log(`SEED_PRODUCT ya tiene TstEnd (${product.TstEnd.toISOString()}), no se toca.`);
    return;
  }
  const updated = await prisma.sProduct.update({
    where: { IdeProduct: product.IdeProduct },
    data: { TstEnd: FAR_FUTURE },
  });
  console.log(`Corregido: SEED_PRODUCT.TstEnd = ${updated.TstEnd.toISOString()}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
