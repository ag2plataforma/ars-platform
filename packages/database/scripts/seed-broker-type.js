#!/usr/bin/env node
/**
 * Crea un `SBrokerType` de prueba (`SEED_BROKERTYPE`) -- la tabla vino
 * vacía en la migración de `ars_platform` (igual que el resto de
 * catálogos de negocio: la migración trajo estructura, no datos) y,
 * a diferencia de `SDistributionChannel`/`SProcess`/`SProduct`, no
 * quedó cubierta por `db:seed-example-rules`. `BrokersModule` no trae
 * CRUD propio para `SBrokerType` (es solo una FK que resuelve por
 * código, mismo criterio que `SDistributionChannel`/`SProcess` en el
 * resto del módulo) así que hace falta esta fila mínima para poder
 * probar `POST /brokers`.
 *
 * Uso: node packages/database/scripts/seed-broker-type.js
 * Idempotente: si `SEED_BROKERTYPE` ya existe, no hace nada.
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

loadEnvFile(path.resolve(__dirname, '../../../services/party-service/.env'));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const COD_BROKER_TYPE = 'SEED_BROKERTYPE';

async function main() {
  const existing = await prisma.sBrokerType.findUnique({ where: { CodBrokerType: COD_BROKER_TYPE } });
  if (existing) {
    console.log(`Ya existía: ${COD_BROKER_TYPE} (${existing.IdeBrokerType})`);
    return;
  }

  const activeState = await prisma.sState.findFirst({ where: { CodState: 'ACTIVO' } });
  if (!activeState) {
    throw new Error('No existe SState con CodState="ACTIVO" en ars_platform.');
  }

  const now = new Date();
  const system = 'seed-script';
  const created = await prisma.sBrokerType.create({
    data: {
      CodBrokerType: COD_BROKER_TYPE,
      DesBrokerType: '[SEED] Tipo de broker de ejemplo',
      IdeState: activeState.IdeState,
      UsrCreation: system,
      TstCreation: now,
      UsrModification: system,
      TstModification: now,
    },
  });
  console.log(`Creado: ${COD_BROKER_TYPE} (${created.IdeBrokerType})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
