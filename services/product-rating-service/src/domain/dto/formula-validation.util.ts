import { evaluateBooleanExpression, evaluateNumericExpression } from '@ars-platform/shared-common';
import { FormulaDto } from './formula.dto';

/**
 * Validación "en seco" de una `FormulaDto` (backlog ítem 8, ver
 * docs/02-roadmap.md): antes de este helper, un error de sintaxis o un
 * código inexistente (`rule('COD')`, `adjustment('COD')`,
 * `FGetRateValue('TABLA',...)`, un campo personalizado mal escrito) recién
 * se notaba al cotizar de verdad, cuando `RulesEngineService` evalúa la
 * regla contra datos reales -- y en el caso puntual de `rule('COD')`/
 * `adjustment('COD')` con un código inexistente, ni siquiera eso: los
 * resolvers devuelven `0` en silencio (ver sus doc-comments), así que el
 * error ni figura en un log, solo se nota con una prima mal calculada.
 *
 * Reutiliza el MISMO tokenizer/parser que el motor real
 * (`evaluateBooleanExpression`/`evaluateNumericExpression` de
 * `formula-expression.ts`, vía `@ars-platform/shared-common`) para
 * detectar errores de sintaxis -- no reimplementa la gramática. Para
 * poder correr ese parser (que solo entiende números/operadores, nunca
 * `rule(...)`/`adjustment(...)`/`FGetRateValue(...)`/un token de campo
 * personalizado -- ver el doc-comment de esa clase) cada referencia
 * dinámica reconocida se reemplaza antes por un placeholder numérico
 * (`1`); lo que importa acá es la EXISTENCIA del código referenciado y la
 * sintaxis alrededor, no el valor real (eso requiere una cotización real
 * en curso, fuera de alcance de un formulario de configuración).
 *
 * No escribe en la base de datos ni conoce Prisma -- recibe los 4
 * catálogos de códigos activos ya resueltos (`CalculationFormulaCodes`)
 * para no acoplar este archivo a ningún ORM, mismo criterio que el resto
 * del motor de reglas en `shared-common`.
 */
export interface CalculationFormulaCodes {
  /** `SFieldDictionary.CodFieldDictionary` de atributos Activos (mismo
   *  universo exacto que `PrismaCalculationRuleRepository.listActiveFieldTokens`). */
  fieldTokens: Set<string>;
  /** `SCalculationRule.CodCalculationRule` de reglas Activas -- `rule('COD')`
   *  no está acotado a la misma cobertura (ver `PrismaRuleValueResolver`). */
  ruleCodes: Set<string>;
  /** `SAdjustment.CodAdjustment` Activos (ver `PrismaAdjustmentValueResolver`). */
  adjustmentCodes: Set<string>;
  /** `SRateTable.CodRateTable` Activas. */
  rateTableCodes: Set<string>;
}

export interface FormulaValidationResult {
  valid: boolean;
  errors: string[];
}

const SQL_KEYWORDS = new Set(['TRUE', 'FALSE', 'AND', 'OR', 'NOT', 'ROUND']);

const RULE_PATTERN = /rule\(\s*'([^']+)'\s*\)/gi;
const ADJUSTMENT_PATTERN = /adjustment\(\s*'([^']+)'\s*\)/gi;
// Mismo patrón que `RulesEngineService.substituteRateValueReferences` --
// tolera el alias de schema + comillas dobles del esquema legado.
const RATE_VALUE_PATTERN = /(?:[A-Za-z_][A-Za-z0-9_]*\.)?"?FGetRateValue"?\(([^()]*)\)/gi;
const IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_]*/g;

export function validateCalculationFormula(
  formula: FormulaDto,
  codes: CalculationFormulaCodes,
): FormulaValidationResult {
  const errors: string[] = [];
  validateExpression('IF', formula.if, codes, errors, 'boolean');
  validateExpression('THEN', formula.then, codes, errors, 'numeric');
  validateExpression('ELSE', formula.else, codes, errors, 'numeric');
  return { valid: errors.length === 0, errors };
}

function validateExpression(
  label: 'IF' | 'THEN' | 'ELSE',
  expr: string,
  codes: CalculationFormulaCodes,
  errors: string[],
  kind: 'boolean' | 'numeric',
): void {
  let working = expr;

  working = working.replace(RULE_PATTERN, (full, code: string) => {
    if (!codes.ruleCodes.has(code)) {
      errors.push(`${label}: no existe (o no está Activa) la regla "${code}" referenciada con rule('${code}')`);
    }
    return '1';
  });

  working = working.replace(ADJUSTMENT_PATTERN, (full, code: string) => {
    if (!codes.adjustmentCodes.has(code)) {
      errors.push(
        `${label}: no existe (o no está Activo) el recargo/descuento "${code}" referenciado con adjustment('${code}')`,
      );
    }
    return '1';
  });

  working = working.replace(RATE_VALUE_PATTERN, (full, rawArgs: string) => {
    const parts = splitTopLevelArgs(rawArgs);
    if (parts.length !== 6) {
      errors.push(
        `${label}: FGetRateValue espera 6 argumentos (tabla, factor1..factor5); se encontraron ${parts.length} en "${full}"`,
      );
      return '1';
    }
    const codRateTableRaw = parts[0];
    const match = /^'([^']*)'$/.exec(codRateTableRaw);
    if (!match) {
      errors.push(
        `${label}: el primer argumento de FGetRateValue debe ser el código de la tabla entre comillas simples (se recibió "${codRateTableRaw}")`,
      );
    } else if (!codes.rateTableCodes.has(match[1])) {
      errors.push(`${label}: no existe (o no está Activa) la tabla de tarifa "${match[1]}" referenciada en FGetRateValue`);
    }
    return '1';
  });

  const reportedUnknown = new Set<string>();
  working = working.replace(IDENTIFIER_PATTERN, (word: string) => {
    const upper = word.toUpperCase();
    if (SQL_KEYWORDS.has(upper)) return word;
    if (!codes.fieldTokens.has(word)) {
      if (!reportedUnknown.has(word)) {
        reportedUnknown.add(word);
        errors.push(`${label}: no se reconoce "${word}" (¿un campo personalizado inexistente o inactivo?)`);
      }
    }
    return '1';
  });

  try {
    if (kind === 'boolean') {
      evaluateBooleanExpression(working);
    } else {
      evaluateNumericExpression(working);
    }
  } catch (err) {
    errors.push(`${label}: error de sintaxis -- ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Copia textual de la misma utilidad privada en
 *  `RulesEngineService.substituteRateValueReferences` (shared-common) --
 *  no exportada desde ahí, y duplicarla acá es más simple que
 *  exportarla solo para este caso de uso de validación. */
function splitTopLevelArgs(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of text) {
    if (ch === "'") inQuotes = !inQuotes;
    if (ch === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts;
}
