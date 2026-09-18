#!/usr/bin/env node
/**
 * Junta los datos reales necesarios para probar a mano, de punta a
 * punta, el flujo cotización -> contrato (POST /quotes ->
 * POST /quotes/:id/price -> selección -> POST /quotes/:id/persons ->
 * POST /quotes/:id/state('Aceptado') -> POST /quotes/:id/contract).
 *
 * No modifica nada -- solo lectura. Uso:
 *   node packages/database/scripts/investigate-testing-data.js
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
loadEnvFile(path.join(__dirname, '..', '.env'));

const prisma = new PrismaClient();

async function main() {
  console.log('=== Usuarios de aplicación (TUser) ===');
  const users = await prisma.tUser.findMany({ take: 5, select: { IdeUser: true, CodUser: true } });
  console.log(users.length ? users : 'Ningún usuario todavía -- correr node packages/database/scripts/seed-admin-user.js');

  console.log('\n=== Reglas de estado de TQuote (SStateRule) ===');
  const quoteRules = await prisma.sStateRule.findMany({
    where: { SEntity: { CodEntity: 'TQuote' } },
    include: {
      SState_SStateRule_IdeStateFromToSState: { select: { CodState: true } },
      SState_SStateRule_IdeStateToToSState: { select: { CodState: true } },
    },
  });
  for (const rule of quoteRules) {
    console.log(
      `  ${rule.IndInitialState ? '[INICIAL] ' : ''}${rule.SState_SStateRule_IdeStateFromToSState.CodState} --(${rule.DesOperativeCode}
)--> ${rule.SState_SStateRule_IdeStateToToSState.CodState}`.replace('\n', ''),
    );
  }

  console.log('\n=== Productos con vigencia + fracción de pago + operación CONTGENE configuradas ===');
  const products = await prisma.sProduct.findMany({
    include: {
      SProductValidityType: { include: { SValidityType: true } },
      SProductPaymentFraction: { include: { SPaymentFraction: true } },
      SOperationProduct: { include: { SOperation: true } },
    },
    take: 20,
  });
  for (const product of products) {
    const hasContgene = product.SOperationProduct.some((op) => op.SOperation.CodOperation === 'CONTGENE');
    if (product.SProductValidityType.length === 0 || product.SProductPaymentFraction.length === 0 || !hasContgene) {
      continue;
    }
    console.log(`\n  Producto: ${product.CodProduct} (${product.DesProduct}) -- ideProduct=${product.IdeProduct}`);
    console.log(
      `    Vigencia: ${product.SProductValidityType.map((v) => `${v.SValidityType.CodValidityType}(anual=${v.SValidityType.IndAnnual})`).join(', ')}`,
    );
    console.log(
      `    Fracciones de pago: ${product.SProductPaymentFraction.map((f) => f.SPaymentFraction.CodPaymentFraction).join(', ')}`,
    );

    const riskProducts = await prisma.sRiskProduct.findMany({
      where: { IdeProduct: product.IdeProduct },
      include: {
        SPlanProductRisk: {
          include: {
            SCoveragePlan: { include: { SCoverage: { include: { SInsuranceLine: true } } } },
            SPlanProduct: true,
          },
        },
      },
    });
    for (const riskProduct of riskProducts) {
      const validPlans = riskProduct.SPlanProductRisk.filter((p) => p.SCoveragePlan.length > 0);
      if (validPlans.length === 0) continue;
      console.log(`    Riesgo: ${riskProduct.CodRiskProduct} -- ideRiskProduct=${riskProduct.IdeRiskProduct}`);
      for (const plan of validPlans) {
        console.log(
          `      Plan: ${plan.SPlanProduct.CodPlanProduct} -- idePlanProductRisk=${plan.IdePlanProductRisk} (${plan.SCoveragePlan.length} coberturas, línea de seguro: ${[...new Set(plan.SCoveragePlan.map((c) => c.SCoverage.SInsuranceLine.IdeInsuranceLine))].join(',')})`,
        );
      }
    }
  }

  console.log('\n=== Canales / vías de distribución (algunos) ===');
  const channels = await prisma.sDistributionChannel.findMany({ take: 5, select: { IdeDistributionChannel: true, CodDistributionChannel: true } });
  console.log(channels);
  const ways = await prisma.sDistributionWay.findMany({ take: 5, select: { IdeDistributionWay: true, CodDistributionWay: true } });
  console.log(ways);

  console.log('\n=== Tipos de recibo (SReceiptType) ===');
  console.log(await prisma.sReceiptType.findMany({ select: { CodReceiptType: true, DesReceiptType: true } }));

  console.log('\n=== Concepto PrimaTotal existe? ===');
  console.log(await prisma.sConcept.findFirst({ where: { CodConcept: 'PrimaTotal' } }));

  console.log('\n=== Roles de persona (SPersonRol) ===');
  console.log(await prisma.sPersonRol.findMany({ select: { CodPersonRol: true } }));

  console.log('\n=== Reglas de cálculo configuradas (SCalculationRule, algunas) ===');
  const rules = await prisma.sCalculationRule.findMany({ take: 5 });
  console.log(rules.length ? `Hay ${rules.length}+ reglas configuradas` : 'NINGUNA regla de cálculo configurada -- la prima quedaría en 0');
}

main()
  .catch((err) => {
    console.error('ERROR:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
