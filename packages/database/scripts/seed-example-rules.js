#!/usr/bin/env node
/**
 * Crea la cadena MÍNIMA de configuración necesaria para que exista una
 * `SCalculationRule` válida en `ars_platform` y probar el motor de
 * reglas (`product-rating-service`, `/rules-engine/*`) contra Postgres
 * real — no contra los mocks en memoria de `verify:rules-engine`.
 *
 * Por qué hace falta un script tan largo: `SCalculationRule` exige
 * `IdeCoveragePlan` (obligatorio, sin comodín NULL) y `IdeConcept`, y
 * cada uno de esos tiene a su vez sus propias foreign keys obligatorias.
 * La migración de `ars_platform` trajo la ESTRUCTURA de las 130 tablas
 * pero ninguna fila de catálogo/configuración de negocio, así que hay
 * que crear toda la cadena antes de poder insertar una sola regla:
 *
 *   SRiskLevel -> SRisk ┐
 *   SRiskType ----------┼-> SRiskProduct ┐
 *   SProduct -----------┘                ├-> SPlanProductRisk -> SCoveragePlan -> SCalculationRule
 *   SPlanProduct (de SProduct) ----------┘         SCoverage (de SInsuranceLine, de SInsuranceArea) ┘
 *   SDeductibleType, SLimitType (de SCoveragePlan)
 *   SConceptType -> SConcept (de SCalculationRule)
 *
 * Todo con códigos prefijados `SEED_` para que sea obvio qué es dato de
 * prueba (y fácil de identificar/borrar más adelante) — nada de esto
 * pretende ser catálogo real de producto. El CRUD real de todo esto
 * (Fase 2) es lo que reemplazará a este script.
 *
 * Es idempotente: se puede correr varias veces, no duplica filas
 * (usa el código único de cada tabla, o una búsqueda por sus FKs en las
 * dos tablas que no tienen código propio: SPlanProductRisk/SCoveragePlan).
 *
 * Crea 3 SCalculationRule encadenadas con `rule(...)`, replicando el
 * ejemplo de docs/01-especificacion-motor-negocio-actual.md §3.2
 * (PrimaNeta -> Impuesto -> PrimaTotal), ya validado en memoria por
 * `verify:rules-engine`:
 *   SEED_RULE_PRIMANETA  (Order 1): IF TRUE THEN 100                                    -> concepto nuevo
 *   SEED_RULE_IMPUESTO   (Order 2): IF TRUE THEN rule('SEED_RULE_PRIMANETA') * 0.16      -> concepto nuevo
 *   SEED_RULE_PRIMATOTAL (Order 3): IF TRUE THEN rule('SEED_RULE_PRIMANETA') + rule('SEED_RULE_IMPUESTO') -> sobreescribe Prime
 * Resultado esperado: 100, 16, 116.
 *
 * No incluye un custom field (EDAD) de ejemplo: eso además necesitaría
 * una fila real en TQuoteRisk (que a su vez depende de todo el dominio
 * de cotización — TQuote, canal, producto vigente, etc.), terreno de
 * underwriting-service, todavía sin scaffoldear. Por eso este script
 * tampoco ejercita el camino de PrismaRuleValueResolver contra la BD
 * real (todas las referencias rule() de este ejemplo se resuelven en
 * memoria, dentro de la misma cadena, ver el comentario en
 * RulesEngineService.evaluateChain) — eso llega naturalmente cuando
 * exista una cotización real que consulte una regla ya persistida.
 *
 * Uso: node packages/database/scripts/seed-example-rules.js
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
const FAR_FUTURE = new Date('2099-12-31T00:00:00.000Z');

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

    // Helper: busca por código único, crea si no existe. Loguea qué pasó.
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

    // --- Catálogos base ---
    const riskLevel = await findOrCreateByCode(
      'sRiskLevel', 'CodRiskLevel', 'SEED_RISKLEVEL',
      { DesRiskLevel: '[SEED] Nivel de riesgo de ejemplo' },
      'SRiskLevel',
    );
    const risk = await findOrCreateByCode(
      'sRisk', 'CodRisk', 'SEED_RISK',
      { DesRisk: '[SEED] Riesgo de ejemplo', IdeRiskLevel: riskLevel.IdeRiskLevel },
      'SRisk',
    );
    const riskType = await findOrCreateByCode(
      'sRiskType', 'CodRiskType', 'SEED_RISKTYPE',
      { DesRiskType: '[SEED] Tipo de riesgo de ejemplo' },
      'SRiskType',
    );
    const currency = await findOrCreateByCode(
      'sCurrency', 'CodCurrency', 'SEED_CURRENCY',
      { DesCurrency: '[SEED] Moneda de ejemplo', SymbolCurrency: '$' },
      'SCurrency',
    );
    const insuranceArea = await findOrCreateByCode(
      'sInsuranceArea', 'CodInsuranceArea', 'SEED_INSAREA',
      { DesInsuranceArea: '[SEED] Ramo de ejemplo' },
      'SInsuranceArea',
    );
    const insuranceLine = await findOrCreateByCode(
      'sInsuranceLine', 'CodInsuranceLine', 'SEED_INSLINE',
      { DesInsuranceLine: '[SEED] Línea de ejemplo', IdeInsuranceArea: insuranceArea.IdeInsuranceArea },
      'SInsuranceLine',
    );
    const deductibleType = await findOrCreateByCode(
      'sDeductibleType', 'CodDeductibleType', 'SEED_DEDUCTIBLE',
      { DesDeductibleType: '[SEED] Deducible de ejemplo' },
      'SDeductibleType',
    );
    const limitType = await findOrCreateByCode(
      'sLimitType', 'CodLimitType', 'SEED_LIMIT',
      { DesLimitType: '[SEED] Límite de ejemplo' },
      'SLimitType',
    );

    // --- Producto / plan / riesgo ---
    const product = await findOrCreateByCode(
      'sProduct', 'CodProduct', 'SEED_PRODUCT',
      {
        DesProduct: '[SEED] Producto de ejemplo',
        IdeInsuranceArea: insuranceArea.IdeInsuranceArea,
        IdeCurrency: currency.IdeCurrency,
        CodStartTime: 'INMEDIATO',
        IndGenerateAllFraction: false,
        IndProportionalPrime: true,
        TstInitial: now,
        // Confirmado necesario para FMovementConcept('SetNetPrime',...):
        // el original hace "now() between pro.TstInitial and pro.TstEnd"
        // -- con TstEnd NULL ese BETWEEN da NULL/false y la función entera
        // no hace nada (ver setNetPrime en underwriting-service). Mismo
        // criterio FAR_FUTURE ya usado abajo para SPlanProductRisk.
        TstEnd: FAR_FUTURE,
      },
      'SProduct',
    );
    const riskProduct = await findOrCreateByCode(
      'sRiskProduct', 'CodRiskProduct', 'SEED_RISKPRODUCT',
      {
        DesShort: '[SEED] Riesgo-producto de ejemplo',
        IdeProduct: product.IdeProduct,
        IdeRisk: risk.IdeRisk,
        IdeRiskType: riskType.IdeRiskType,
        TstInitial: now,
      },
      'SRiskProduct',
    );
    const planProduct = await findOrCreateByCode(
      'sPlanProduct', 'CodPlanProduct', 'SEED_PLANPRODUCT',
      { DesPlanProduct: '[SEED] Plan de ejemplo', IdeProduct: product.IdeProduct, TstInitial: now },
      'SPlanProduct',
    );

    // SPlanProductRisk no tiene código único propio: se busca por sus FKs.
    let planProductRisk = await prisma.sPlanProductRisk.findFirst({
      where: { IdePlanProduct: planProduct.IdePlanProduct, IdeRiskProduct: riskProduct.IdeRiskProduct },
    });
    if (!planProductRisk) {
      planProductRisk = await prisma.sPlanProductRisk.create({
        data: {
          IdePlanProduct: planProduct.IdePlanProduct,
          IdeRiskProduct: riskProduct.IdeRiskProduct,
          TstInitial: now,
          TstEnd: FAR_FUTURE,
          IdeState: ideState,
          ...audit,
        },
      });
      console.log('+ SPlanProductRisk creado');
    } else {
      console.log('= SPlanProductRisk ya existía');
    }

    const coverage = await findOrCreateByCode(
      'sCoverage', 'CodCoverage', 'SEED_COVERAGE',
      { DesCoverage: '[SEED] Cobertura de ejemplo', IdeInsuranceLine: insuranceLine.IdeInsuranceLine },
      'SCoverage',
    );

    // SCoveragePlan tampoco tiene código único propio.
    let coveragePlan = await prisma.sCoveragePlan.findFirst({
      where: { IdePlanProductRisk: planProductRisk.IdePlanProductRisk, IdeCoverage: coverage.IdeCoverage },
    });
    if (!coveragePlan) {
      coveragePlan = await prisma.sCoveragePlan.create({
        data: {
          IdePlanProductRisk: planProductRisk.IdePlanProductRisk,
          IdeCoverage: coverage.IdeCoverage,
          IndMandatory: true,
          GetPrime: true,
          RefundPrime: false,
          ProratedGetPrime: false,
          ProratedRefundPrime: false,
          NumMonthsWaitingPeriod: 0,
          IndSplitPayment: false,
          IdeDeductibleType: deductibleType.IdeDeductibleType,
          IdeLimitType: limitType.IdeLimitType,
          IndPayPerUse: false,
          IndFixedAmount: true,
          LowerAmount: 0,
          UpperAmount: 0,
          IndFixedRate: true,
          LowerRate: 0,
          UpperRate: 0,
          IndFixedPrime: false,
          LowerPrime: 0,
          UpperPrime: 0,
          TstInitial: now,
          Order: 1,
          IdeState: ideState,
          ...audit,
        },
      });
      console.log('+ SCoveragePlan creado');
    } else {
      console.log('= SCoveragePlan ya existía');
    }

    // --- Conceptos y reglas de cálculo ---
    const conceptType = await findOrCreateByCode(
      'sConceptType', 'CodConceptType', 'SEED_CONCEPTTYPE',
      { DesConceptType: '[SEED] Tipo de concepto de ejemplo' },
      'SConceptType',
    );
    const conceptoNeta = await findOrCreateByCode(
      'sConcept', 'CodConcept', 'SEED_CONCEPTO_PRIMANETA',
      { DesConcept: '[SEED] Prima neta', IdeConceptType: conceptType.IdeConceptType },
      'SConcept (PrimaNeta)',
    );
    const conceptoImpuesto = await findOrCreateByCode(
      'sConcept', 'CodConcept', 'SEED_CONCEPTO_IMPUESTO',
      { DesConcept: '[SEED] Impuesto', IdeConceptType: conceptType.IdeConceptType },
      'SConcept (Impuesto)',
    );
    const conceptoTotal = await findOrCreateByCode(
      'sConcept', 'CodConcept', 'SEED_CONCEPTO_PRIMATOTAL',
      { DesConcept: '[SEED] Prima total', IdeConceptType: conceptType.IdeConceptType },
      'SConcept (PrimaTotal)',
    );

    async function findOrCreateRule(code, order, ideConcept, formula, desColumnName, label) {
      const existing = await prisma.sCalculationRule.findUnique({ where: { CodCalculationRule: code } });
      if (existing) {
        console.log(`= ${label} ya existía (${code})`);
        return existing;
      }
      const created = await prisma.sCalculationRule.create({
        data: {
          CodCalculationRule: code,
          DesCalculationRule: label,
          IdeCoveragePlan: coveragePlan.IdeCoveragePlan,
          IdeConcept: ideConcept,
          Order: order,
          DesColumnName: desColumnName,
          FormulaJSON: formula,
          IdeState: ideState,
          ...audit,
        },
      });
      console.log(`+ ${label} creado (${code})`);
      return created;
    }

    await findOrCreateRule(
      'SEED_RULE_PRIMANETA', 1, conceptoNeta.IdeConcept,
      { IF: 'TRUE', THEN: '100', ELSE: '0' }, null,
      '[SEED] Regla PrimaNeta',
    );
    await findOrCreateRule(
      'SEED_RULE_IMPUESTO', 2, conceptoImpuesto.IdeConcept,
      { IF: 'TRUE', THEN: "rule('SEED_RULE_PRIMANETA') * 0.16", ELSE: '0' }, null,
      '[SEED] Regla Impuesto',
    );
    await findOrCreateRule(
      'SEED_RULE_PRIMATOTAL', 3, conceptoTotal.IdeConcept,
      { IF: 'TRUE', THEN: "rule('SEED_RULE_PRIMANETA') + rule('SEED_RULE_IMPUESTO')", ELSE: '0' }, 'Prime',
      '[SEED] Regla PrimaTotal',
    );

    console.log('\nListo. Para probar contra product-rating-service (puerto 3002):\n');
    console.log(`  GET  /rules-engine/applicable-rules?ideCoveragePlan=${coveragePlan.IdeCoveragePlan}`);
    console.log('  POST /rules-engine/evaluate');
    console.log(
      JSON.stringify(
        {
          ideCoveragePlan: coveragePlan.IdeCoveragePlan,
          origin: 'Quote',
          ideOriginRisk: '00000000-0000-0000-0000-000000000000',
          ideCoverageOrMovement: '00000000-0000-0000-0000-000000000000',
        },
        null,
        2,
      ),
    );
    console.log('\nResultado esperado: PrimaNeta=100, Impuesto=16, PrimaTotal=116 (columnName: "Prime").');
    console.log(
      '(ideOriginRisk/ideCoverageOrMovement pueden ser cualquier UUID: esta cadena no usa custom ' +
        'fields ni referencias rule() fuera de sí misma, así que no se consultan.)',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
