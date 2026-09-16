import { Inject, Injectable } from '@nestjs/common';
import {
  ATTRIBUTE_VALUE_RESOLVER,
  AttributeValueResolver,
  CalculationRule,
  CalculationRuleHierarchy,
  CALCULATION_RULE_REPOSITORY,
  CalculationRuleRepository,
  FieldToken,
  RateValueResolver,
  RuleOrigin,
  RULE_VALUE_RESOLVER,
  RuleValueResolver,
  RATE_VALUE_RESOLVER,
} from './calculation-rule.interface';
import { evaluateBooleanExpression, evaluateNumericExpression } from './formula-expression';

/** Contexto de evaluación para una cobertura (cotización) o movimiento de
 *  cobertura (póliza) concretos — equivalente a los parámetros que
 *  `FQuoteCoverageConcept`/`FMovementConcept` reciben junto con el riesgo. */
export interface EvaluationContext {
  origin: RuleOrigin;
  /** `TQuoteRisk.IdeQuoteRisk` (Quote) o `TFileRisk.IdeFileRisk` (Contract)
   *  — el riesgo cuyo custom field se consulta en `FGetValueAttribute`. */
  ideOriginRisk: string;
  /** `TQuoteCoverage.IdeQuoteCoverage` (Quote) o
   *  `TCoverageMovement.IdeCoverageMovement` (Contract) — la cobertura
   *  sobre la que se aplican las reglas y se resuelven referencias
   *  `rule(...)`. */
  ideCoverageOrMovement: string;
}

export interface EvaluationResult {
  codCalculationRule: string;
  ideConcept: string;
  value: number;
  /** Si viene informado, el llamador debe actualizar esa columna en vez de
   *  insertar un concepto nuevo — ver `CalculationRule.desColumnName`. */
  columnName: string | null;
}

/**
 * Motor de reglas de cálculo — equivalente en TypeScript a
 * `FQuoteCoverageConcept`/`FMovementConcept` (ver
 * docs/01-especificacion-motor-negocio-actual.md, §3), con el `EXECUTE` de
 * SQL dinámico reemplazado por un evaluador de expresiones propio, sin
 * `eval` ni SQL dinámico (ver `./formula-expression.ts`).
 *
 * No escribe en la base de datos: solo calcula. Aplicar el resultado
 * (actualizar la columna de `TQuoteCoverage`/`TCoverageMovement` o insertar
 * el concepto nuevo) es responsabilidad del servicio que orquesta la
 * cotización/contrato (Fase 2, `product-rating-service`/
 * `underwriting-service`) — así el motor queda puro y fácil de testear,
 * como recomienda la especificación (§3.4).
 */
@Injectable()
export class RulesEngineService {
  constructor(
    @Inject(CALCULATION_RULE_REPOSITORY)
    private readonly ruleRepository: CalculationRuleRepository,
    @Inject(ATTRIBUTE_VALUE_RESOLVER)
    private readonly attributeResolver: AttributeValueResolver,
    @Inject(RULE_VALUE_RESOLVER)
    private readonly ruleValueResolver: RuleValueResolver,
    @Inject(RATE_VALUE_RESOLVER)
    private readonly rateValueResolver: RateValueResolver,
  ) {}

  /** Reglas aplicables a una cobertura por la jerarquía Producto >
   *  PlanProductRisk > CoveragePlan, ya ordenadas por `Order`. */
  async getApplicableRules(hierarchy: CalculationRuleHierarchy): Promise<CalculationRule[]> {
    return this.ruleRepository.findApplicableRules(hierarchy);
  }

