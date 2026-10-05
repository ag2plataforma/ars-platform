/**
 * Modelo + parser/serializador del "constructor visual" de fórmulas de
 * `SCalculationRule` (backlog ítem 8, ver docs/02-roadmap.md) -- la idea
 * es que el admin arme la fórmula eligiendo de desplegables en vez de
 * escribir texto, pero el "formato de cable" hacia el backend sigue
 * siendo exactamente el mismo string que siempre (`FormulaJSON.IF/THEN/ELSE`,
 * ver `FormulaDto`) -- este archivo es puro, sin Angular, y se limita a
 * convertir en los dos sentidos:
 *
 *   texto de fórmula  <-->  modelo estructurado (para los desplegables)
 *
 * Por qué hace falta soportar GRUPOS (paréntesis) y no solo una lista
 * plana de términos: investigando las fórmulas reales ya cargadas en
 * producción (no las de prueba) se confirmó que el patrón más común --
 * las 238 reglas reales de `PrimaTotal` después de la migración de
 * Impacto Social, y las 62 que usan `round`, documentadas en
 * docs/02-roadmap.md -- ya usa paréntesis anidados, ej.
 * `round((<base>) * (1 + adjustment('SOCIAL_IMPACT') / 100), 2)` o
 * `round(rule('Rule13')+(rule('Rule13')*0.02)+(rule('Rule13')*0.05),2)`.
 * Un constructor sin grupos no podría mostrar NINGUNA de esas reglas
 * reales en modo visual -- decisión explícita del usuario (2026-10-02)
 * de pagar el costo de un modelo recursivo para cubrir ese caso real en
 * vez de uno plano que solo serviría para reglas nuevas chiquitas.
 *
 * Alcance deliberadamente MÁS CHICO que la gramática completa del motor
 * real (`formula-expression.ts`): sin unario fuera de un número (`-X` con
 * X no numérico no se soporta), sin `NOT`, y `round(...)` solo se
 * reconoce envolviendo la expresión COMPLETA de THEN/ELSE (nunca
 * anidado en el medio) -- igual que el 100% de los casos reales
 * encontrados. Cualquier fórmula fuera de este subconjunto (incluidas
 * las que YA existen y no entran) cae a "modo avanzado" (el textarea de
 * siempre) en vez de arriesgarse a mostrar o guardar algo distinto de lo
 * que el admin tenía -- `parseThenElse`/`parseIfExpression` validan el
 * resultado re-serializándolo y comparando contra el original antes de
 * darlo por bueno (ver `roundTripMatches`).
 */

export type ChainOperator = '+' | '-' | '*' | '/' | '%' | '^';
export type CompareOperator = '=' | '!=' | '>' | '>=' | '<' | '<=';
export type Joiner = 'AND' | 'OR';
export type TermKind = 'number' | 'field' | 'rule' | 'adjustment' | 'rateTable' | 'group';

export interface RateTableFactor {
  /** `null` => `NULL` (sin comillas) en la fórmula; un string es un
   *  código de campo personalizado, SIEMPRE se serializa entre comillas
   *  simples (ver doc-comment de `RulesEngineService.substituteRateValueReferences`). */
  fieldCode: string | null;
}

export interface Term {
  kind: TermKind;
  /** `kind: 'number'` */
  numberValue?: number;
  /** `kind: 'field' | 'rule' | 'adjustment'` */
  code?: string;
  /** `kind: 'rateTable'` */
  rateTableCode?: string;
  factors?: RateTableFactor[]; // siempre longitud 5
  /** `kind: 'group'` */
  group?: TermChain;
}

export interface TermChain {
  terms: Term[];
  /** longitud === terms.length - 1 */
  operators: ChainOperator[];
}

export interface RoundWrapper {
  enabled: boolean;
  decimals: number;
}

export interface ThenElseModel {
  round: RoundWrapper;
  chain: TermChain;
}

export interface Comparison {
  left: TermChain;
  op: CompareOperator;
  right: TermChain;
}

export interface IfModel {
  mode: 'always' | 'condition';
  comparisons: Comparison[];
  /** longitud === comparisons.length - 1 */
  joiners: Joiner[];
}

/** Opción simplificada para los `<p-select>` del constructor visual --
 *  `code` es lo que se serializa dentro de la fórmula (tal cual, o entre
 *  comillas/dentro de `rule()`/`adjustment()` según el tipo de término),
 *  `label` es "código — descripción" para que se entienda qué es sin
 *  tener que ir a buscarlo a otra pantalla. */
export interface SimpleOption {
  code: string;
  label: string;
}

const FUNCTION_NAMES = ['rule', 'adjustment', 'fgetratevalue'] as const;

export function emptyTerm(): Term {
  return { kind: 'number', numberValue: 0 };
}

