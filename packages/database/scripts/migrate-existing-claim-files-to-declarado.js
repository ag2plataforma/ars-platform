#!/usr/bin/env node
/**
 * Fix de datos, Fase 4 (Siniestros), Etapa 2, 2026-09-27.
 *
 * Por qué hace falta: `TClaimFile` estuvo en `NO_TRANSITION_ENTITIES` en
 * `seed-contract-testing-fixtures.js` hasta el 2026-09-24 (Etapa 1) --
 * cualquier siniestro declarado ANTES de correr
 * `seed-claims-approval-workflow.js` (que le dio a `TClaimFile` su
 * máquina de estados real) quedó con `IdeState` apuntando a
 * `SEED_BORRADOR` ("[SEED] Borrador"), el placeholder de esa lista.
 *
 * `seed-claims-approval-workflow.js` limpió el marcador de estado
 * INICIAL obsoleto en `SStateRule` (para que las carpetas NUEVAS nazcan
 * en "Declarado"), pero no toca filas de `TClaimFile` ya existentes --
 * esas se quedan huérfanas: como "SEED_BORRADOR" no es ninguno de los
 * estados de la máquina nueva (Declarado/En revisión de
 * requisitos/En evaluación/Aprobado/Rechazado/Pagado/Cerrado/Reabierto),
 * `StateMachineService.getNextState` no encuentra ninguna transición
 * legal para ellas y el frontend no tiene ningún botón que ofrecerles.
 *
 * Este script mueve esas carpetas huérfanas a "Declarado" (el estado
 * inicial real de la máquina nueva) para que puedan seguir avanzando
 * con los botones normales. Es un fix de datos único, no un seed --
 * idempotente (una segunda corrida no encuentra ninguna fila para
 * mover, no hace nada).
 *
 * Uso (desde la raíz del repo, en tu Mac -- NUNCA vía el puente remoto):
 *   node packages/database/scripts/migrate-existing-claim-files-to-declarado.js
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

const SYSTEM = 'fix-script';

// Estados reales de la máquina nueva de `TClaimFile` (ver
// seed-claims-approval-workflow.js) -- cualquier TClaimFile que NO esté
// en uno de estos se considera huérfano del placeholder viejo.
const CLAIM_FILE_STATE_CODES = new Set([
  'DECLARADO',
  'EN_REVISION_REQUISITOS',
  'EN_EVALUACION',
  'APROBADO',
  'RECHAZADO',
  'PAGADO',
  'CERRADO',
  'REABIERTO',
]);

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('No se encontró DATABASE_URL (ver services/iam-service/.env).');
  }
  const prisma = new PrismaClient();
  try {
    const declarado = await prisma.sState.findFirst({ where: { CodState: 'DECLARADO' } });
    if (!declarado) {
      throw new Error(
        'No existe SState con CodState="DECLARADO". Correr primero seed-claims-approval-workflow.js.',
      );
    }

    const allFiles = await prisma.tClaimFile.findMany({ include: { SState: true } });
    const orphaned = allFiles.filter((f) => !CLAIM_FILE_STATE_CODES.has(f.SState.CodState));

    if (orphaned.length === 0) {
      console.log('No hay carpetas de siniestro huérfanas del placeholder viejo -- nada que hacer.');
      return;
    }

    console.log(`Moviendo ${orphaned.length} carpeta(s) de siniestro a "Declarado":`);
    for (const file of orphaned) {
      console.log(`  - ${file.NumClaimFile} (estaba en "${file.SState.CodState}")`);
      await prisma.tClaimFile.update({
        where: { IdeClaimFile: file.IdeClaimFile },
        data: { IdeState: declarado.IdeState, UsrModification: SYSTEM, TstModification: new Date() },
      });
    }
    console.log('\nListo.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
