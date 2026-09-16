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

  console.log(failures === 0 ? '\nTodo OK.' : `\n${failures} verificación(es) fallaron.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fallo la verificación:', err);
  process.exit(1);
});
