#!/usr/bin/env node
/**
 * Elimina EN CASCADA un producto completo (SProduct) y absolutamente todo lo
 * que depende de él en la base de datos: configuración de planes/riesgos/
 * coberturas, tarificación, comisiones, endosos, requisitos, consentimientos,
 * cotizaciones, contratos, movimientos de cobertura, recibos y siniestros.
 *
 * *** ESTE SCRIPT ES DESTRUCTIVO E IRREVERSIBLE ***
 * Pensado para borrar productos de PRUEBA o mal configurados durante el
 * desarrollo. NUNCA debe correrse contra un producto con actividad real que
 * se quiera conservar.
 *
 * Por qué existe como un borrado "manual" en vez de un ON DELETE CASCADE:
 * absolutamente todas las claves foráneas de este esquema están declaradas
 * `onDelete: NoAction` (ver schema.prisma) -- Postgres no borra nada en
 * cascada por sí solo. Este script recorre el árbol de dependencias de
 * SProduct (63 tablas en total, verificado línea por línea contra
 * schema.prisma) y borra cada tabla en el orden correcto: siempre los
 * "hijos" antes que los "padres", para no violar ninguna restricción de
 * clave foránea.
 *
 * RED DE SEGURIDAD: aunque el orden de borrado esté mal en algún caso muy
 * excepcional (p. ej. datos de prueba con referencias cruzadas entre
 * productos que este script no contempló), TODO el borrado ocurre dentro de
 * una única transacción de Postgres. Si una fila que no fue contemplada
 * todavía referencia algo que se intenta borrar, Postgres rechaza esa
 * operación por la restricción de clave foránea y AUTOMÁTICAMENTE se revierte
 * la transacción completa: no queda nada a medio borrar. El script detecta
 * ese caso (código de error Prisma "P2003") y lo explica claramente.
 *
 * MODO SEGURO POR DEFECTO (dry-run): sin la bandera --confirm, el script
 * SOLO cuenta y muestra cuántas filas se eliminarían en cada tabla -- no
 * borra nada. Usa exactamente el mismo código/los mismos filtros que el
 * borrado real, así que el conteo mostrado es exacto.
 *
 * Uso:
 *   node packages/database/scripts/delete-product-cascade.js <CodProduct>
 *     -> Dry-run: muestra cuántas filas se eliminarían, tabla por tabla.
 *
 *   node packages/database/scripts/delete-product-cascade.js <CodProduct> --confirm --i-understand-this-is-irreversible
 *     -> Ejecuta el borrado real dentro de una única transacción (todo o nada).
 *
 * IMPORTANTE (convención de este proyecto): este script toca directamente la
 * base de datos compartida -- ejecútalo tú mismo desde tu propia terminal,
 * nunca lo hagas correr una herramienta automatizada por ti. Haz un respaldo
 * si el producto tiene datos que te importen antes de usar --confirm.
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

const prisma = new PrismaClient();

const ids = (rows, field) => rows.map((r) => r[field]);

/**
 * Recolecta, SOLO LECTURA, todos los IDs necesarios para construir los
 * filtros de borrado. Se recorre el árbol de arriba hacia abajo (padres
 * primero) porque para encontrar los hijos hace falta conocer el ID del
 * padre.
 */