export function emptyChain(): TermChain {
  return { terms: [emptyTerm()], operators: [] };
}

export function emptyFactors(): RateTableFactor[] {
  return [{ fieldCode: null }, { fieldCode: null }, { fieldCode: null }, { fieldCode: null }, { fieldCode: null }];
}

export function emptyThenElse(): ThenElseModel {
  return { round: { enabled: false, decimals: 2 }, chain: emptyChain() };
}

export function emptyComparison(): Comparison {
  return { left: emptyChain(), op: '=', right: emptyChain() };
}

export function emptyIf(): IfModel {
  return { mode: 'always', comparisons: [emptyComparison()], joiners: [] };
}

// ---------------------------------------------------------------------------
// Serialización (modelo -> texto)
// ---------------------------------------------------------------------------

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '0';
}

export function serializeTerm(term: Term): string {
  switch (term.kind) {
    case 'number':
      return formatNumber(term.numberValue ?? 0);
    case 'field':
      return term.code ?? '';
    case 'rule':
      return `rule('${term.code ?? ''}')`;
    case 'adjustment':
      return `adjustment('${term.code ?? ''}')`;
    case 'rateTable': {
      const factors = (term.factors ?? emptyFactors()).map((f) => (f.fieldCode ? `'${f.fieldCode}'` : 'NULL'));
      return `FGetRateValue('${term.rateTableCode ?? ''}', ${factors.join(', ')})`;
    }
    case 'group':
      return `(${serializeChain(term.group ?? emptyChain())})`;
  }
}

export function serializeChain(chain: TermChain): string {
  if (chain.terms.length === 0) return '0';
  let out = serializeTerm(chain.terms[0]);
  for (let i = 0; i < chain.operators.length; i++) {
    out += ` ${chain.operators[i]} ${serializeTerm(chain.terms[i + 1])}`;
  }
  return out;
}

export function serializeThenElse(model: ThenElseModel): string {
  const inner = serializeChain(model.chain);
  return model.round.enabled ? `round(${inner}, ${model.round.decimals})` : inner;
}

function serializeComparison(c: Comparison): string {
  return `${serializeChain(c.left)} ${c.op} ${serializeChain(c.right)}`;
}