  /**
   * Evalúa la cadena de reglas para una cobertura, respetando `Order`
   * (una regla puede referenciar el resultado de otra anterior con
   * `rule('COD')`, por eso el orden de evaluación importa tanto como el
   * de la consulta).
   */
  async evaluateChain(
    rules: CalculationRule[],
    context: EvaluationContext,
  ): Promise<EvaluationResult[]> {
    const fieldTokens = await this.ruleRepository.listActiveFieldTokens();
    const ordered = [...rules].sort((a, b) => a.order - b.order);

    // El original (`FQuoteCoverageConcept`) escribe el resultado de cada
    // regla en la BD (UPDATE/INSERT) dentro de la MISMA iteración del
    // cursor, antes de pasar a la siguiente — así, cuando una regla
    // posterior referencia `rule('COD')` de una regla anterior de la
    // misma cadena, `FGetValueRule` ya la ve (misma transacción). Este
    // motor deliberadamente NO escribe en la BD (queda puro y testeable,
    // ver comentario de la clase) — así que para no perder ese
    // comportamiento, las reglas ya evaluadas en esta misma llamada se
    // guardan en memoria y se consultan primero; solo si `rule('COD')`
    // referencia algo fuera de esta cadena (otra cobertura, u otra
    // corrida ya persistida) se cae al `RuleValueResolver` (BD).
    const computedInThisChain = new Map<string, number>();

    const results: EvaluationResult[] = [];
    for (const rule of ordered) {
      const value = await this.evaluateRule(rule, context, fieldTokens, computedInThisChain);
      computedInThisChain.set(rule.codCalculationRule, value);
      results.push({
        codCalculationRule: rule.codCalculationRule,
        ideConcept: rule.ideConcept,
        value,
        columnName: rule.desColumnName,
      });
    }
    return results;
  }

  private async evaluateRule(
    rule: CalculationRule,
    context: EvaluationContext,
    fieldTokens: FieldToken[],
    computedInThisChain: Map<string, number>,
  ): Promise<number> {
    // Paso 1: sustituir tokens de custom fields (FGetValueAttribute).
    // Paso 2: sustituir referencias rule('COD') a reglas anteriores
    //         (FGetValueRule). Mismo orden que el original.
    const [ifExpr, thenExpr, elseExpr] = await Promise.all([
      this.resolveExpression(rule.formula.if, context, fieldTokens, computedInThisChain),
      this.resolveExpression(rule.formula.then, context, fieldTokens, computedInThisChain),
      this.resolveExpression(rule.formula.else, context, fieldTokens, computedInThisChain),
    ]);

    // Paso 3: evaluar. Si el IF es literalmente "TRUE" no se evalúa nada
    // (igual que el original), si no se evalúa como expresión booleana.
    const condition = evaluateBooleanExpression(ifExpr);
    const resultExpr = condition ? thenExpr : elseExpr;
    return evaluateNumericExpression(resultExpr);
  }

  private async resolveExpression(
    expr: string,
    context: EvaluationContext,
    fieldTokens: FieldToken[],
    computedInThisChain: Map<string, number>,
  ): Promise<string> {
    let result = expr;
    result = await this.substituteFieldTokens(result, fieldTokens, context);
    result = await this.substituteRateValueReferences(result);
    result = await this.substituteRuleReferences(result, context, computedInThisChain);
    return result;
  }

  private async substituteFieldTokens(
    expr: string,
    fieldTokens: FieldToken[],
    context: EvaluationContext,
  ): Promise<string> {
    let result = expr;
    for (const token of fieldTokens) {
      const boundaryPattern = wordBoundaryPattern(token.codFieldDictionary);
      if (new RegExp(boundaryPattern).test(result)) {
        const value = await this.attributeResolver.resolveAttributeValue(
          context.origin,
          context.ideOriginRisk,
          token.ideAttribute,
        );
        result = result.replace(new RegExp(boundaryPattern, 'g'), value);
      }
    }
    return result;
  }

