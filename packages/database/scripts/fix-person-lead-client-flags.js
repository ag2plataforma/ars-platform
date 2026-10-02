#!/usr/bin/env node
/**
 * Fix idempotente: `IndLead`/`IndClient` de `TPerson` deben ser
 * mutuamente excluyentes -- pedido explícito del usuario (2026-10-02,
 * al notar un cliente real con ambas banderas en `true`). Hasta ahora
 * `ContractsService.setContractPersons` (underwriting-service) marcaba
 * `IndClient=true` al generar el primer contrato de una persona, pero
 * nunca apagaba `IndLead` -- bug ya corregido en el código (ese mismo
 * `update` ahora también pone `IndLead=false`), pero ese fix no es
 * retroactivo: este script corrige las filas que ya quedaron con ambas
 * banderas en `true` antes del cambio.
 *
 * Alcance deliberadamente acotado: solo apaga `IndLead` donde
 * `IndClient=true` Y `IndLead=true` hoy. No toca personas que son
 * únicamente lead (`IndClient=false`) ni personas que ya son
 * únicamente cliente (`IndLead` ya en `false`) -- nada que corregir ahí.
 *
 * Uso:
 *   node packages/database/scripts/fix-person-lead-client-flags.js --dry-run
 *   node packages/database/scripts/fix-person-lead-client-flags.js
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
loadEnvFile(path.join(__dirname, '..', '..', '..', 'services', 'underwriting-service', '.env'));

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const ACTOR = 'fix-person-lead-client-flags-script';

async function main() {
  const affected = await prisma.tPerson.findMany({
    where: { IndLead: true, IndClient: true },
    select: { IdePerson: true, DesFirstName: true, DesLastName1: true, NumIdentification: true },
  });

  if (affected.length === 0) {
    console.log('No hay personas con IndLead=true e IndClient=true a la vez -- nada que corregir.');
    return;
  }

  console.log(`Personas afectadas (IndLead=true e IndClient=true): ${affected.length}`);
  for (const person of affected) {
    console.log(`  ${person.DesFirstName} ${person.DesLastName1 ?? ''} (${person.NumIdentification ?? 's/doc'}) -- ${person.IdePerson}`);
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: no se modificó nada.');
    return;
  }

  const now = new Date();
  const result = await prisma.tPerson.updateMany({
    where: { IndLead: true, IndClient: true },
    data: { IndLead: false, UsrModification: ACTOR, TstModification: now },
  });

  console.log(`\nCorregidas: ${result.count} persona(s) -- IndLead puesto en false (ya eran clientes).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
