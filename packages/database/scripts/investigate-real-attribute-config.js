#!/usr/bin/env node
/**
 * Confirma contra los datos REALES de `ars_platform` (no el esquema
 * legacy `entity`, que solo sirvió para entender el formato del JSON
 * -- ver `investigate-attribute-property-schemas.js`) qué configuró el
 * usuario a mano para el atributo "Raza" (y cualquier otro atributo
 * personalizado) del producto de mascotas.
 *
 * Usa el mismo Prisma Client ya generado en packages/database (apunta
 * al `ars_platform` real, vía DATABASE_URL de su .env) -- mismo patrón
 * que investigate-state-machine-config.js.
 *
 * Uso: node packages/database/scripts/investigate-real-attribute-config.js
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  console.log('\n########## 1. SModelAttribute reales ##########');
  const models = await prisma.sModelAttribute.findMany();
  console.log(`Total: ${models.length}`);
  for (const m of models) {
    console.log(JSON.stringify(m, null, 2));
  }

  console.log('\n########## 2. SEntity referenciadas por IdeEntityApply/IdeEntityReference ##########');
  const entityIds = [...new Set(models.flatMap((m) => [m.IdeEntityApply, m.IdeEntityReference]))];
  if (entityIds.length > 0) {
    const entities = await prisma.sEntity.findMany({ where: { IdeEntity: { in: entityIds } } });
    console.log(JSON.stringify(entities, null, 2));
  }

  console.log('\n########## 3. A qué apunta IdeReference de cada SModelAttribute (asumiendo SRiskProduct) ##########');
  for (const m of models) {
    try {
      const riskProduct = await prisma.sRiskProduct.findUnique({ where: { IdeRiskProduct: m.IdeReference } });
      console.log(`SModelAttribute "${m.CodModelAttribute}" -> IdeReference=${m.IdeReference} -> SRiskProduct: ${riskProduct ? `${riskProduct.CodRiskProduct} ("${riskProduct.DesShort ?? riskProduct.DesLarge ?? ''}")` : '(NO ENCONTRADO como SRiskProduct)'}`);
    } catch (err) {
      console.log(`SModelAttribute "${m.CodModelAttribute}" -> error resolviendo IdeReference: ${err.message}`);
    }
  }

  console.log('\n########## 4. SAttributeProperty reales, con su SAttribute/SFieldDictionary/SFieldValue ##########');
  const props = await prisma.sAttributeProperty.findMany({
    include: { SAttribute: { include: { SFieldDictionary: { include: { SFieldValue: true } } } }, SModelAttribute: true },
  });
  console.log(`Total: ${props.length}`);
  for (const p of props) {
    let parsed = null;
    let parseError = null;
    try {
      parsed = JSON.parse(p.AttributeContent);
    } catch (err) {
      parseError = err.message;
    }
    console.log(`\n-- CodAttributeProperty: ${p.CodAttributeProperty} ("${p.DesAttributeProperty}") | IdeAttributeProperty=${p.IdeAttributeProperty}`);
    console.log(`   SModelAttribute: ${p.SModelAttribute.CodModelAttribute}`);
    console.log(`   SAttribute: ${p.SAttribute.CodAttribute} ("${p.SAttribute.DesAttribute}")`);
    console.log(`   SFieldDictionary: ${p.SAttribute.SFieldDictionary?.CodFieldDictionary ?? '(ninguno)'}`);
    if (p.SAttribute.SFieldDictionary) {
      console.log(`   SFieldValue reales de ese diccionario (${p.SAttribute.SFieldDictionary.SFieldValue.length}): ${JSON.stringify(p.SAttribute.SFieldDictionary.SFieldValue.map((v) => ({ IdeFieldValue: v.IdeFieldValue, CodFieldValue: v.CodFieldValue, DesFieldValue: v.DesFieldValue })))}`);
    }
    if (parseError) {
      console.log(`   AttributeContent NO parsea como JSON: ${parseError} -- raw: ${p.AttributeContent}`);
    } else {
      console.log(`   AttributeContent parseado: ${JSON.stringify(parsed)}`);
    }
  }

  console.log('\n########## 5. Ejemplo real de RiskAttributeValue en TQuoteRisk (si hay alguno cargado) ##########');
  const risksWithAttrs = await prisma.tQuoteRisk.findMany({
    where: { RiskAttributeValue: { not: null } },
    take: 5,
  });
  console.log(`Total con RiskAttributeValue no nulo: ${risksWithAttrs.length}`);
  console.log(JSON.stringify(risksWithAttrs.map((r) => ({ IdeQuoteRisk: r.IdeQuoteRisk, RiskAttributeValue: r.RiskAttributeValue })), null, 2));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