  private async substituteRuleReferences(
    expr: string,
    context: EvaluationContext,
    computedInThisChain: Map<string, number>,
  ): Promise<string> {
    const pattern = /rule\(\s*'([^']+)'\s*\)/gi;
    let result = expr;
    const matches = [...expr.matchAll(pattern)];
    for (const match of matches) {
      const codCalculationRule = match[1];
      const value = computedInThisChain.has(codCalculationRule)
        ? (computedInThisChain.get(codCalculationRule) as number)
        : await this.ruleValueResolver.resolveRuleValue(
            context.origin,
            context.ideCoverageOrMovement,
            codCalculationRule,
          );
      result = result.replace(match[0], String(value));
    }
    return result;
  }

  /**
   * Sustituye llamadas `FGetRateValue('CODRATETABLE','F1','F2',NULL,NULL,NULL)`
   * dentro de la expresión por el valor numérico resultante — equivalente
   * a cómo el original invocaba la función PL/pgSQL homónima directamente
   * en el `EXECUTE` de SQL dinámico.
   *
   * Convención de llamada (misma firma posicional que el original, 6
   * argumentos siempre): cada argumento es un texto entre comillas simples
   * (puede contener un token de custom field, ya sustituido por
   * `substituteFieldTokens` antes de llegar acá — por eso este paso corre
   * DESPUÉS de esa sustitución) o la palabra `NULL` (sin comillas) para
   * omitir esa dimensión, igual que se escribiría en SQL. `codRateTable` y
   * `factor1` no admiten `NULL` (ver `RateValueResolver`).
   *
   * OJO al configurar una fórmula: un custom field usado como argumento
   * SIEMPRE debe ir entre comillas (ej. `FGetRateValue('TARIFA_EDAD',
   * 'EDAD', NULL, NULL, NULL, NULL)`), igual que un literal — la
   * sustitución de `substituteFieldTokens` reemplaza el identificador tal
   * cual esté escrito, comillas incluidas alrededor si las tiene, así que
   * sin comillas el resultado queda como un número/palabra suelta y este
   * método lo rechaza con un error claro en vez de fallar en silencio.
   */
  private async substituteRateValueReferences(expr: string): Promise<string> {
    const pattern = /FGetRateValue\(([^()]*)\)/gi;
    let result = expr;
    const matches = [...expr.matchAll(pattern)];
    for (const match of matches) {
      const rawArgs = splitTopLevelArgs(match[1]);
      if (rawArgs.length !== 6) {
        throw new Error(
          `FGetRateValue espera 6 argumentos (codRateTable, factor1..factor5); ` +
            `se recibieron ${rawArgs.length} en "${match[0]}"`,
        );
      }
      const [codRateTable, factor1, factor2, factor3, factor4, factor5] = rawArgs.map(parseSqlArg);
      if (codRateTable === undefined || factor1 === undefined) {
        throw new Error(
          `FGetRateValue: "codRateTable" y "factor1" son obligatorios (no admiten NULL) en "${match[0]}"`,
        );
      }
      const value = await this.rateValueResolver.resolveRateValue(
        codRateTable,
        factor1,
        factor2,
        factor3,
        factor4,
        factor5,
      );
      result = result.replace(match[0], String(value));
    }
    return result;
  }
}

/** Separa los argumentos de una llamada tipo FGetRateValue(...) por comas
 *  que no estén dentro de comillas simples (los argumentos son siempre
 *  literales simples, sin funciones anidadas, así que no hace falta un
 *  parser más elaborado que esto). */
function splitTopLevelArgs(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of text) {
    if (ch === "'") inQuotes = !inQuotes;
    if (ch === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim());
}

/** `NULL` (sin comillas, igual que en SQL) => `undefined`; `'texto'` =>
 *  `texto`; cualquier otra cosa es un argumento inválido. */
function parseSqlArg(raw: string): string | undefined {
  if (/^null$/i.test(raw)) return undefined;
  const match = /^'([^']*)'$/.exec(raw);
  if (!match) {
    throw new Error(
      `Argumento inválido para FGetRateValue: "${raw}" (se espera NULL o un texto entre comillas simples)`,
    );
  }
  return match[1];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordBoundaryPattern(token: string): string {
  // Sustitución "por límite de palabra" en vez del strpos/substring del
  // original — evita que un token corto (p. ej. "EDAD") reemplace parte
  // de otro más largo (p. ej. "EDAD_MAXIMA"). Mejora de seguridad sobre
  // el original, documentada en docs/01-especificacion-motor-negocio-actual.md §6.
  return `(?<![A-Za-z0-9_])${escapeRegExp(token)}(?![A-Za-z0-9_])`;
}
