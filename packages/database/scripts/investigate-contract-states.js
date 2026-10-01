#!/usr/bin/env node
/**
 * Solo lectura: inspecciona el estado real de TODAS las entidades del
 * árbol del contrato más reciente, para confirmar (contra datos reales,
 * no solo leyendo el código) si "movimientos" y "canal de distribución"
 * realmente quedaron en Activo justo después de "Contratar" (antes de
 * "Activar contrato"), como reportó el usuario -- lo cual contradice lo
 * que dice el código de ContractsService.create()/setContractDistributionChannel/
 * createInitialMovements (que los crea en su estado inicial/Borrador).
 *
 * Uso: node packages/database/scripts/investigate-contract-states.js [NumContract]
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
const numContractArg = process.argv[2];

async function main() {
  const contract = numContractArg
    ? await prisma.tContract.findFirst({ where: { NumContract: numContractArg } })
    : await prisma.tContract.findFirst({ orderBy: { TstCreation: 'desc' } });

  if (!contract) {
    console.log('No se encontró ningún contrato.');
    return;
  }

  const stateIds = new Set();
  stateIds.add(contract.IdeState);

  const files = await prisma.tContractFile.findMany({ where: { IdeContract: contract.IdeContract } });
  const persons = await prisma.tContractPerson.findMany({ where: { IdeContract: contract.IdeContract } });
  const channels = await prisma.tContractDistributionChannel.findMany({ where: { IdeContract: contract.IdeContract } });
  const billings = await prisma.tContractBilling.findMany({ where: { IdeContract: contract.IdeContract } });

  let fileRisks = [];
  let riskCoverages = [];
  let movements = [];
  let movementConcepts = [];
  for (const file of files) {
    const frs = await prisma.tFileRisk.findMany({ where: { IdeContractFile: file.IdeContractFile } });
    fileRisks.push(...frs);
    for (const fr of frs) {
      const rcs = await prisma.tRiskCoverage.findMany({ where: { IdeFileRisk: fr.IdeFileRisk } });
      riskCoverages.push(...rcs);
      for (const rc of rcs) {
        const movs = await prisma.tCoverageMovement.findMany({ where: { IdeRiskCoverage: rc.IdeRiskCoverage } });
        movements.push(...movs);
        for (const mov of movs) {
          const concepts = await prisma.tMovementConcept.findMany({ where: { IdeCoverageMovement: mov.IdeCoverageMovement } });
          movementConcepts.push(...concepts);
        }
      }
    }
  }

  const allStateIds = new Set([
    contract.IdeState,
    ...files.map((f) => f.IdeState),
    ...persons.map((p) => p.IdeState),
    ...channels.map((c) => c.IdeState),
    ...billings.map((b) => b.IdeState),
    ...fileRisks.map((f) => f.IdeState),
    ...riskCoverages.map((r) => r.IdeState),
    ...movements.map((m) => m.IdeState),
    ...movementConcepts.map((m) => m.IdeState),
  ]);
  const states = await prisma.sState.findMany({ where: { IdeState: { in: [...allStateIds] } } });
  const codeOf = (id) => states.find((s) => s.IdeState === id)?.CodState ?? id;

  console.log(`Contrato: ${contract.NumContract} (${contract.IdeContract})`);
  console.log(`  TContract: ${codeOf(contract.IdeState)}`);
  console.log(`  TContractFile (${files.length}): ${files.map((f) => codeOf(f.IdeState)).join(', ')}`);
  console.log(`  TContractPerson (${persons.length}): ${persons.map((p) => codeOf(p.IdeState)).join(', ')}`);
  console.log(`  TContractDistributionChannel (${channels.length}): ${channels.map((c) => codeOf(c.IdeState)).join(', ')}`);
  console.log(`  TContractBilling (${billings.length}): ${billings.map((b) => codeOf(b.IdeState)).join(', ')}`);
  console.log(`  TFileRisk (${fileRisks.length}): ${fileRisks.map((f) => codeOf(f.IdeState)).join(', ')}`);
  console.log(`  TRiskCoverage (${riskCoverages.length}): ${riskCoverages.map((r) => codeOf(r.IdeState)).join(', ')}`);
  console.log(`  TCoverageMovement (${movements.length}): ${movements.map((m) => codeOf(m.IdeState)).join(', ')}`);
  console.log(`  TMovementConcept (${movementConcepts.length}): ${movementConcepts.map((m) => codeOf(m.IdeState)).join(', ')}`);
}

main()
  .catch((e) => {
    console.error('ERR', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
