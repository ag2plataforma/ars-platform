// Correr en la raíz del proyecto: node packages/database/scripts/verify_net_prime.js <IdeContract>
// Muestra TCoverageMovement + sus TMovementConcept (ConceptValue vs
// ConceptNetValue) para confirmar que setNetPrime calculó el neto de verdad.
const fs = require('fs');
const envContent = fs.readFileSync('services/underwriting-service/.env', 'utf-8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ideContract = process.argv[2];
if (!ideContract) {
  console.error('Uso: node packages/database/scripts/verify_net_prime.js <IdeContract>');
  process.exit(1);
}

async function main() {
  const movements = await prisma.tCoverageMovement.findMany({
    where: { TRiskCoverage: { TFileRisk: { TContractFile: { IdeContract: ideContract } } } },
    select: {
      IdeCoverageMovement: true,
      NumCoverageMovement: true,
      Prime: true,
      IdeRiskCoverage: true,
      TRiskCoverage: { select: { Prime: true } },
      TMovementConcept: {
        select: {
          ConceptValue: true,
          ConceptNetValue: true,
          SConcept: { select: { CodConcept: true } },
        },
      },
    },
  });

  for (const m of movements) {
    console.log(`\nTCoverageMovement ${m.IdeCoverageMovement} (Num=${m.NumCoverageMovement})`);
    console.log(`  Prime (movimiento): ${m.Prime}`);
    console.log(`  Prime (TRiskCoverage): ${m.TRiskCoverage.Prime}`);
    for (const c of m.TMovementConcept) {
      console.log(`  ${c.SConcept.CodConcept}: ConceptValue=${c.ConceptValue}  ConceptNetValue=${c.ConceptNetValue}`);
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
