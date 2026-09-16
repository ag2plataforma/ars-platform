#!/usr/bin/env node
/**
 * Crea una tabla de tarifa de ejemplo (`SRateTable`/`SRateFactor`/
 * `SRateValue`, 2 factores: EDAD y ZONA) en `ars_platform` y corre unos
 * cuantos lookups reales contra Postgres, replicando EXACTAMENTE la
 * misma lógica que `PrismaRateValueResolver`
 * (`packages/database/src/repositories/rate-value.resolver.ts`) —
 * equivalente a `FGetRateValue` — para confirmar con datos reales lo que
 * `verify:rules-engine` ya probó en memoria.
 *
 * Casos que ejercita (ver `services/product-rating-service/README.md`
 * para la semántica completa, confirmada contra el código fuente
 * original de `FGetRateValue`):
 *
 *   1. factor1='30', factor2='NORTE'  -> calce exacto de ambos factores,
 *      debe devolver exactamente 1 fila (7.50).
 *   2. factor1='30', factor2 omitido  -> como el llamador NO manda
 *      factor2, esa dimensión no se filtra en absoluto; hay DOS filas
 *      con Factor1='30' (NORTE y SUR), así que debe fallar con "más de
 *      un valor" — NO elegir una "más específica" (no existe tal cosa).
 *   3. factor1='99' (sin datos)       -> debe fallar con "no se encontró".
 *   4. factor1='40', factor2='NORTE'  -> otro calce exacto (8.25), para
 *      confirmar que no hay contaminación cruzada entre filas.
 *
 * Todo con códigos prefijados `SEED_`, idempotente (se puede correr
 * varias veces sin duplicar filas), mismo estilo que
 * `seed-example-rules.js`.
 *
 * Uso: node packages/database/scripts/seed-example-rate-table.js
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

// Mismo DATABASE_URL que usan iam-service/product-rating-service.
loadEnvFile(path.resolve(__dirname, '../../../services/iam-service/.env'));

const SYSTEM = 'seed-script';
const FAR_PAST = new Date('2020-01-01T00:00:00.000Z');
const FAR_FUTURE = new Date('2099-12-31T00:00:00.000Z');

let checks = 0;
let failures = 0;

function check(label, ok, detail) {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Réplica exacta de `PrismaRateValueResolver.resolveRateValue` (equivalente
 * a `FGetRateValue`) — deliberadamente NO se importa desde `dist/` de
 * `@ars-platform/database` para que este script siga siendo un `.js` plano
 * ejecutable con `node` directo, sin depender de un build previo. Si cambia
 * la lógica allá, hay que actualizar esta copia (documentado acá para que
 * no se pierda de vista).
 */