async function collectIds(ideProduct) {
  const planProducts = await prisma.sPlanProduct.findMany({ where: { IdeProduct: ideProduct }, select: { IdePlanProduct: true } });
  const planProductIds = ids(planProducts, 'IdePlanProduct');

  const riskProducts = await prisma.sRiskProduct.findMany({ where: { IdeProduct: ideProduct }, select: { IdeRiskProduct: true, CodRiskProduct: true } });
  const riskProductIds = ids(riskProducts, 'IdeRiskProduct');
  const riskProductCodes = ids(riskProducts, 'CodRiskProduct');

  const planProductRisks = await prisma.sPlanProductRisk.findMany({ where: { IdePlanProduct: { in: planProductIds } }, select: { IdePlanProductRisk: true } });
  const planProductRiskIds = ids(planProductRisks, 'IdePlanProductRisk');

  const coveragePlans = await prisma.sCoveragePlan.findMany({ where: { IdePlanProductRisk: { in: planProductRiskIds } }, select: { IdeCoveragePlan: true } });
  const coveragePlanIds = ids(coveragePlans, 'IdeCoveragePlan');

  const claimTypes = await prisma.sClaimType.findMany({ where: { IdeProduct: ideProduct }, select: { IdeClaimType: true } });
  const claimTypeIds = ids(claimTypes, 'IdeClaimType');

  const operationProducts = await prisma.sOperationProduct.findMany({ where: { IdeProduct: ideProduct }, select: { IdeOperationProduct: true } });
  const operationProductIds = ids(operationProducts, 'IdeOperationProduct');

  const consents = await prisma.sConsent.findMany({ where: { IdeProduct: ideProduct }, select: { IdeConsent: true } });
  const consentIds = ids(consents, 'IdeConsent');

  const commissionTables = await prisma.sCommissionTable.findMany({ where: { IdeProduct: ideProduct }, select: { IdeCommissionTable: true } });
  const commissionTableIds = ids(commissionTables, 'IdeCommissionTable');

  const pricingRuleSets = await prisma.sPricingRuleSet.findMany({ where: { IdeCoveragePlan: { in: coveragePlanIds } }, select: { IdePricingRuleSet: true } });
  const pricingRuleSetIds = ids(pricingRuleSets, 'IdePricingRuleSet');

  const quotes = await prisma.tQuote.findMany({ where: { IdeProduct: ideProduct }, select: { IdeQuote: true } });
  const quoteIds = ids(quotes, 'IdeQuote');

  const quoteRisks = await prisma.tQuoteRisk.findMany({ where: { IdeQuote: { in: quoteIds } }, select: { IdeQuoteRisk: true } });
  const quoteRiskIds = ids(quoteRisks, 'IdeQuoteRisk');

  const quoteRiskPlans = await prisma.tQuoteRiskPlan.findMany({ where: { IdeQuoteRisk: { in: quoteRiskIds } }, select: { IdeQuoteRiskPlan: true } });
  const quoteRiskPlanIds = ids(quoteRiskPlans, 'IdeQuoteRiskPlan');

  const quoteCoverages = await prisma.tQuoteCoverage.findMany({ where: { IdeQuoteRiskPlan: { in: quoteRiskPlanIds } }, select: { IdeQuoteCoverage: true } });
  const quoteCoverageIds = ids(quoteCoverages, 'IdeQuoteCoverage');

  const contracts = await prisma.tContract.findMany({ where: { IdeProduct: ideProduct }, select: { IdeContract: true } });
  const contractIds = ids(contracts, 'IdeContract');

  const contractFiles = await prisma.tContractFile.findMany({ where: { IdeContract: { in: contractIds } }, select: { IdeContractFile: true } });
  const contractFileIds = ids(contractFiles, 'IdeContractFile');

  const contractOperations = await prisma.tContractOperation.findMany({ where: { IdeContract: { in: contractIds } }, select: { IdeContractOperation: true } });
  const contractOperationIds = ids(contractOperations, 'IdeContractOperation');

  const fileRisks = await prisma.tFileRisk.findMany({ where: { IdeContractFile: { in: contractFileIds } }, select: { IdeFileRisk: true } });
  const fileRiskIds = ids(fileRisks, 'IdeFileRisk');

  const riskCoverages = await prisma.tRiskCoverage.findMany({ where: { IdeFileRisk: { in: fileRiskIds } }, select: { IdeRiskCoverage: true } });
  const riskCoverageIds = ids(riskCoverages, 'IdeRiskCoverage');

  const coverageMovements = await prisma.tCoverageMovement.findMany({ where: { IdeRiskCoverage: { in: riskCoverageIds } }, select: { IdeCoverageMovement: true } });
  const coverageMovementIds = ids(coverageMovements, 'IdeCoverageMovement');

  const receipts = await prisma.tReceipt.findMany({ where: { IdeContract: { in: contractIds } }, select: { IdeReceipt: true } });
  const receiptIds = ids(receipts, 'IdeReceipt');

  const claims = await prisma.tClaim.findMany({ where: { IdeContractFile: { in: contractFileIds } }, select: { IdeClaim: true } });
  const claimIds = ids(claims, 'IdeClaim');

  const claimFiles = await prisma.tClaimFile.findMany({ where: { IdeClaim: { in: claimIds } }, select: { IdeClaimFile: true } });
  const claimFileIds = ids(claimFiles, 'IdeClaimFile');

  const claimRisks = await prisma.tClaimRisk.findMany({ where: { IdeClaimFile: { in: claimFileIds } }, select: { IdeClaimRisk: true } });
  const claimRiskIds = ids(claimRisks, 'IdeClaimRisk');

  const coverageProvisions = await prisma.tCoverageProvision.findMany({ where: { IdeClaimRisk: { in: claimRiskIds } }, select: { IdeCoverageProvision: true } });
  const coverageProvisionIds = ids(coverageProvisions, 'IdeCoverageProvision');

  const approvals = await prisma.tApproval.findMany({ where: { IdeClaimFile: { in: claimFileIds } }, select: { IdeApproval: true } });
  const approvalIds = ids(approvals, 'IdeApproval');

  return {
    planProductIds, riskProductIds, riskProductCodes, planProductRiskIds, coveragePlanIds,
    claimTypeIds, operationProductIds, consentIds, commissionTableIds, pricingRuleSetIds,
    quoteIds, quoteRiskIds, quoteRiskPlanIds, quoteCoverageIds,
    contractIds, contractFileIds, contractOperationIds, fileRiskIds, riskCoverageIds,
    coverageMovementIds, receiptIds, claimIds, claimFileIds, claimRiskIds,
    coverageProvisionIds, approvalIds,
  };
}

