#!/usr/bin/env node
/**
 * Completa, con datos de prueba prefijados `SEED_`, todo lo que le falta
 * a la BD real para poder ejercitar de punta a punta la anulación de
 * contrato (`POST /contracts/:id/cancel`) implementada en
 * `ContractsService.cancel`, equivalente a `FContract('CANCELCONTRACT', ...)`.
 *
 * Requiere haber corrido antes, EN ESTE ORDEN:
 *   1. node packages/database/scripts/seed-example-rules.js
 *   2. node packages/database/scripts/seed-contract-testing-fixtures.js
 *      (re-correr esta si ya se había corrido antes de este cambio: ahora
 *      agrega `TMovementConcept` a `CONTRACT_TREE_ENTITIES`, necesario
 *      para que la cascada `applyStateCascade` -- ya corregida para llegar
 *      hasta `TMovementConcept`, ver `ContractsService.applyStateCascade`
 *      -- no explote con 404 al activar un contrato nuevo)
 * Este script EXTIENDE esos dos, no los duplica.
 *
 * Qué agrega:
 *  - Estados `Modificado`/`Anulado` (nuevos, genéricos, mismo criterio
 *    "no pretende replicar los estados reales del legado" que el resto
 *    de esta máquina de estados de prueba) y las transiciones
 *    `Modificar`/`Anular` que la cascada de `cancel()` recorre:
 *      Modificar: Activo -> Modificado, para TContract/TContractFile/
 *        TFileRisk/TRiskCoverage/TCoverageMovement (los 5 niveles que
 *        `cancelContractFile`/`cancelFileRisk`/`cancelRiskCoverage`/
 *        `cancel` mueven a "Modificar" antes de anular).
 *      Anular: Modificado -> Anulado para TContract/TContractFile/
 *        TFileRisk/TRiskCoverage (ya vienen en Modificado al llegar acá).
 *        Para TCoverageMovement hacen falta DOS orígenes (Modificado
 *        -- el movimiento viejo, que `createCancellationMovement` ya
 *        pasó a Modificar -- y Borrador -- el movimiento nuevo de
 *        cierre, que nunca cambia de estado antes de la cascada final),
 *        y para TMovementConcept también DOS (Activo -- los conceptos
 *        del movimiento viejo, ya activados por la cascada de
 *        CONTRACTNEW -- y Borrador -- los conceptos en 0 que
 *        `setCancelConcept` acaba de crear para el movimiento nuevo).
 *        Confirmado recorriendo el código real de `applyStateCascade`:
 *        busca el estado ACTUAL de cada fila y transiciona desde ahí,
 *        así que hacen falta las reglas para cada estado de origen que
 *        realmente puede aparecer en ese momento de la cascada.
 *  - El endoso de anulación (`SEndorsement`+`SEndorsementReason`+
 *    `SProductEndorsement`) con `ConditionData` habilitando devolución
 *    total de prima/comisión/impuesto (`{refundPremium, refundCommission,
 *    refundTax}: 'SI'`) -- confirmado que `FMovementConcept('SetCancelPrime',
 *    ...)` lee esos 3 campos literalmente del JSON.
 *  - Las 2 operaciones que la cascada real dispara aparte de CONTGENE:
 *    la de anulación propiamente dicha (código de prueba `ANULGENE`,
 *    resuelta dinámicamente vía `SOperationProduct.IdeProductEndorsement`
 *    -- el código en sí no es literal en el TypeScript, a diferencia de
 *    CONTGENE/RECEGENE que SÍ están hardcodeados) y `RECEGENE` (recibos,
 *    sí hardcodeado, resuelto vía `IdeProduct` igual que CONTGENE).
 *  - El tipo de recibo `SUP` (al que SIEMPRE resuelve el recibo de
 *    anulación, confirmado: `NumOperation` da >2 en la práctica --
 *    CONTGENE=1, anulación=2, RECEGENE=3+).
 *  - 3 `SConceptType` REALES (`CALCPRIMA`/`CALCIMPUESTO`/`CALCCOMISION`)
 *    -- códigos que `FMovementConcept('SetCancelPrime', ...)` verifica
 *    literalmente contra `SConceptType.CodConceptType` para decidir qué
 *    conceptos devolver -- y los 3 conceptos REALES que los usan:
 *    `PrimaNeta` (código literal que tanto `SetCancelPrime` como
 *    `FReceipt` buscan tal cual, sin prefijo `SEED_` porque es un
 *    código real del negocio, no de prueba), un concepto de impuesto de
 *    prueba (`SEED_CONCEPTO_IMPUESTO_REAL`, cualquier código sirve, solo
 *    importa su `SConceptType`) y `Comision` (código literal que
 *    `FReceipt`/`generateCancellationReceipts` exige que exista, si no
 *    tira `NotFoundException`).
 *  - 2 `SCalculationRule` nuevas (Order 5/6, sobre el MISMO
 *    `SCoveragePlan` de `SEED_COVERAGE`) que alimentan esos conceptos
 *    reales reusando los valores ya calculados por las reglas de prueba
 *    existentes (`rule('SEED_RULE_PRIMANETA')`/`rule('SEED_RULE_IMPUESTO')`)
 *    -- así CUALQUIER contrato nuevo (incluido el ya verificado de
 *    CONTRACTNEW) termina con un `TMovementConcept` de código `PrimaNeta`
 *    real en su movimiento inicial, que es lo que necesita
 *    `setCancelPrime`/`generateCancellationReceipts` para calcular una
 *    devolución y una comisión reales al anular -- puramente aditivo,
 *    no cambia ningún valor ya calculado por las reglas existentes.
 *  - La cadena de comisión (`SCommissionTree`/`SCommissionTable`/
 *    `SCommission`) sobre el canal `SEED_CHANNEL` y el producto
 *    `SEED_PRODUCT`, comodín (`IdePlanProductRisk`/`IdeCoveragePlan` en
 *    NULL) al 10%, vigente en un rango amplio.
 *
 * Idempotente (mismo patrón `findOrCreateByCode` que los dos scripts
 * anteriores).
 *
 * Uso: node packages/database/scripts/seed-cancelcontract-fixtures.js
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
const FAR_PAST = new Date('2000-01-01T00:00:00.000Z');
const FAR_FUTURE = new Date('2099-12-31T00:00:00.000Z');

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

    // --- 0. Prerrequisitos de los dos scripts anteriores ---
    const product = await prisma.sProduct.findUnique({ where: { CodProduct: 'SEED_PRODUCT' } });
    if (!product) {
      throw new Error('No existe SEED_PRODUCT -- correr primero: node packages/database/scripts/seed-example-rules.js');
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
    const process_ = await prisma.sProcess.findUnique({ where: { CodProcess: 'SEED_PROCESS' } });
    if (!process_) {
      throw new Error(
        'No existe SEED_PROCESS -- correr primero: node packages/database/scripts/seed-contract-testing-fixtures.js',
      );
    }
    const distributionChannel = await prisma.sDistributionChannel.findUnique({ where: { CodDistributionChannel: 'SEED_CHANNEL' } });
    if (!distributionChannel) {
      throw new Error(
        'No existe SEED_CHANNEL -- correr primero: node packages/database/scripts/seed-contract-testing-fixtures.js',
      );
    }

    // --- 1. Estados nuevos: Modificado / Anulado ---
    const sModificado = await findOrCreateByCode('sState', 'CodState', 'SEED_MODIFICADO', { DesState: '[SEED] Modificado' }, 'SState (Modificado)');
    const sAnulado = await findOrCreateByCode('sState', 'CodState', 'SEED_ANULADO', { DesState: '[SEED] Anulado' }, 'SState (Anulado)');

    // --- 2. Máquina de estados: transiciones Modificar / Anular ---
    async function findOrCreateEntity(codEntity) {
      return findOrCreateByCode('sEntity', 'CodEntity', codEntity, { DesEntity: `[SEED] ${codEntity}`, IdeState: ideActivo }, `SEntity (${codEntity})`);
    }

    async function findOrCreateStateRule(codEntity, ideStateFrom, ideStateTo, desOperativeCode) {
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
          IndInitialState: false,
          DesOperativeCode: desOperativeCode,
          IdeState: ideActivo,
          ...audit,
        },
      });
      console.log(`+ SStateRule creada (${codEntity}, op=${desOperativeCode})`);
      return created;
    }

    // 'Modificar': Activo -> Modificado, en los 5 niveles que la cascada
    // de cancelación pasa por "Modificar" antes de anular.
    for (const codEntity of ['TContract', 'TContractFile', 'TFileRisk', 'TRiskCoverage', 'TCoverageMovement']) {
      await findOrCreateStateRule(codEntity, ideActivo, sModificado.IdeState, 'Modificar');
    }

    // 'Anular': Modificado -> Anulado en los 4 niveles que ya llegan en
    // Modificado a la cascada final (TContract/TContractFile/TFileRisk/
    // TRiskCoverage).
    for (const codEntity of ['TContract', 'TContractFile', 'TFileRisk', 'TRiskCoverage']) {
      await findOrCreateStateRule(codEntity, sModificado.IdeState, sAnulado.IdeState, 'Anular');
    }
    // TCoverageMovement: puede llegar en Modificado (el movimiento viejo,
    // repuntado por `createCancellationMovement`) o en Borrador (el
    // movimiento nuevo de cierre, que nunca cambia de estado antes de la
    // cascada final) -- hacen falta las dos reglas.
    await findOrCreateStateRule('TCoverageMovement', sModificado.IdeState, sAnulado.IdeState, 'Anular');
    await findOrCreateStateRule('TCoverageMovement', ideActivo, sAnulado.IdeState, 'Anular'); // por si algún movimiento no se tocó
    const sBorrador = await prisma.sState.findFirst({ where: { CodState: 'SEED_BORRADOR' } });
    if (!sBorrador) {
      throw new Error(
        'No existe SEED_BORRADOR -- correr primero: node packages/database/scripts/seed-contract-testing-fixtures.js',
      );
    }
    await findOrCreateStateRule('TCoverageMovement', sBorrador.IdeState, sAnulado.IdeState, 'Anular');
    // TMovementConcept: puede llegar en Activo (los conceptos del
    // movimiento viejo, ya activados por la cascada de CONTRACTNEW) o en
    // Borrador (los conceptos en 0 que `setCancelConcept` acaba de crear
    // para el movimiento nuevo).
    await findOrCreateStateRule('TMovementConcept', ideActivo, sAnulado.IdeState, 'Anular');
    await findOrCreateStateRule('TMovementConcept', sBorrador.IdeState, sAnulado.IdeState, 'Anular');

    // --- 3. Endoso de anulación ---
    const endorsementReason = await findOrCreateByCode(
      'sEndorsementReason', 'CodEndorsementReason', 'SEED_ENDORSEMENT_REASON',
      { DesEndorsementReason: '[SEED] Motivo de anulación de prueba', IdeState: ideActivo },
      'SEndorsementReason',
    );
    const endorsement = await findOrCreateByCode(
      'sEndorsement', 'CodEndorsement', 'SEED_ENDORSEMENT',
      { DesEndorsement: '[SEED] Endoso de anulación', IdeState: ideActivo },
      'SEndorsement',
    );
    const productEndorsement = await findOrCreateByCode(
      'sProductEndorsement', 'CodProductEndorsement', 'SEED_PRODUCT_ENDORSEMENT',
      {
        DesProductEndorsement: '[SEED] Anulación total (prima/comisión/impuesto)',
        IdeProduct: product.IdeProduct,
        IdeEndorsement: endorsement.IdeEndorsement,
        IdeEndorsementReason: endorsementReason.IdeEndorsementReason,
        ConditionData: { refundPremium: 'SI', refundCommission: 'SI', refundTax: 'SI' },
        IdeState: ideActivo,
      },
      'SProductEndorsement',
    );

    // --- 4. Operaciones ANULGENE (anulación) y RECEGENE (recibos) ---
    const anulgeneOperation = await findOrCreateByCode('sOperation', 'CodOperation', 'ANULGENE', { DesOperation: '[SEED] Anulación de contrato', IdeState: ideActivo }, 'SOperation (ANULGENE)');
    let anulgeneOperationProduct = await prisma.sOperationProduct.findFirst({
      where: { IdeProduct: product.IdeProduct, IdeOperation: anulgeneOperation.IdeOperation, IdeProcess: process_.IdeProcess },
    });
    if (!anulgeneOperationProduct) {
      anulgeneOperationProduct = await prisma.sOperationProduct.create({
        data: {
          IdeProduct: product.IdeProduct,
          IdeOperation: anulgeneOperation.IdeOperation,
          IdeProcess: process_.IdeProcess,
          IdeProductEndorsement: productEndorsement.IdeProductEndorsement,
          Order: 2,
          IdeState: ideActivo,
          ...audit,
        },
      });
      console.log('+ SOperationProduct (ANULGENE, vía endoso) creado');
    } else {
      console.log('= SOperationProduct (ANULGENE) ya existía');
    }

    const recegeneOperation = await findOrCreateByCode('sOperation', 'CodOperation', 'RECEGENE', { DesOperation: 'Generación de recibos', IdeState: ideActivo }, 'SOperation (RECEGENE)');
    let recegeneOperationProduct = await prisma.sOperationProduct.findFirst({
      where: { IdeProduct: product.IdeProduct, IdeOperation: recegeneOperation.IdeOperation, IdeProcess: process_.IdeProcess },
    });
    if (!recegeneOperationProduct) {
      recegeneOperationProduct = await prisma.sOperationProduct.create({
        data: {
          IdeProduct: product.IdeProduct,
          IdeOperation: recegeneOperation.IdeOperation,
          IdeProcess: process_.IdeProcess,
          Order: 3,
          IdeState: ideActivo,
          ...audit,
        },
      });
      console.log('+ SOperationProduct (RECEGENE) creado');
    } else {
      console.log('= SOperationProduct (RECEGENE) ya existía');
    }

    // --- 5. Tipo de recibo SUP (al que siempre resuelve la anulación) ---
    await findOrCreateByCode('sReceiptType', 'CodReceiptType', 'SUP', { DesReceiptType: 'Suplemento', IdeState: ideActivo }, 'SReceiptType (SUP)');

    // --- 6. Tipos de concepto REALES que SetCancelPrime verifica literalmente ---
    const conceptTypeCalcPrima = await findOrCreateByCode('sConceptType', 'CodConceptType', 'CALCPRIMA', { DesConceptType: 'Cálculo de prima', IdeState: ideActivo }, 'SConceptType (CALCPRIMA)');
    const conceptTypeCalcImpuesto = await findOrCreateByCode('sConceptType', 'CodConceptType', 'CALCIMPUESTO', { DesConceptType: 'Cálculo de impuesto', IdeState: ideActivo }, 'SConceptType (CALCIMPUESTO)');
    const conceptTypeCalcComision = await findOrCreateByCode('sConceptType', 'CodConceptType', 'CALCCOMISION', { DesConceptType: 'Cálculo de comisión', IdeState: ideActivo }, 'SConceptType (CALCCOMISION)');

    // --- 7. Conceptos REALES (códigos literales que el código busca tal cual) ---
    const primaNetaConcept = await findOrCreateByCode(
      'sConcept', 'CodConcept', 'PrimaNeta',
      { DesConcept: 'Prima neta', IdeConceptType: conceptTypeCalcPrima.IdeConceptType, IdeState: ideActivo },
      'SConcept (PrimaNeta, real)',
    );
    const impuestoRealConcept = await findOrCreateByCode(
      'sConcept', 'CodConcept', 'SEED_CONCEPTO_IMPUESTO_REAL',
      { DesConcept: '[SEED] Impuesto (tipo real CALCIMPUESTO)', IdeConceptType: conceptTypeCalcImpuesto.IdeConceptType, IdeState: ideActivo },
      'SConcept (impuesto, tipo real)',
    );
    const comisionConcept = await findOrCreateByCode(
      'sConcept', 'CodConcept', 'Comision',
      { DesConcept: 'Comisión', IdeConceptType: conceptTypeCalcComision.IdeConceptType, IdeState: ideActivo },
      'SConcept (Comision, real)',
    );

    // --- 8. Reglas de cálculo que alimentan esos conceptos reales ---
    async function findOrCreateRule(code, order, ideConcept, formula, label) {
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
          DesColumnName: null,
          FormulaJSON: formula,
          IdeState: ideActivo,
          ...audit,
        },
      });
      console.log(`+ ${label} creado (${code})`);
      return created;
    }
    await findOrCreateRule(
      'SEED_RULE_PRIMANETA_REAL', 5, primaNetaConcept.IdeConcept,
      { IF: 'TRUE', THEN: "rule('SEED_RULE_PRIMANETA')", ELSE: '0' },
      '[SEED] Regla PrimaNeta (real)',
    );
    await findOrCreateRule(
      'SEED_RULE_IMPUESTO_REAL', 6, impuestoRealConcept.IdeConcept,
      { IF: 'TRUE', THEN: "rule('SEED_RULE_IMPUESTO')", ELSE: '0' },
      '[SEED] Regla Impuesto (tipo real)',
    );

    // --- 9. Cadena de comisión: canal -> árbol -> tabla -> comisión ---
    const commissionTree = await findOrCreateByCode(
      'sCommissionTree', 'CodCommissionTree', 'SEED_COMMISSION_TREE',
      { DesCommissionTree: '[SEED] Árbol de comisión', IdeDistributionChannel: distributionChannel.IdeDistributionChannel, IdeState: ideActivo },
      'SCommissionTree',
    );
    const commissionTable = await findOrCreateByCode(
      'sCommissionTable', 'CodCommissionTable', 'SEED_COMMISSION_TABLE',
      {
        DesCommissionTable: '[SEED] Tabla de comisión (comodín)',
        IdeCommissionTree: commissionTree.IdeCommissionTree,
        IdeProduct: product.IdeProduct,
        IdePlanProductRisk: null,
        IdeCoveragePlan: null,
        IdeState: ideActivo,
      },
      'SCommissionTable',
    );
    let commission = await prisma.sCommission.findFirst({
      where: { IdeCommissionTable: commissionTable.IdeCommissionTable, IdeProcess: process_.IdeProcess, NumMovement: 1 },
    });
    if (!commission) {
      commission = await prisma.sCommission.create({
        data: {
          IdeCommissionTable: commissionTable.IdeCommissionTable,
          IdeProcess: process_.IdeProcess,
          Percentaje: 10,
          TstInitial: FAR_PAST,
          TstEnd: FAR_FUTURE,
          NumMovement: 1,
          IdeState: ideActivo,
          ...audit,
        },
      });
      console.log('+ SCommission (10%) creada');
    } else {
      console.log('= SCommission ya existía');
    }

    console.log('\n=== Listo. Datos para armar la llamada de anulación ===');
    console.log(
      JSON.stringify(
        {
          ideProductEndorsement: productEndorsement.IdeProductEndorsement,
          nota: 'POST /contracts/:id/cancel con { ideProductEndorsement, tstCancellation, desCancellation }',
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
