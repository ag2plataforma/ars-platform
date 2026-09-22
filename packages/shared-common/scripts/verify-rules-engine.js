#!/usr/bin/env node
/**
 * Verificación rápida (sin base de datos) del motor de reglas de cálculo:
 * confirma que el evaluador de expresiones seguro y la cadena de reglas
 * (RulesEngineService.evaluateChain) se comportan igual que
 * FQuoteCoverageConcept/FGetValueAttribute/FGetValueRule para los casos
 * documentados en docs/01-especificacion-motor-negocio-actual.md, §3.
 *
 * No requiere Postgres: usa implementaciones en memoria de los tres
 * puertos (CalculationRuleRepository/AttributeValueResolver/
 * RuleValueResolver). La validación contra datos reales de
 * SCalculationRule llegará en Fase 2, cuando exista configuración real y
 * un servicio consumidor (product-rating-service).
 *
 * Uso: npm run build:libs && node packages/shared-common/scripts/verify-rules-engine.js
 */

const path = require('path');
const {
  RulesEngineService,
  evaluateBooleanExpression,
  evaluateNumericExpression,
} = require(path.join(__dirname, '..', 'dist', 'index.js'));

let failures = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} => ${actual} (esperado ${expected})`);
  if (!ok) failures++;
}

// 1. Evaluador de expresiones puro — casos de docs/01-...md §3.2/§3.4.
console.log('\n-- Evaluador de expresiones --');
check('TRUE literal', evaluateBooleanExpression('TRUE'), true);
check('comparación simple (100 > 50)', evaluateBooleanExpression('100 > 50'), true);
check('comparación estilo SQL (100 = 100)', evaluateBooleanExpression('100 = 100'), true);
check('aritmética (100 * 0.05)', evaluateNumericExpression('100 * 0.05'), 5);
check('precedencia con paréntesis ((100+50)*2)', evaluateNumericExpression('(100 + 50) * 2'), 300);
check('booleanos compuestos (18>=18 AND 18<=65)', evaluateBooleanExpression('18 >= 18 AND 18 <= 65'), true);

// 1.1. round(x, decimales) -- agregado tras un bug real reportado por el
//      usuario al cotizar: 62 filas reales de SCalculationRule.FormulaJSON
//      usan round(<expr>, 2) (ver docs/02-roadmap.md), función SQL
//      estándar de Postgres que el evaluador todavía no soportaba.
//      round(numeric, integer) de Postgres redondea "half away from zero"
//      (0.5 se aleja de cero), DISTINTO de Math.round nativo de JS para
//      negativos -- estos casos verifican esa semántica exacta, incluidos
//      los clásicos artefactos de punto flotante (1.005 * 100 no da
//      100.5 en JS de por sí).
console.log('\n-- round(x, decimales) --');
check('round con la forma real de las 62 fórmulas migradas (300+300*0.02+300*0.05 -> 321)',
  evaluateNumericExpression('round(300+(300*0.02)+(300*0.05),2)'), 321);
check('round(2.5, 0) => 3 (half away from zero, no half-to-even)', evaluateNumericExpression('round(2.5,0)'), 3);
check('round(-2.5, 0) => -3 (away de cero para negativos, distinto de Math.round)', evaluateNumericExpression('round(-2.5,0)'), -3);
check('round(2.5) sin segundo argumento => 3 (default 0 decimales)', evaluateNumericExpression('round(2.5)'), 3);
check('round(1.005, 2) => 1.01 (corrige el artefacto de punto flotante de JS)', evaluateNumericExpression('round(1.005,2)'), 1.01);
check('round(-1.005, 2) => -1.01', evaluateNumericExpression('round(-1.005,2)'), -1.01);

// 2. Cadena de reglas completa (PrimaNeta -> Impuesto -> PrimaTotal),
//    simulando SCalculationRule + custom field EDAD, sin BD.
console.log('\n-- Cadena de reglas (evaluateChain) --');
const fieldTokens = [{ codFieldDictionary: 'EDAD', ideAttribute: 'attr-edad' }];
const rules = [
  {
    ideCalculationRule: 'r3', codCalculationRule: 'PRIMATOTAL', order: 3,
    ideConcept: 'concept-total', desColumnName: 'Prime',
    formula: { if: 'TRUE', then: "rule('PRIMANETA') + rule('IMPUESTO')", else: '0' },
  },
  {
    ideCalculationRule: 'r1', codCalculationRule: 'PRIMANETA', order: 1,
    ideConcept: 'concept-neta', desColumnName: null,
    formula: { if: 'TRUE', then: 'EDAD * 10', else: '0' },
  },
  {
    ideCalculationRule: 'r2', codCalculationRule: 'IMPUESTO', order: 2,
    ideConcept: 'concept-impuesto', desColumnName: null,
    formula: { if: 'TRUE', then: "rule('PRIMANETA') * 0.16", else: '0' },
  },
];

const ruleRepository = {
  async findApplicableRules() { return rules; },
  async listActiveFieldTokens() { return fieldTokens; },
};
const ruleValueResolver = {
  async resolveRuleValue() { return 0; }, // no debería usarse: todo está en la misma cadena
};
const attributeResolver = {
  async resolveAttributeValue() { return '30'; }, // EDAD = 30
};
// Tabla en memoria: TARIFA_EDAD, factor1='30' -> 7.5 (sin BD real).
const rateValueResolver = {
  async resolveRateValue(codRateTable, factor1, factor2, factor3, factor4, factor5) {
    if (codRateTable === 'TARIFA_EDAD' && factor1 === '30' && factor2 === undefined) {
      return 7.5;
    }
    throw new Error(`sin dato de prueba para FGetRateValue(${codRateTable}, ${factor1})`);
  },
};

async function main() {
  const service = new RulesEngineService(ruleRepository, attributeResolver, ruleValueResolver, rateValueResolver);
  const context = { origin: 'Quote', ideOriginRisk: 'risk-1', ideCoverageOrMovement: 'coverage-1' };
  const results = await service.evaluateChain(rules, context);
  const byCode = Object.fromEntries(results.map((r) => [r.codCalculationRule, r]));

  check('orden de evaluación respeta Order', results[0].codCalculationRule, 'PRIMANETA');
  check('PRIMANETA = EDAD(30) * 10', byCode.PRIMANETA.value, 300);
  check('IMPUESTO = rule(PRIMANETA) * 0.16', byCode.IMPUESTO.value, 48);
  check('PRIMATOTAL = rule(PRIMANETA) + rule(IMPUESTO)', byCode.PRIMATOTAL.value, 348);
  check('PRIMATOTAL.columnName = Prime (sobreescribe columna)', byCode.PRIMATOTAL.columnName, 'Prime');
  check('PRIMANETA.columnName = null (inserta concepto nuevo)', byCode.PRIMANETA.columnName, null);

  // 3. FGetRateValue(...) invocado desde dentro de una fórmula, con el
  //    custom field EDAD como argumento (sustituido antes de resolverse).
  console.log('\n-- FGetRateValue dentro de una fórmula --');
  const rateRule = {
    ideCalculationRule: 'r4', codCalculationRule: 'RECARGOEDAD', order: 4,
    ideConcept: 'concept-recargo', desColumnName: null,
    formula: { if: 'TRUE', then: "FGetRateValue('TARIFA_EDAD', 'EDAD', NULL, NULL, NULL, NULL)", else: '0' },
  };
  const rateServiceForThis = new RulesEngineService(
    { async findApplicableRules() { return [rateRule]; }, async listActiveFieldTokens() { return fieldTokens; } },
    attributeResolver,
    ruleValueResolver,
    rateValueResolver,
  );
  const rateResults = await rateServiceForThis.evaluateChain([rateRule], context);
  check('RECARGOEDAD = FGetRateValue(TARIFA_EDAD, EDAD=30) => 7.5', rateResults[0].value, 7.5);

  // 3.1. Misma FGetRateValue pero con la sintaxis legacy migrada tal
  //      cual la pega el usuario desde el esquema anterior
  //      (entity."FGetRateValue"(...), con NULL en minúsculas) --
  //      confirma que substituteRateValueReferences tolera el prefijo
  //      de esquema y las comillas dobles sin cambiar el resultado.
  const legacyRateRule = {
    ideCalculationRule: 'r5', codCalculationRule: 'RECARGOEDAD_LEGACY', order: 5,
    ideConcept: 'concept-recargo-legacy', desColumnName: null,
    formula: { if: 'TRUE', then: "68+(68*entity.\"FGetRateValue\"('TARIFA_EDAD','EDAD',null,null,null,null))", else: '0' },
  };
  const legacyRateService = new RulesEngineService(
    { async findApplicableRules() { return [legacyRateRule]; }, async listActiveFieldTokens() { return fieldTokens; } },
    attributeResolver,
    ruleValueResolver,
    rateValueResolver,
  );
  const legacyRateResults = await legacyRateService.evaluateChain([legacyRateRule], context);
  check('RECARGOEDAD_LEGACY = 68+(68*entity."FGetRateValue"(...)) => 68+68*7.5 = 578', legacyRateResults[0].value, 578);

  // 3.2. round(...) combinado con rule('COD') dentro de la misma cadena,
  //      con la forma EXACTA de las 62 fórmulas reales migradas (ver
  //      docs/02-roadmap.md): round(rule('X')+(rule('X')*0.02)+(rule('X')*0.05),2).
  //      Confirma que substituteRuleReferences (que corre ANTES del
  //      evaluador) deja el round(...) intacto para que formula-expression.ts
  //      lo evalúe, y que el resultado combinado es el correcto.
  console.log("\n-- round(rule('COD')...) dentro de una cadena real --");
  const roundChainRules = [
    {
      ideCalculationRule: 'r6', codCalculationRule: 'PRIMANETA2', order: 1,
      ideConcept: 'concept-neta-2', desColumnName: null,
      formula: { if: 'TRUE', then: '300', else: '0' },
    },
    {
      ideCalculationRule: 'r7', codCalculationRule: 'COMISION', order: 2,
      ideConcept: 'concept-comision', desColumnName: null,
      formula: { if: 'TRUE', then: "round(rule('PRIMANETA2')+(rule('PRIMANETA2')*0.02)+(rule('PRIMANETA2')*0.05),2)", else: '0' },
    },
  ];
  const roundChainService = new RulesEngineService(
    { async findApplicableRules() { return roundChainRules; }, async listActiveFieldTokens() { return []; } },
    attributeResolver,
    ruleValueResolver,
    rateValueResolver,
  );
  const roundChainResults = await roundChainService.evaluateChain(roundChainRules, context);
  const byCodeRound = Object.fromEntries(roundChainResults.map((r) => [r.codCalculationRule, r]));
  check("COMISION = round(rule(PRIMANETA2)+2%+5%,2) => round(300+6+15,2) = 321", byCodeRound.COMISION.value, 321);

  console.log(failures === 0 ? '\nTodo OK.' : `\n${failures} verificación(es) fallaron.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fallo la verificación:', err);
  process.exit(1);
});