export function serializeIf(model: IfModel): string {
  if (model.mode === 'always' || model.comparisons.length === 0) return 'TRUE';
  let out = serializeComparison(model.comparisons[0]);
  for (let i = 0; i < model.joiners.length; i++) {
    out += ` ${model.joiners[i]} ${serializeComparison(model.comparisons[i + 1])}`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parsing (texto -> modelo) -- recursive descent de mano, alcance acotado
// (ver doc-comment del archivo). Cualquier desvío tira `ParseError` --
// el llamador SIEMPRE debe volver a serializar el resultado y compararlo
// contra el texto original (`roundTripMatches`) antes de confiar en él.
// ---------------------------------------------------------------------------

export class ParseError extends Error {}

class Cursor {
  pos = 0;
  constructor(public readonly text: string) {}

  get done(): boolean {
    return this.pos >= this.text.length;
  }

  skipWs(): void {
    while (!this.done && /\s/.test(this.text[this.pos])) this.pos++;
  }

  peekChar(): string {
    return this.text[this.pos] ?? '';
  }

  /** Intenta consumir un literal (case-insensitive para palabras) en la posición actual. */
  tryConsume(literal: string): boolean {
    this.skipWs();
    const slice = this.text.slice(this.pos, this.pos + literal.length);
    if (slice.toLowerCase() === literal.toLowerCase()) {
      this.pos += literal.length;
      return true;
    }
    return false;
  }

  expect(literal: string): void {
    if (!this.tryConsume(literal)) {
      throw new ParseError(`Se esperaba "${literal}" en la posición ${this.pos} de "${this.text}"`);
    }
  }
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}
function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function readIdentifier(cur: Cursor): string {
  const start = cur.pos;
  while (!cur.done && isIdentPart(cur.peekChar())) cur.pos++;
  return cur.text.slice(start, cur.pos);
}

function readNumber(cur: Cursor): number {
  const start = cur.pos;
  if (cur.peekChar() === '-' || cur.peekChar() === '+') cur.pos++;
  let sawDigit = false;
  while (!cur.done && /[0-9]/.test(cur.peekChar())) {
    cur.pos++;
    sawDigit = true;
  }
  if (cur.peekChar() === '.') {
    cur.pos++;
    while (!cur.done && /[0-9]/.test(cur.peekChar())) {
      cur.pos++;
      sawDigit = true;
    }
  }
  if (!sawDigit) throw new ParseError(`Número inválido en la posición ${start} de "${cur.text}"`);
  return Number(cur.text.slice(start, cur.pos));
}

function readQuotedString(cur: Cursor): string {
  cur.expect("'");
  const start = cur.pos;
  while (!cur.done && cur.peekChar() !== "'") cur.pos++;
  if (cur.done) throw new ParseError(`Comilla simple sin cerrar en "${cur.text}"`);
  const value = cur.text.slice(start, cur.pos);
  cur.pos++; // comilla de cierre
  return value;
}

function readFactor(cur: Cursor): RateTableFactor {
  cur.skipWs();
  if (cur.tryConsume('NULL')) return { fieldCode: null };
  return { fieldCode: readQuotedString(cur) };
}

/** Un término: número, campo (identificador suelto), `rule('COD')`,
 *  `adjustment('COD')`, `FGetRateValue('TABLA', f1..f5)` o un grupo
 *  `(cadena)`. El signo unario solo se admite pegado a un número --
 *  `-rule('X')` no es soportado (ver doc-comment del archivo). */
function parseTerm(cur: Cursor): Term {
  cur.skipWs();
  if (cur.done) throw new ParseError('Término vacío inesperado');

  const ch = cur.peekChar();

  if (ch === '(') {
    cur.pos++;
    const chain = parseChain(cur);
    cur.skipWs();
    cur.expect(')');
    return { kind: 'group', group: chain };
  }

  if (ch === '-' || ch === '+' || /[0-9]/.test(ch)) {
    return { kind: 'number', numberValue: readNumber(cur) };
  }

  if (isIdentStart(ch)) {
    const savedPos = cur.pos;
    const ident = readIdentifier(cur);
    const lower = ident.toLowerCase();
    cur.skipWs();
    if (cur.peekChar() === '(' && (FUNCTION_NAMES as readonly string[]).includes(lower)) {
      cur.pos++; // '('
      if (lower === 'rule') {
        const code = readQuotedString(cur);
        cur.skipWs();
        cur.expect(')');
        return { kind: 'rule', code };
      }
      if (lower === 'adjustment') {
        const code = readQuotedString(cur);
        cur.skipWs();
        cur.expect(')');
        return { kind: 'adjustment', code };
      }
      // FGetRateValue('TABLA', f1, f2, f3, f4, f5)
      const rateTableCode = readQuotedString(cur);
      const factors: RateTableFactor[] = [];
      for (let i = 0; i < 5; i++) {
        cur.skipWs();
        cur.expect(',');
        factors.push(readFactor(cur));
      }
      cur.skipWs();
      cur.expect(')');
      return { kind: 'rateTable', rateTableCode, factors };
    }
    if (cur.peekChar() === '(') {
      throw new ParseError(`Función no soportada por el constructor visual: "${ident}" en "${cur.text}"`);
    }
    cur.pos = savedPos + ident.length;
    return { kind: 'field', code: ident };
  }

  throw new ParseError(`Carácter inesperado "${ch}" en la posición ${cur.pos} de "${cur.text}"`);
}

const CHAIN_OPERATORS: ChainOperator[] = ['+', '-', '*', '/', '%', '^'];

function parseChain(cur: Cursor): TermChain {
  const terms: Term[] = [parseTerm(cur)];
  const operators: ChainOperator[] = [];
  for (;;) {
    cur.skipWs();
    const ch = cur.peekChar();
    if ((CHAIN_OPERATORS as string[]).includes(ch)) {
      // Un '-'/'+' pegado a un dígito ya lo consume `parseTerm` como
      // signo del número siguiente -- acá solo se llega si hay un
      // operador binario real entre dos términos.
      cur.pos++;
      operators.push(ch as ChainOperator);
      terms.push(parseTerm(cur));
      continue;
    }
    break;
  }
  return { terms, operators };
}

const COMPARE_OPERATORS: CompareOperator[] = ['>=', '<=', '!=', '==' as CompareOperator, '=', '>', '<'];

/** Encuentra el operador de comparación de nivel superior (fuera de
 *  paréntesis y de comillas) en un fragmento que representa UNA
 *  comparación completa (ya separado de los demás por AND/OR). */
function splitComparison(text: string): { left: string; op: CompareOperator; right: string } {
  let depth = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") inQuotes = !inQuotes;
    if (inQuotes) continue;
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth !== 0) continue;
    for (const op of COMPARE_OPERATORS) {
      if (text.slice(i, i + op.length) === op) {
        return { left: text.slice(0, i), op: op === ('==' as CompareOperator) ? '=' : op, right: text.slice(i + op.length) };
      }
    }
  }
  throw new ParseError(`No se encontró un operador de comparación en "${text}"`);
}

/** Separa por AND/OR de nivel superior (fuera de paréntesis/comillas),
 *  devolviendo los fragmentos y los joiners entre ellos. Escanea
 *  carácter a carácter llevando profundidad de paréntesis y si está
 *  dentro de una comilla simple, para no cortar un AND/OR que en
 *  realidad está dentro de un grupo o de un código entre comillas. */
