#!/usr/bin/env node
/**
 * Completa, con datos de prueba prefijados `SEED_`, todo lo que le falta
 * a la BD real para poder ejercitar de punta a punta el flujo
 * cotización -> contrato (`POST /quotes` -> `.../price` -> selección ->
 * `.../persons` -> `.../state('Aceptar')` -> `.../contract` ->
 * `.../state('Contratar')` sobre el contrato).
 *
 * Por qué hace falta: `npm run db:investigate-testing-data` confirmó que
 * la migración de `ars_platform` no trajo NINGUNA fila de configuración
 * de negocio -- ni siquiera la máquina de estados (`SEntity`/`SStateRule`)
 * tiene una sola fila todavía, más allá del `SState` "ACTIVO" ya presente
 * (de dónde salió ese no se sabe, pero varios scripts ya dependen de él).
 * Sin `SStateRule`, CUALQUIER llamada a `StateMachineService.getInitialState`/
 * `getNextState` explota con 404 -- ni siquiera el módulo de cotización de
 * la fase anterior se había ejercitado contra la BD real todavía.
 *
 * Requiere haber corrido antes `node packages/database/scripts/seed-example-rules.js`
 * (crea `SEED_PRODUCT`/`SEED_PLANPRODUCT`/`SEED_RISKPRODUCT`/`SEED_COVERAGE`
 * con 3 reglas de cálculo ya encadenadas) -- este script lo EXTIENDE, no lo
 * duplica: le agrega lo que le falta para poder emitirse como contrato real
 * (vigencia, fracción de pago, operación CONTGENE) y agrega, aparte, todo lo
 * que ninguno de los dos scripts anteriores tocaba: la máquina de estados
 * completa para las ~20 entidades que la cascada de cotización/contrato usa,
 * canal/vía de distribución, roles de persona, tipo de recibo, un concepto
 * REAL codificado `PrimaTotal` (el que el código de underwriting-service
 * busca hardcodeado) con una regla propia que lo alimenta, y una persona de
 * prueba para asociar como TOMADOR/TITULAR.
 *
 * Diseño de la máquina de estados (deliberadamente simple, no pretende
 * replicar los estados reales del legado -- eso es harina de otro costal,
 * ver docs/02-roadmap.md): dos estados nuevos genéricos "BORRADOR"/(inicial)
 * y "ACTIVO" (ya existe) para las entidades que solo necesitan existir, más
 * "ACEPTADO"/"CONTRATADO" específicos de `TQuote` porque el código real
 * busca esos códigos literalmente (`getStateByCode('Aceptado')` en
 * `ContractsService`). Operativos de prueba: `Aceptar` (borrador -> activo/
 * aceptado en toda la cotización), `Contratar` (ya usado por el código real
 * al final de `CONTRACTNEW` -- acá se define su transición), `Activar` (ya
 * usado por el código real para el SETSTATE final del contrato).
 *
 * Idempotente (mismo patrón findOrCreateByCode que seed-example-rules.js).
 *
 * Uso: node packages/database/scripts/seed-contract-testing-fixtures.js
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

    // --- 1. Estados nuevos ---
    const sBorrador = await findOrCreateByCode('sState', 'CodState', 'SEED_BORRADOR', { DesState: '[SEED] Borrador' }, 'SState (Borrador)');
    const sAceptado = await findOrCreateByCode('sState', 'CodState', 'ACEPTADO', { DesState: 'Aceptado' }, 'SState (Aceptado)');
    const sContratado = await findOrCreateByCode('sState', 'CodState', 'SEED_CONTRATADO', { DesState: '[SEED] Contratado' }, 'SState (Contratado)');

    // --- 2. Máquina de estados: SEntity + SStateRule ---
    // Entidades que solo necesitan un estado inicial fijo, sin transición
    // (el código nunca las hace avanzar en esta primera pasada).
    const NO_TRANSITION_ENTITIES = [
      'TContractPerson',
      'TContractBilling',
      'TContractOperation',
      'TContractRequirement',
      // Agregada 2026-09-24: feature "Requisitos" (checklist de
      // documentos exigidos, ver RequirementsService en
      // underwriting-service) -- misma razón que TContractRequirement,
      // "entregado" se guarda en Data (JSON), no como transición real de
      // estado; sin esta entrada, stateMachine.getInitialState('TQuoteRequirement')
      // lanzaría (no existiría ninguna fila SEntity/SStateRule para ella).
      'TQuoteRequirement',
      'TReceipt',
      'TReceiptDetail',
    ];
    // Entidades "catálogo" que nacen directamente activas. SPlanProductRisk/
    // SCoveragePlan: confirmado contra el comentario real de
    // QuotesService.populateQuoteCoverages ("una SCoveragePlan se crea
    // directamente activa, sin pasar por borrador"). TContractDistributionChannel:
    // confirmado contra el código real de FReceipt (busca
    // TContractDistributionChannel.IdeState = Activo, ver
    // packages/database/scripts/find-legacy-function.js FReceipt) Y contra
    // FContract('SETSTATE', ...) (su cascada de 6 niveles NUNCA toca esta
    // tabla) -- si naciera en Borrador se quedaría ahí para siempre, y
    // FReceipt/generateCancellationReceipts nunca encontraría el canal
    // principal (404 "no tiene un canal de distribución principal vigente").
    const CATALOG_ACTIVE_ENTITIES = ['SPlanProductRisk', 'SCoveragePlan', 'TContractDistributionChannel'];
    // Entidades del árbol de cotización: BORRADOR -> ACTIVO vía 'Aceptar',
    // ACTIVO -> ACTIVO vía 'Contratar' (auto-transición: solo marca que la
    // cotización se convirtió, no cambia de "fase" en sí).
    const QUOTE_TREE_ENTITIES = ['TQuoteRisk', 'TQuoteRiskPlan', 'TQuoteCoverage', 'TQuoteCoverageConcept'];
    // Árbol del contrato: BORRADOR -> ACTIVO vía 'Activar'. Incluye
    // TMovementConcept porque `applyStateCascade` replica la cascada real
    // de `FContract('SETSTATE', ...)`, que llega 6 niveles de profundidad
    // (hasta TMovementConcept), no 5.
    const CONTRACT_TREE_ENTITIES = ['TContract', 'TContractFile', 'TFileRisk', 'TRiskCoverage', 'TCoverageMovement', 'TMovementConcept'];

    async function findOrCreateEntity(codEntity) {
      return findOrCreateByCode('sEntity', 'CodEntity', codEntity, { DesEntity: `[SEED] ${codEntity}`, IdeState: ideActivo }, `SEntity (${codEntity})`);
    }

    async function findOrCreateStateRule(codEntity, ideStateFrom, ideStateTo, desOperativeCode, indInitialState) {
      const entity = await findOrCreateEntity(codEntity);
      const existing = await prisma.sStateRule.findFirst({
        where: { IdeEntity: entity.IdeEntity, IdeStateFrom: ideStateFrom, IdeStateTo: ideStateTo, DesOperativeCode: desOperativeCode },
      });
      if (existing) {
        console.log(`= SStateRule ya existía (${codEntity}, op=${desOperativeCode})`);
        return existing;
      }
      const created = await prisma.sStateRule.create({
        data: {
          IdeEntity: entity.IdeEntity,
          IdeStateFrom: ideStateFrom,
          IdeStateTo: ideStateTo,
          IndInitialState: indInitialState,
          DesOperativeCode: desOperativeCode,
          IdeState: ideActivo,
          ...audit,
        },
      });
      console.log(`+ SStateRule creada (${codEntity}, ${ideStateFrom === ideStateTo ? 'self' : 'from->to'}, op=${desOperativeCode}, inicial=${indInitialState})`);
      return created;
    }

    // Marcador de estado inicial (fila IdeStateFrom=IdeStateTo=<inicial>,
    // DesOperativeCode=null) -- así lo consume PrismaStateRuleRepository.findInitialState.
    async function markInitial(codEntity, ideStateInitial) {
      // Limpieza: si esta entidad ya tenía un marcador de estado inicial
      // (IndInitialState=true) apuntando a un estado DISTINTO -- caso real:
      // TContractDistributionChannel se reclasificó de "sin transición"
      // (Borrador) a "catálogo activo" (Activo) en una corrección
      // posterior -- hay que eliminarlo. Si no, quedarían DOS filas con
      // IndInitialState=true para la misma entidad, y `findInitialState`
      // (sin ORDER BY, ver PrismaStateRuleRepository) devolvería una de
      // las dos de forma no determinística.
      const entity = await findOrCreateEntity(codEntity);
      const stale = await prisma.sStateRule.findMany({
        where: { IdeEntity: entity.IdeEntity, IndInitialState: true, NOT: { IdeStateFrom: ideStateInitial } },
      });
      for (const row of stale) {
        await prisma.sStateRule.delete({ where: { IdeStateRule: row.IdeStateRule } });
        console.log(`- SStateRule inicial obsoleta eliminada (${codEntity}, apuntaba a otro estado)`);
      }
      return findOrCreateStateRule(codEntity, ideStateInitial, ideStateInitial, null, true);
    }

    for (const codEntity of NO_TRANSITION_ENTITIES) {
      await markInitial(codEntity, sBorrador.IdeState);
    }
    for (const codEntity of CATALOG_ACTIVE_ENTITIES) {
      await markInitial(codEntity, ideActivo);
    }
    for (const codEntity of QUOTE_TREE_ENTITIES) {
      await markInitial(codEntity, sBorrador.IdeState);
      await findOrCreateStateRule(codEntity, sBorrador.IdeState, ideActivo, 'Aceptar', false);
      await findOrCreateStateRule(codEntity, ideActivo, ideActivo, 'Contratar', false);
    }
    for (const codEntity of CONTRACT_TREE_ENTITIES) {
      await markInitial(codEntity, sBorrador.IdeState);
      await findOrCreateStateRule(codEntity, sBorrador.IdeState, ideActivo, 'Activar', false);
    }
    // TQuote: estados propios (Aceptado/Contratado son códigos que el
    // código real busca literalmente).
    await markInitial('TQuote', sBorrador.IdeState);
    await findOrCreateStateRule('TQuote', sBorrador.IdeState, sAceptado.IdeState, 'Aceptar', false);
    await findOrCreateStateRule('TQuote', sAceptado.IdeState, sContratado.IdeState, 'Contratar', false);

    // --- 3. Extender SEED_PRODUCT (de seed-example-rules.js) ---
    const product = await prisma.sProduct.findUnique({ where: { CodProduct: 'SEED_PRODUCT' } });
    if (!product) {
      throw new Error(
        'No existe SEED_PRODUCT -- correr primero: node packages/database/scripts/seed-example-rules.js',
      );
    }
    const planProduct = await prisma.sPlanProduct.findUnique({ where: { CodPlanProduct: 'SEED_PLANPRODUCT' } });
    const riskProduct = await prisma.sRiskProduct.findUnique({ where: { CodRiskProduct: 'SEED_RISKPRODUCT' } });
    const planProductRisk = await prisma.sPlanProductRisk.findFirst({
      where: { IdePlanProduct: planProduct.IdePlanProduct, IdeRiskProduct: riskProduct.IdeRiskProduct },
    });
    const coverage = await prisma.sCoverage.findUnique({ where: { CodCoverage: 'SEED_COVERAGE' } });
    const coveragePlan = await prisma.sCoveragePlan.findFirst({
      where: { IdePlanProductRisk: planProductRisk.IdePlanProductRisk, IdeCoverage: coverage.IdeCoverage },
    });

    const validityType = await findOrCreateByCode(
      'sValidityType', 'CodValidityType', 'SEED_ANUAL',
      { DesValidityType: '[SEED] Anual', IndAnnual: true, IdeState: ideActivo },
      'SValidityType',
    );
    let productValidityType = await prisma.sProductValidityType.findFirst({
      where: { IdeProduct: product.IdeProduct, IdeValidityType: validityType.IdeValidityType },
    });
    if (!productValidityType) {
      productValidityType = await prisma.sProductValidityType.create({
        data: { IdeProduct: product.IdeProduct, IdeValidityType: validityType.IdeValidityType, IndInitialDate: true, IdeState: ideActivo, ...audit },
      });
      console.log('+ SProductValidityType creado');
    } else {
      console.log('= SProductValidityType ya existía');
    }

    const paymentFraction = await findOrCreateByCode(
      'sPaymentFraction', 'CodPaymentFraction', 'SEED_MENSUAL',
      { DesPaymentFraction: '[SEED] Mensual', NumFraction: 12, NumOrder: 1, IdeState: ideActivo },
      'SPaymentFraction',
    );
    let productPaymentFraction = await prisma.sProductPaymentFraction.findFirst({
      where: { IdeProduct: product.IdeProduct, IdePaymentFraction: paymentFraction.IdePaymentFraction },
    });
    if (!productPaymentFraction) {
      productPaymentFraction = await prisma.sProductPaymentFraction.create({
        data: {
          IdeProduct: product.IdeProduct,
          IdePaymentFraction: paymentFraction.IdePaymentFraction,
          TstInitial: now,
          TstEnd: new Date('2099-12-31'),
          PorSurCharge: 0,
          IdeState: ideActivo,
          ...audit,
        },
      });
      console.log('+ SProductPaymentFraction creado');
    } else {
      console.log('= SProductPaymentFraction ya existía');
    }

    const process_ = await findOrCreateByCode('sProcess', 'CodProcess', 'SEED_PROCESS', { DesProcess: '[SEED] Proceso de ejemplo', IdeState: ideActivo }, 'SProcess');
    const operation = await findOrCreateByCode('sOperation', 'CodOperation', 'CONTGENE', { DesOperation: 'Generación de contrato', IdeState: ideActivo }, 'SOperation');
    let operationProduct = await prisma.sOperationProduct.findFirst({
      where: { IdeProduct: product.IdeProduct, IdeOperation: operation.IdeOperation, IdeProcess: process_.IdeProcess },
    });
    if (!operationProduct) {
      operationProduct = await prisma.sOperationProduct.create({
        data: { IdeProduct: product.IdeProduct, IdeOperation: operation.IdeOperation, IdeProcess: process_.IdeProcess, Order: 1, IdeState: ideActivo, ...audit },
      });
      console.log('+ SOperationProduct (CONTGENE) creado');
    } else {
      console.log('= SOperationProduct (CONTGENE) ya existía');
    }

    // --- 4. Canal / vía de distribución ---
    const distributionChannel = await findOrCreateByCode(
      'sDistributionChannel', 'CodDistributionChannel', 'SEED_CHANNEL',
      { DesDistributionChannel: '[SEED] Canal de ejemplo', IdeState: ideActivo },
      'SDistributionChannel',
    );
    const distributionWay = await findOrCreateByCode(
      'sDistributionWay', 'CodDistributionWay', 'SEED_WAY',
      { DesDistributionWay: '[SEED] Vía de ejemplo', IdeState: ideActivo },
      'SDistributionWay',
    );

    // --- 5. Roles de persona (códigos reales confirmados) ---
    for (const cod of ['TOMADOR', 'TITULAR', 'BENEFICIARIO', 'ASEGURADO']) {
      await findOrCreateByCode('sPersonRol', 'CodPersonRol', cod, { DesPersonRol: cod, IdeState: ideActivo }, 'SPersonRol');
    }

    // --- 6. Tipo de recibo ---
    await findOrCreateByCode('sReceiptType', 'CodReceiptType', 'NEW', { DesReceiptType: 'Contrato nuevo', IdeState: ideActivo }, 'SReceiptType');

    // --- 7. Concepto REAL "PrimaTotal" + regla que lo alimenta ---
    // El código de underwriting-service busca este código literal
    // (`CodConcept: 'PrimaTotal'`, confirmado contra FQuoteCoverageConcept/
    // FMovementConcept reales) -- distinto del `SEED_CONCEPTO_PRIMATOTAL`
    // de seed-example-rules.js, que solo demuestra DesColumnName y no
    // inserta un concepto real (ver el comentario de ese script).
    const primaTotalConcept = await prisma.sConcept.findUnique({ where: { CodConcept: 'PrimaTotal' } });
    let realPrimaTotal = primaTotalConcept;
    if (!realPrimaTotal) {
      const conceptType = await prisma.sConceptType.findUnique({ where: { CodConceptType: 'SEED_CONCEPTTYPE' } });
      realPrimaTotal = await prisma.sConcept.create({
        data: { CodConcept: 'PrimaTotal', DesConcept: 'Prima total', IdeConceptType: conceptType.IdeConceptType, IdeState: ideActivo, ...audit },
      });
      console.log('+ SConcept (PrimaTotal, real) creado');
    } else {
      console.log('= SConcept (PrimaTotal, real) ya existía');
    }
    const existingRule = await prisma.sCalculationRule.findUnique({ where: { CodCalculationRule: 'SEED_RULE_PRIMATOTAL_REAL' } });
    if (!existingRule) {
      await prisma.sCalculationRule.create({
        data: {
          CodCalculationRule: 'SEED_RULE_PRIMATOTAL_REAL',
          DesCalculationRule: '[SEED] PrimaTotal real (concepto, no columna)',
          IdeCoveragePlan: coveragePlan.IdeCoveragePlan,
          IdeConcept: realPrimaTotal.IdeConcept,
          Order: 4,
          DesColumnName: null,
          FormulaJSON: { IF: 'TRUE', THEN: "rule('SEED_RULE_PRIMANETA') + rule('SEED_RULE_IMPUESTO')", ELSE: '0' },
          IdeState: ideActivo,
          ...audit,
        },
      });
      console.log('+ SCalculationRule (PrimaTotal real) creada');
    } else {
      console.log('= SCalculationRule (PrimaTotal real) ya existía');
    }

    // --- 8. Persona de prueba ---
    const person = await findOrCreateByCode('tPerson', 'DesEmail', 'seed.tomador@example.com', {
      DesFirstName: 'Persona',
      DesLastName1: 'De Prueba',
      IndLead: true,
      IndClient: false,
      IdeState: ideActivo,
    }, 'TPerson (de prueba)');

    console.log('\n=== Listo. Datos para armar las llamadas ===');
    console.log(
      JSON.stringify(
        {
          codProduct: product.CodProduct,
          codRiskProduct: riskProduct.CodRiskProduct,
          idePlanProductRisk: planProductRisk.IdePlanProductRisk,
          codDistributionChannel: distributionChannel.CodDistributionChannel,
          codDistributionWay: distributionWay.CodDistributionWay,
          codPaymentFraction: paymentFraction.CodPaymentFraction,
          idePerson: person.IdePerson,
          codPersonRolTomador: 'TOMADOR',
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