async function getRateValue(prisma, codRateTable, factor1, factor2, factor3, factor4, factor5) {
  const rateTable = await prisma.sRateTable.findFirst({ where: { CodRateTable: codRateTable } });
  if (!rateTable) {
    throw new Error(`No existe tabla de tarifa con código "${codRateTable}"`);
  }
  const where = { IdeRateTable: rateTable.IdeRateTable, Factor1: factor1 };
  if (factor2 !== undefined) where.Factor2 = factor2;
  if (factor3 !== undefined) where.Factor3 = factor3;
  if (factor4 !== undefined) where.Factor4 = factor4;
  if (factor5 !== undefined) where.Factor5 = factor5;

  const rows = await prisma.sRateValue.findMany({ where });
  if (rows.length === 0) {
    throw new Error('No se encontró valor de tarifa para los factores consultados.');
  }
  if (rows.length > 1) {
    throw new Error(`Se encontró más de un valor de tarifa (${rows.length} filas) para los factores consultados.`);
  }
  return Number(rows[0].Value);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'No se encontró DATABASE_URL. Verifica services/iam-service/.env (debe apuntar a ?schema=ars_platform).',
    );
  }

  const prisma = new PrismaClient();
  try {
    const activeState = await prisma.sState.findFirst({ where: { CodState: 'ACTIVO' } });
    if (!activeState) {
      throw new Error('No existe SState con CodState="ACTIVO" en ars_platform.');
    }
    const ideState = activeState.IdeState;
    const now = new Date();
    const audit = { UsrCreation: SYSTEM, TstCreation: now, UsrModification: SYSTEM, TstModification: now };

    async function findOrCreateByCode(model, codeField, code, extraData, label) {
      const existing = await prisma[model].findUnique({ where: { [codeField]: code } });
      if (existing) {
        console.log(`= ${label} ya existía (${code})`);
        return existing;
      }
      const created = await prisma[model].create({
        data: { [codeField]: code, ...extraData, IdeState: ideState, ...audit },
      });
      console.log(`+ ${label} creado (${code})`);
      return created;
    }

    console.log('\n-- Seed: tabla de tarifa de ejemplo --');

    const fieldEdad = await findOrCreateByCode(
      'sFieldDictionary', 'CodFieldDictionary', 'SEED_FIELD_EDAD',
      { DesFieldDictionary: '[SEED] Edad' },
      'SFieldDictionary (EDAD)',
    );
    const fieldZona = await findOrCreateByCode(
      'sFieldDictionary', 'CodFieldDictionary', 'SEED_FIELD_ZONA',
      { DesFieldDictionary: '[SEED] Zona' },
      'SFieldDictionary (ZONA)',
    );
    const rateTable = await findOrCreateByCode(
      'sRateTable', 'CodRateTable', 'SEED_TARIFA_EDAD_ZONA',
      { DesRateTable: '[SEED] Tarifa por edad y zona' },
      'SRateTable',
    );

    // SRateFactor no tiene código propio: se busca por (IdeRateTable, NumOrder).
    async function findOrCreateFactor(numOrder, ideFieldDictionary, label) {
      const existing = await prisma.sRateFactor.findFirst({
        where: { IdeRateTable: rateTable.IdeRateTable, NumOrder: numOrder },
      });
      if (existing) {
        console.log(`= SRateFactor #${numOrder} (${label}) ya existía`);
        return existing;
      }
      const created = await prisma.sRateFactor.create({
        data: {
          IdeRateTable: rateTable.IdeRateTable,
          IdeFieldDictionary: ideFieldDictionary,
          NumOrder: numOrder,
          IdeState: ideState,
          ...audit,
        },
      });
      console.log(`+ SRateFactor #${numOrder} (${label}) creado`);
      return created;
    }
    await findOrCreateFactor(1, fieldEdad.IdeFieldDictionary, 'EDAD');
    await findOrCreateFactor(2, fieldZona.IdeFieldDictionary, 'ZONA');

    // SRateValue tampoco tiene código propio: se busca por sus factores.
    async function findOrCreateValue(factor1, factor2, value) {
      const existing = await prisma.sRateValue.findFirst({
        where: { IdeRateTable: rateTable.IdeRateTable, Factor1: factor1, Factor2: factor2 },
      });
      if (existing) {
        console.log(`= SRateValue (${factor1}, ${factor2}) ya existía = ${existing.Value}`);
        return existing;
      }
      const created = await prisma.sRateValue.create({
        data: {
          IdeRateTable: rateTable.IdeRateTable,
          TstInit: FAR_PAST,
          TstEnd: FAR_FUTURE,
          Factor1: factor1,
          Factor2: factor2,
          Value: value,
          IdeState: ideState,
          ...audit,
        },
      });
      console.log(`+ SRateValue (${factor1}, ${factor2}) = ${value} creado`);
      return created;
    }
    await findOrCreateValue('30', 'NORTE', '7.50');
    await findOrCreateValue('30', 'SUR', '9.00');
    await findOrCreateValue('40', 'NORTE', '8.25');

    console.log('\n-- Lookups reales contra Postgres (misma lógica que PrismaRateValueResolver) --');

    // 1. Calce exacto de ambos factores.
    try {
      const value = await getRateValue(prisma, 'SEED_TARIFA_EDAD_ZONA', '30', 'NORTE');
      check("factor1='30', factor2='NORTE' => 7.5", value === 7.5, `obtuvo ${value}`);
    } catch (err) {
      check("factor1='30', factor2='NORTE' => 7.5", false, `lanzó error inesperado: ${err.message}`);
    }

    // 2. factor2 omitido -> no se filtra por ZONA -> dos filas con Factor1='30' -> debe fallar.
    try {
      const value = await getRateValue(prisma, 'SEED_TARIFA_EDAD_ZONA', '30');
      check(
        "factor1='30', factor2 omitido => debe fallar (2 filas calzan, sin desempate)",
        false,
        `NO debería haber devuelto un valor, devolvió ${value}`,
      );
    } catch (err) {
      check(
        "factor1='30', factor2 omitido => debe fallar (2 filas calzan, sin desempate)",
        /más de un valor/.test(err.message),
        err.message,
      );
    }

    // 3. Sin datos para ese factor1.
    try {
      const value = await getRateValue(prisma, 'SEED_TARIFA_EDAD_ZONA', '99', 'NORTE');
      check("factor1='99' (sin datos) => debe fallar", false, `NO debería haber devuelto un valor, devolvió ${value}`);
    } catch (err) {
      check("factor1='99' (sin datos) => debe fallar", /no se encontró/i.test(err.message), err.message);
    }

    // 4. Otro calce exacto, para confirmar que no hay contaminación cruzada.
    try {
      const value = await getRateValue(prisma, 'SEED_TARIFA_EDAD_ZONA', '40', 'NORTE');
      check("factor1='40', factor2='NORTE' => 8.25", value === 8.25, `obtuvo ${value}`);
    } catch (err) {
      check("factor1='40', factor2='NORTE' => 8.25", false, `lanzó error inesperado: ${err.message}`);
    }

    console.log(failures === 0 ? `\nTodo OK (${checks}/${checks}).` : `\n${failures}/${checks} verificación(es) fallaron.`);

    console.log('\nPara probar por HTTP contra product-rating-service (puerto 3002, con el servidor corriendo):\n');
    console.log("  GET /rate-values/lookup?codRateTable=SEED_TARIFA_EDAD_ZONA&factor1=30&factor2=NORTE");
    console.log('  -> debería devolver 7.5\n');
    console.log('Y dentro de una fórmula de SCalculationRule (FormulaJSON), la misma tabla se consulta así:\n');
    console.log("  FGetRateValue('SEED_TARIFA_EDAD_ZONA','30','NORTE',NULL,NULL,NULL)");

    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