function splitTopLevelAndOr(text: string): { parts: string[]; joiners: Joiner[] } {
  const parts: string[] = [];
  const joiners: Joiner[] = [];
  let depth = 0;
  let inQuotes = false;
  let last = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") inQuotes = !inQuotes;
    if (!inQuotes) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }
    if (depth === 0 && !inQuotes) {
      const matchAnd = /^\s+AND\s+/i.exec(text.slice(i));
      const matchOr = matchAnd ? null : /^\s+OR\s+/i.exec(text.slice(i));
      const match = matchAnd ?? matchOr;
      if (match) {
        parts.push(text.slice(last, i));
        joiners.push(matchAnd ? 'AND' : 'OR');
        i += match[0].length;
        last = i;
        continue;
      }
    }
    i++;
  }
  parts.push(text.slice(last));
  return { parts, joiners };
}

/** Compara ignorando espacios por completo (no solo colapsándolos) --
 *  el espacio nunca es significativo en esta gramática (el tokenizer
 *  real también lo descarta libremente, ver `formula-expression.ts`), así
 *  que una fórmula real sin espacios (`round(rule('X')+1,2)`) y la misma
 *  reformateada por el serializador deben considerarse equivalentes. */
function roundTripMatches(original: string, rebuilt: string): boolean {
  const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  return normalize(original) === normalize(rebuilt);
}

/** Intenta parsear un string de THEN/ELSE a `ThenElseModel`. Devuelve
 *  `null` (nunca tira) si la fórmula no entra en el subconjunto que
 *  soporta el constructor visual -- el llamador debe caer a modo
 *  avanzado en ese caso, no asumir que `null` es un error a mostrar. */
export function parseThenElse(text: string): ThenElseModel | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  try {
    let roundMatch: { inner: string; decimals: number } | null = null;
    if (/^round\s*\(/i.test(trimmed) && trimmed.endsWith(')')) {
      const openIdx = trimmed.indexOf('(');
      const innerAll = trimmed.slice(openIdx + 1, -1);
      // última coma de nivel superior separa la expresión de los decimales
      let depth = 0;
      let inQuotes = false;
      let commaIdx = -1;
      for (let i = 0; i < innerAll.length; i++) {
        const ch = innerAll[i];
        if (ch === "'") inQuotes = !inQuotes;
        if (inQuotes) continue;
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ',' && depth === 0) commaIdx = i;
      }
      if (commaIdx === -1) throw new ParseError('round(...) sin segundo argumento (decimales)');
      const decimalsStr = innerAll.slice(commaIdx + 1).trim();
      if (!/^\d+$/.test(decimalsStr)) throw new ParseError(`Decimales de round(...) inválidos: "${decimalsStr}"`);
      roundMatch = { inner: innerAll.slice(0, commaIdx), decimals: Number(decimalsStr) };
    }

    const chainText = roundMatch ? roundMatch.inner : trimmed;
    const cur = new Cursor(chainText);
    const chain = parseChain(cur);
    cur.skipWs();
    if (!cur.done) throw new ParseError(`Texto sobrante después de la expresión: "${chainText.slice(cur.pos)}"`);

    const model: ThenElseModel = {
      round: roundMatch ? { enabled: true, decimals: roundMatch.decimals } : { enabled: false, decimals: 2 },
      chain,
    };
    if (!roundTripMatches(trimmed, serializeThenElse(model))) return null;
    return model;
  } catch {
    return null;
  }
}

/** Igual que `parseThenElse` pero para el IF: reconoce `TRUE` literal
 *  (modo "Siempre") o una cadena de comparaciones unidas por AND/OR.
 *  También devuelve `null` (nunca tira) para cualquier cosa fuera de
 *  ese subconjunto. */
export function parseIfExpression(text: string): IfModel | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.toUpperCase() === 'TRUE') {
    return { mode: 'always', comparisons: [], joiners: [] };
  }
  try {
    const { parts, joiners } = splitTopLevelAndOr(trimmed);
    const comparisons = parts.map((part) => {
      const { left, op, right } = splitComparison(part);
      const leftCur = new Cursor(left.trim());
      const leftChain = parseChain(leftCur);
      leftCur.skipWs();
      if (!leftCur.done) throw new ParseError(`Texto sobrante en el lado izquierdo: "${left}"`);
      const rightCur = new Cursor(right.trim());
      const rightChain = parseChain(rightCur);
      rightCur.skipWs();
      if (!rightCur.done) throw new ParseError(`Texto sobrante en el lado derecho: "${right}"`);
      return { left: leftChain, op, right: rightChain };
    });
    const model: IfModel = { mode: 'condition', comparisons, joiners };
    if (!roundTripMatches(trimmed, serializeIf(model))) return null;
    return model;
  } catch {
    return null;
  }
}
