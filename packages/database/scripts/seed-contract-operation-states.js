#!/usr/bin/env node
/**
 * Agrega las transiciones de estado que le faltaban a `TContractOperation`
 * (la tabla que alimenta la pestaña "Movimientos" del detalle de
 * contrato) -- a pedido explícito del usuario tras notar que TODAS las
 * operaciones (Alta, Anulación, Recibos) quedaban eternamente en
 * "Borrador", sin reflejar que ya se completaron.
 *
 * `TContractOperation` nace en Borrador (marcador de estado inicial ya
 * sembrado por `seed-contract-testing-fixtures.js`, dentro de
 * `NO_TRANSITION_ENTITIES` -- ESE marcador NO se toca acá, solo se
 * agregan transiciones nuevas). Este script agrega:
 *   - 'Activar': Borrador -> Activo (usado por `ContractsService` para
 *     CONTGENE/RECEGENE -- la operación de Alta y la de generación de
 *     recibos, ver `createContractOperation`).
 *   - 'Anular': Borrador -> Anulado (usado por la operación de
 *     anulación propiamente dicha).
 *
 * Reutiliza el mismo estado "Anulado" genérico (`SEED_ANULADO`) que ya
 * crea `seed-cancelcontract-fixtures.js` para TContract/TContractFile/
 * TFileRisk/TRiskCoverage/TCoverageMovement/TMovementConcept -- si ese
 * script todavía no corrió, este lo crea él mismo (idempotente, mismo
 * criterio `findOrCreateByCode` que el resto).
 *
 * No depende de ningún producto/endoso de prueba en particular --
 * aplica a CUALQUIER contrato real, igual que el resto de la
 * configuración de `SStateRule`.
 *
 * Idempotente. Uso: node packages/database/scripts/seed-contract-operation-states.js
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

    const borrador = await prisma.sState.findFirst({ where: { CodState: 'SEED_BORRADOR' } });
    if (!borrador) {
      throw new Error(
        'No existe SEED_BORRADOR -- correr primero: node packages/database/scripts/seed-contract-testing-fixtures.js',
      );
    }

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

    const anulado = await findOrCreateByCode('sState', 'CodState', 'SEED_ANULADO', { DesState: '[SEED] Anulado' }, 'SState (Anulado)');

    const entity = await findOrCreateByCode(
      'sEntity',
      'CodEntity',
      'TContractOperation',
      { DesEntity: '[SEED] TContractOperation', IdeState: ideActivo },
      'SEntity (TContractOperation)',
    );

    async function findOrCreateStateRule(ideStateFrom, ideStateTo, desOperativeCode) {
      const existing = await prisma.sStateRule.findFirst({
        where: { IdeEntity: entity.IdeEntity, IdeStateFrom: ideStateFrom, IdeStateTo: ideStateTo, DesOperativeCode: desOperativeCode },
      });
      if (existing) {
        console.log(`= SStateRule ya existía (TContractOperation, op=${desOperativeCode})`);
        return existing;
      }
      const created = await prisma.sStateRule.create({
        data: {
          IdeEntity: entity.IdeEntity,
          IdeStateFrom: ideStateFrom,
          IdeStateTo: ideStateTo,
          IndInitialState: false,
          DesOperativeCode: desOperativeCode,
          IdeState: ideActivo,
          ...audit,
        },
      });
      console.log(`+ SStateRule creada (TContractOperation, op=${desOperativeCode})`);
      return created;
    }

    await findOrCreateStateRule(borrador.IdeState, ideActivo, 'Activar');
    await findOrCreateStateRule(borrador.IdeState, anulado.IdeState, 'Anular');

    console.log('\n=== Listo. TContractOperation ya puede transicionar Borrador -> Activo (\'Activar\') y Borrador -> Anulado (\'Anular\'). ===');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
