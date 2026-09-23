#!/usr/bin/env node
/**
 * Migracion de datos (Fase 3, motor generico de recargos/descuentos --
 * ver docs/02-roadmap.md): envuelve la formula THEN de TODA regla de
 * calculo cuyo concepto sea "PrimaTotal" para que multiplique el
 * resultado final por `(1 + adjustment('SOCIAL_IMPACT') / 100)`.
 *
 * Por que "envolver" en vez de reescribir cada formula a mano: hay 238
 * reglas no-SEED configuradas (confirmado con un dump manual), repartidas
 * en ~50 SCoveragePlan distintos, con al menos 3 formas distintas de
 * calcular PrimaTotal (PrimaNeta+2%+5%, PrimaNeta+Impuesto1+Impuesto2,
 * PrimaNeta+0 para los ramos de vehiculo, y un caso con 3 sumandos para
 * WEXT_BAS_TEL_EXTGAR). No hace falta entender ni tocar el CONTENIDO de
 * cada formula -- alcanza con multiplicar el resultado final por el
 * factor de ajuste, sea cual sea ese resultado.
 *
 * Por que es seguro aplicarlo a las 238 reglas (no solo al producto de
 * mascotas probado): `adjustment('SOCIAL_IMPACT')` devuelve 0 en
 * silencio si la cotizacion no tiene un `TQuoteSocialImpactAnswer` (ver
 * AdjustmentValueResolver/PrismaAdjustmentValueResolver) -- y esa fila
 * SOLO se crea si `submitSocialImpactAnswers` corrio, que a su vez exige
 * que el producto participe (`SSocialImpactConfig`). Para cualquier
 * producto que NO participa, esto es un no-op matematico
 * (round(x * (1+0/100), 2) = round(x, 2) = x, porque x ya viene
 * redondeado a 2 decimales en casi todos los casos). Aplicarlo
 * universalmente ademas deja el sistema listo para el dia en que otro
 * producto se sume a Impacto Social (o a un futuro recargo/descuento con
 * su propio `codAdjustment`) sin volver a correr esta migracion.
 *
 * Idempotente: si el THEN ya contiene "adjustment(", se saltea esa
 * regla (para poder correr el script mas de una vez sin doble-envolver).
 *
 * Uso: node packages/database/scripts/apply-social-impact-adjustment-to-prima-total.js
 *      node packages/database/scripts/apply-social-impact-adjustment-to-prima-total.js --dry-run   (solo muestra, no escribe)
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

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const prisma = new PrismaClient();
  try {
    const rules = await prisma.sCalculationRule.findMany({
      where: {
        CodCalculationRule: { not: { startsWith: 'SEED_' } },
        SConcept: { CodConcept: 'PrimaTotal' },
      },
      include: { SConcept: { select: { CodConcept: true } } },
    });

    console.log(`Reglas PrimaTotal encontradas: ${rules.length}`);
    console.log(DRY_RUN ? '(--dry-run: no se escribe nada)\n' : '');

    let updated = 0;
    let skipped = 0;
    for (const rule of rules) {
      const formula = rule.FormulaJSON;
      const oldThen = formula.THEN;

      if (typeof oldThen === 'string' && oldThen.includes('adjustment(')) {
        console.log(`= ${rule.CodCalculationRule}: ya tiene adjustment(...), sin cambios`);
        skipped++;
        continue;
      }

      const newThen = `round((${oldThen}) * (1 + adjustment('SOCIAL_IMPACT') / 100), 2)`;
      console.log(`~ ${rule.CodCalculationRule} (ideCoveragePlan=${rule.IdeCoveragePlan})`);
      console.log(`    antes: ${oldThen}`);
      console.log(`    despues: ${newThen}`);

      if (!DRY_RUN) {
        await prisma.sCalculationRule.update({
          where: { IdeCalculationRule: rule.IdeCalculationRule },
          data: {
            FormulaJSON: { ...formula, THEN: newThen },
            UsrModification: 'migration-social-impact-adjustment',
            TstModification: new Date(),
          },
        });
      }
      updated++;
    }

    console.log(`\n${DRY_RUN ? 'Se actualizarian' : 'Actualizadas'}: ${updated}. Ya al dia: ${skipped}.`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