/**
 * Construye la lista ordenada de pasos de borrado: SIEMPRE hijos antes que
 * padres. Esta misma lista (mismos modelos, mismos filtros) se usa tanto
 * para el conteo en dry-run como para el borrado real con --confirm, para
 * garantizar que lo que se muestra es exactamente lo que se borraría.
 */
function buildSteps(ideProduct, x) {
  const inList = (arr) => ({ in: arr });
  return [
    // --- Nivel 1: hojas puras (nada más las referencia) ---
    { model: 'sCommissionProduct', label: 'SCommissionProduct', where: { IdeProduct: ideProduct } },
    { model: 'sCommission', label: 'SCommission', where: { IdeCommissionTable: inList(x.commissionTableIds) } },
    { model: 'sOperationProductTemplate', label: 'SOperationProductTemplate', where: { IdeOperationProduct: inList(x.operationProductIds) } },
    { model: 'tClaimOperation', label: 'TClaimOperation', where: { IdeClaim: inList(x.claimIds) } },
    { model: 'tQuoteOperation', label: 'TQuoteOperation', where: { IdeQuote: inList(x.quoteIds) } },
    { model: 'sCalculationRule', label: 'SCalculationRule', where: { IdeCoveragePlan: inList(x.coveragePlanIds) } },
    { model: 'sProductDiscount', label: 'SProductDiscount', where: { IdeProduct: ideProduct } },
    { model: 'sProductPaymentFraction', label: 'SProductPaymentFraction', where: { IdeProduct: ideProduct } },
    { model: 'sProductProcessFlow', label: 'SProductProcessFlow', where: { IdeProduct: ideProduct } },
    { model: 'sProductValidityType', label: 'SProductValidityType', where: { IdeProduct: ideProduct } },
    { model: 'sSocialImpactConfig', label: 'SSocialImpactConfig', where: { IdeProduct: ideProduct } },
    { model: 'tContractBilling', label: 'TContractBilling', where: { IdeContract: inList(x.contractIds) } },
    { model: 'tContractDistributionChannel', label: 'TContractDistributionChannel', where: { IdeContract: inList(x.contractIds) } },
    { model: 'tContractPerson', label: 'TContractPerson', where: { IdeContract: inList(x.contractIds) } },
    { model: 'tQuotePerson', label: 'TQuotePerson', where: { IdeQuote: inList(x.quoteIds) } },
    { model: 'tQuoteSocialImpactAnswer', label: 'TQuoteSocialImpactAnswer', where: { IdeQuote: inList(x.quoteIds) } },
    { model: 'tContractFilePerson', label: 'TContractFilePerson', where: { IdeContractFile: inList(x.contractFileIds) } },
    { model: 'tContractOperationDocument', label: 'TContractOperationDocument', where: { IdeContractOperation: inList(x.contractOperationIds) } },
    { model: 'tMovementConcept', label: 'TMovementConcept', where: { IdeCoverageMovement: inList(x.coverageMovementIds) } },
    { model: 'tApprovalDetail', label: 'TApprovalDetail', where: { IdeApproval: inList(x.approvalIds) } },
    { model: 'tClaimPayment', label: 'TClaimPayment', where: { IdeApproval: inList(x.approvalIds) } },
    { model: 'tGuaranteeProvision', label: 'TGuaranteeProvision', where: { IdeCoverageProvision: inList(x.coverageProvisionIds) } },
    { model: 'tFileRiskPerson', label: 'TFileRiskPerson', where: { IdeFileRisk: inList(x.fileRiskIds) } },
    { model: 'tQuoteCoverageConcept', label: 'TQuoteCoverageConcept', where: { IdeQuoteCoverage: inList(x.quoteCoverageIds) } },
    { model: 'tClaimRequirement', label: 'TClaimRequirement', where: { IdeClaimFile: inList(x.claimFileIds) } },
    { model: 'tContractRequirement', label: 'TContractRequirement', where: { IdeFileRisk: inList(x.fileRiskIds) } },
    { model: 'tQuoteRequirement', label: 'TQuoteRequirement', where: { IdeQuoteRisk: inList(x.quoteRiskIds) } },
    { model: 'sRiskProductMapping', label: 'SRiskProductMapping', where: { CodRiskProduct: inList(x.riskProductCodes) } },
    { model: 'sDepreciation', label: 'SDepreciation', where: { IdeRiskProduct: inList(x.riskProductIds) } },
    { model: 'sClaimApprovalThreshold', label: 'SClaimApprovalThreshold', where: { IdeProduct: ideProduct } },
    { model: 'tReceiptDetail', label: 'TReceiptDetail', where: { IdeReceipt: inList(x.receiptIds) } },
    { model: 'sPricingConcept', label: 'SPricingConcept', where: { IdePricingRuleSet: inList(x.pricingRuleSetIds) } },
    { model: 'tPersonConsent', label: 'TPersonConsent', where: { OR: [{ IdeConsent: inList(x.consentIds) }, { IdeQuote: inList(x.quoteIds) }, { IdeContractOperation: inList(x.contractOperationIds) }] } },

    // --- Nivel 2 ---
    { model: 'sProductRequirement', label: 'SProductRequirement', where: { IdeProduct: ideProduct } },
    { model: 'tQuoteCoverage', label: 'TQuoteCoverage', where: { IdeQuoteRiskPlan: inList(x.quoteRiskPlanIds) } },
    { model: 'tCoverageProvision', label: 'TCoverageProvision', where: { IdeClaimRisk: inList(x.claimRiskIds) } },
    { model: 'tApproval', label: 'TApproval', where: { IdeClaimFile: inList(x.claimFileIds) } },
    { model: 'tCoverageMovement', label: 'TCoverageMovement', where: { IdeRiskCoverage: inList(x.riskCoverageIds) } },
    { model: 'tReceipt', label: 'TReceipt', where: { IdeContract: inList(x.contractIds) } },
    { model: 'sConsent', label: 'SConsent', where: { IdeProduct: ideProduct } },
    { model: 'sCommissionTable', label: 'SCommissionTable', where: { IdeProduct: ideProduct } },

    // --- Nivel 3 ---
    { model: 'sPricingRuleSet', label: 'SPricingRuleSet', where: { IdeCoveragePlan: inList(x.coveragePlanIds) } },
    { model: 'sCoverageGuarantee', label: 'SCoverageGuarantee', where: { IdeCoveragePlan: inList(x.coveragePlanIds) } },
    { model: 'tQuoteRiskPlan', label: 'TQuoteRiskPlan', where: { IdeQuoteRisk: inList(x.quoteRiskIds) } },
    { model: 'tClaimRisk', label: 'TClaimRisk', where: { IdeClaimFile: inList(x.claimFileIds) } },
    { model: 'tRiskCoverage', label: 'TRiskCoverage', where: { IdeFileRisk: inList(x.fileRiskIds) } },
    { model: 'tContractOperation', label: 'TContractOperation', where: { IdeContract: inList(x.contractIds) } },

    // --- Nivel 4 ---
    { model: 'tFileRisk', label: 'TFileRisk', where: { IdeContractFile: inList(x.contractFileIds) } },
    { model: 'tQuoteRisk', label: 'TQuoteRisk', where: { IdeQuote: inList(x.quoteIds) } },
    { model: 'tClaimFile', label: 'TClaimFile', where: { IdeClaim: inList(x.claimIds) } },
    { model: 'sOperationProduct', label: 'SOperationProduct', where: { IdeProduct: ideProduct } },
    { model: 'sCoveragePlan', label: 'SCoveragePlan', where: { IdePlanProductRisk: inList(x.planProductRiskIds) } },

    // --- Nivel 5 ---
    { model: 'tClaim', label: 'TClaim', where: { IdeContractFile: inList(x.contractFileIds) } },
    { model: 'sClaimEvent', label: 'SClaimEvent', where: { IdeClaimType: inList(x.claimTypeIds) } },
    { model: 'sProductEndorsement', label: 'SProductEndorsement', where: { IdeProduct: ideProduct } },
    { model: 'sPlanProductRisk', label: 'SPlanProductRisk', where: { IdePlanProduct: inList(x.planProductIds) } },

    // --- Nivel 6 ---
    { model: 'sClaimType', label: 'SClaimType', where: { IdeProduct: ideProduct } },
    { model: 'tContractFile', label: 'TContractFile', where: { IdeContract: inList(x.contractIds) } },

    // --- Nivel 7 ---
    { model: 'sPlanProduct', label: 'SPlanProduct', where: { IdeProduct: ideProduct } },
    { model: 'sRiskProduct', label: 'SRiskProduct', where: { IdeProduct: ideProduct } },
    { model: 'tContract', label: 'TContract', where: { IdeProduct: ideProduct } },

    // --- Nivel 8 ---
    { model: 'tQuote', label: 'TQuote', where: { IdeProduct: ideProduct } },

    // (SProduct se borra aparte, al final, fuera de esta lista)
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const codProduct = args.find((a) => !a.startsWith('--'));
  const confirm = args.includes('--confirm');
  const understand = args.includes('--i-understand-this-is-irreversible');

  if (!codProduct) {
    console.error('Uso: node delete-product-cascade.js <CodProduct> [--confirm --i-understand-this-is-irreversible]');
    process.exitCode = 1;
    return;
  }

  const product = await prisma.sProduct.findUnique({ where: { CodProduct: codProduct } });
  if (!product) {
    console.error(`No existe ningún producto con CodProduct="${codProduct}".`);
    process.exitCode = 1;
    return;
  }

  console.log(`Producto encontrado: "${product.DesProduct}" (CodProduct=${product.CodProduct}, IdeProduct=${product.IdeProduct})`);
  const ideProduct = product.IdeProduct;

  console.log('\nRecolectando el árbol de dependencias (solo lectura)...');
  const collected = await collectIds(ideProduct);
  const steps = buildSteps(ideProduct, collected);

  if (!confirm) {
    console.log('\n=== MODO DRY-RUN: no se borra nada, solo se cuenta ===\n');
    let total = 0;
    for (const step of steps) {
      const count = await prisma[step.model].count({ where: step.where });
      total += count;
      if (count > 0) console.log(`  ${step.label.padEnd(32, ' ')} ${count}`);
    }
    console.log(`\nTotal de filas relacionadas que se eliminarían: ${total}`);
    console.log('(más la propia fila de SProduct)');
    console.log('\nPara ejecutar el borrado real:');
    console.log(`  node packages/database/scripts/delete-product-cascade.js "${codProduct}" --confirm --i-understand-this-is-irreversible`);
    return;
  }

  if (!understand) {
    console.error('\nFalta la bandera --i-understand-this-is-irreversible. No se borró nada.');
    process.exitCode = 1;
    return;
  }

  console.log('\n=== BORRANDO EN CASCADA (una sola transacción, todo o nada) ===\n');
  try {
    await prisma.$transaction(
      async (tx) => {
        let total = 0;
        for (const step of steps) {
          const result = await tx[step.model].deleteMany({ where: step.where });
          total += result.count;
          if (result.count > 0) console.log(`  ${step.label.padEnd(32, ' ')} ${result.count} fila(s) eliminada(s)`);
        }
        await tx.sProduct.delete({ where: { IdeProduct: ideProduct } });
        console.log(`\nProducto "${product.DesProduct}" eliminado correctamente.`);
        console.log(`Total de filas relacionadas eliminadas: ${total}`);
      },
      { timeout: 120000, maxWait: 15000 },
    );
  } catch (err) {
    if (err && err.code === 'P2003') {
      console.error('\n>>> ABORTADO: Postgres rechazó el borrado por una restricción de clave foránea.');
      console.error('    Esto significa que existe alguna fila, en alguna tabla, que todavía hace');
      console.error('    referencia a este producto (o a algo dentro de su árbol) y que este script');
      console.error('    no contempló. Gracias a que todo corre en una única transacción, NO SE');
      console.error('    BORRÓ NADA: la operación se revirtió por completo.');
      console.error(`    Detalle técnico: ${err.message}`);
    } else {
      console.error('\n>>> ABORTADO por un error inesperado. No se borró nada (transacción revertida).');
      console.error(err);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
