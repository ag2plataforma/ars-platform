#!/usr/bin/env node
/**
 * Corrige un gap real descubierto por el usuario al probar "Activar
 * contrato" en pantalla (2026-09-29): `TContractPerson` (Titular/Tomador)
 * quedaba en estado "Borrador" para siempre, incluso con el contrato ya
 * Activo.
 *
 * Causa raíz: `seed-contract-testing-fixtures.js` clasificó a
 * `TContractPerson` dentro de `NO_TRANSITION_ENTITIES` -- junto con
 * `TContractBilling`/`TContractOperation`/`TReceipt`/etc., entidades que
 * "solo necesitan un estado inicial fijo, sin transición" -- así que nunca
 * se le creó ninguna fila `SStateRule` con `DesOperativeCode`, a
 * diferencia del árbol del contrato (`TContract` -> ... ->
 * `TMovementConcept`, `CONTRACT_TREE_ENTITIES`), que sí tiene la
 * transición `'Activar'` (Borrador -> Activo). Esto además significa que
 * `ContractsService.validateChangePersonData` (suplemento "Cambio Datos
 * Titular/Tomador"), que exige `TContractPerson.IdeState = Activo`, nunca
 * podía encontrar una persona que calificara.
 *
 * Este script agrega la transición faltante -- `TContractPerson`:
 * `SEED_BORRADOR -> ACTIVO` vía operativo `'Activar'` -- y, opcionalmente,
 * hace el backfill de datos: activa las `TContractPerson` que ya quedaron
 * huérfanas en Borrador en contratos que YA están Activos (createados/
 * activados antes de esta corrección). Reutiliza el mismo patrón
 * `findOrCreateByCode`/idempotente de `seed-contract-testing-fixtures.js`.
 *
 * Requiere haber corrido antes `seed-contract-testing-fixtures.js` (crea
 * los estados `SEED_BORRADOR`/`ACTIVO` y la entidad `TContractPerson` en
 * `SEntity`) -- si falta alguno de los dos, este script aborta con un
 * mensaje claro en vez de crearlos de nuevo con datos distintos.
 *
 * Uso (desde la raíz del repo, con services/iam-service/.env configurado):
 *
 *   node packages/database/scripts/seed-activate-contract-person-transition.js
 *     -> Agrega la transición si falta (siempre seguro, es solo catálogo).
 *        Para el backfill de datos: DRY RUN, solo lista las
 *        TContractPerson que activaría, no escribe nada.
 *
 *   node packages/database/scripts/seed-activate-contract-person-transition.js --confirm
 *     -> Además del paso de catálogo, ejecuta el backfill: activa esas
 *        TContractPerson huérfanas en contratos ya Activos.
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
const CONFIRM = process.argv.includes('--confirm');

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('No se encontró DATABASE_URL (ver services/iam-service/.env).');
  }
  const prisma = new PrismaClient();
  try {
    const now = new Date();
    const audit = { UsrCreation: SYSTEM, TstCreation: now, UsrModification: SYSTEM, TstModification: now };

    const sBorrador = await prisma.sState.findUnique({ where: { CodState: 'SEED_BORRADOR' } });
    if (!sBorrador) {
      throw new Error(
        'No existe SState "SEED_BORRADOR" -- corré primero seed-contract-testing-fixtures.js.',
      );
    }
    const sActivo = await prisma.sState.findUnique({ where: { CodState: 'ACTIVO' } });
    if (!sActivo) {
      throw new Error('No existe SState "ACTIVO" en ars_platform.');
    }
    const entity = await prisma.sEntity.findUnique({ where: { CodEntity: 'TContractPerson' } });
    if (!entity) {
      throw new Error(
        'No existe SEntity "TContractPerson" -- corré primero seed-contract-testing-fixtures.js.',
      );
    }

    // --- 1. Catálogo: agregar la transición Borrador -> Activo vía 'Activar' ---
    const existingRule = await prisma.sStateRule.findFirst({
      where: {
        IdeEntity: entity.IdeEntity,
        IdeStateFrom: sBorrador.IdeState,
        IdeStateTo: sActivo.IdeState,
        DesOperativeCode: 'Activar',
      },
    });
    if (existingRule) {
      console.log('= SStateRule ya existía (TContractPerson, SEED_BORRADOR -> ACTIVO, op=Activar)');
    } else {
      await prisma.sStateRule.create({
        data: {
          IdeEntity: entity.IdeEntity,
          IdeStateFrom: sBorrador.IdeState,
          IdeStateTo: sActivo.IdeState,
          IndInitialState: false,
          DesOperativeCode: 'Activar',
          IdeState: sActivo.IdeState,
          ...audit,
        },
      });
      console.log('+ SStateRule creada (TContractPerson, SEED_BORRADOR -> ACTIVO, op=Activar)');
    }

    // --- 2. Backfill de datos: TContractPerson huérfanas en Borrador cuyo
    //        contrato YA está Activo (creadas/activadas antes de esta
    //        corrección). ---
    const orphaned = await prisma.tContractPerson.findMany({
      where: { IdeState: sBorrador.IdeState, TContract: { IdeState: sActivo.IdeState } },
      include: {
        TPerson: { select: { DesFirstName: true, DesLastName1: true } },
        TContract: { select: { NumContract: true } },
      },
    });

    if (orphaned.length === 0) {
      console.log('No hay TContractPerson huérfanas para backfillear (0 encontradas).');
    } else if (!CONFIRM) {
      console.log(`\nDRY RUN -- se activarían ${orphaned.length} TContractPerson (correr con --confirm para aplicar):`);
      for (const cp of orphaned) {
        console.log(`  - Contrato ${cp.TContract.NumContract}: ${cp.TPerson.DesFirstName} ${cp.TPerson.DesLastName1 ?? ''}`.trimEnd());
      }
    } else {
      console.log(`\nActivando ${orphaned.length} TContractPerson (--confirm)...`);
      for (const cp of orphaned) {
        await prisma.tContractPerson.update({
          where: { IdeContractPerson: cp.IdeContractPerson },
          data: { IdeState: sActivo.IdeState, UsrModification: SYSTEM, TstModification: now },
        });
        console.log(`  + Activada: contrato ${cp.TContract.NumContract} -- ${cp.TPerson.DesFirstName} ${cp.TPerson.DesLastName1 ?? ''}`.trimEnd());
      }
    }

    console.log('\nListo.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
