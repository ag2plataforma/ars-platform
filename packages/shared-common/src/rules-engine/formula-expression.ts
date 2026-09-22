/**
 * Evaluador de expresiones aritméticas/booleanas, seguro (sin `eval` ni
 * `new Function`, sin SQL dinámico) para el motor de reglas de cálculo.
 *
 * Reemplaza el `EXECUTE` de SQL dinámico de `FQuoteCoverageConcept` /
 * `FMovementConcept` (ver docs/01-especificacion-motor-negocio-actual.md,
 * §3.4): las fórmulas originales son fragmentos de expresión SQL en texto
 * plano (ej. `TRUE`, `100 > 50`, `100 * 0.05`), después de que
 * `RulesEngineService` ya sustituyó los custom fields y las referencias
 * `rule('COD')` por sus valores. Para cuando llegan acá solo quedan
 * números, operadores aritméticos/de comparación, paréntesis,
 * opcionalmente `TRUE`/`FALSE`/`AND`/`OR`/`NOT`, y opcionalmente `round(...)`
 * (ver más abajo) -- `FGetRateValue(...)` en cambio se resuelve ANTES, en
 * `RulesEngineService.substituteRateValueReferences`, así que nunca llega
 * hasta acá.
 *
 * Implementación: tokenizer + parser recursivo-descendente -> AST ->
 * evaluación del AST. Nada de código se ejecuta como JS/SQL: cada
 * carácter de la fórmula pasa por un tokenizer cerrado (solo reconoce
 * números, los operadores de esta lista, `round`/`,` y las cinco palabras
 * clave) antes de construirse el árbol, así que no hay superficie de
 * inyección.
 *
 * Soporta también `=` (estilo SQL, como en los datos originales) además
 * de `==`, y `<>` además de `!=`.
 *
 * `round(x)` / `round(x, decimales)`: confirmado contra 62 filas reales de
 * `SCalculationRule.FormulaJSON` (todas con la forma
 * `round(<expresión con rule(...)>, 2)`, ver docs/02-roadmap.md) que la
 * fórmula original usa la función SQL estándar `ROUND` de Postgres, no
 * una función de negocio propia -- por eso no hizo falta confirmar nada
 * contra código PL/pgSQL propio, solo replicar el `ROUND(numeric,
 * integer)` real de Postgres: redondeo "half away from zero" (0.5 se
 * redondea siempre alejándose de cero, ej. 2.5->3 y -2.5->-3), DISTINTO
 * del "banker's rounding"/half-to-even que usan otros motores, y también
 * distinto de `Math.round` de JS para negativos (`Math.round(-2.5)` da
 * -2, no -3). El segundo argumento (decimales) es opcional -- si se omite
 * se redondea a entero, igual que el `ROUND(numeric)` de un solo
 * argumento de Postgres -- aunque las 62 fórmulas reales encontradas
 * siempre lo pasan explícito (`, 2`).
 */

type Token =
  | { type: 'NUMBER'; value: string }
  | { type: 'COMPOP'; value: '=' | '!=' | '>' | '>=' | '<' | '<=' }
  | { type: 'TRUE' | 'FALSE' | 'AND' | 'OR' | 'NOT' | 'ROUND' }
  | { type: '+' | '-' | '*' | '/' | '%' | '^' | '(' | ')' | ',' }
  | { type: 'EOF' };

type AstNode =
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'unary'; op: '+' | '-'; operand: AstNode }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '%' | '^'; left: AstNode; right: AstNode }
  | { kind: 'compare'; op: '=' | '!=' | '>' | '>=' | '<' | '<='; left: AstNode; right: AstNode }
  | { kind: 'and' | 'or'; left: AstNode; right: AstNode }
  | { kind: 'not'; operand: AstNode }
  | { kind: 'round'; value: AstNode; decimals: AstNode | null };

const KEYWORDS = new Set(['TRUE', 'FALSE', 'AND', 'OR', 'NOT']);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < n && /[0-9]/.test(source[j])) j++;
      if (source[j] === '.') {
        j++;
        while (j < n && /[0-9]/.test(source[j])) j++;
      }
      tokens.push({ type: 'NUMBER', value: source.slice(i, j) });
      i = j;
      continue;
    }

    if (/[A-Za-z]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(source[j])) j++;
      const word = source.slice(i, j).toUpperCase();
      if (word === 'ROUND') {
        tokens.push({ type: 'ROUND' });
        i = j;
        continue;
      }
      if (!KEYWORDS.has(word)) {
        throw new Error(
          `Expresión de regla no soportada: identificador "${source.slice(i, j)}" sin resolver ` +
            '(¿un custom field o rule() que no se sustituyó antes de evaluar?)',
        );
      }
      tokens.push({ type: word as 'TRUE' | 'FALSE' | 'AND' | 'OR' | 'NOT' });
      i = j;
      continue;
    }

    const two = source.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>' || two === '!=' || two === '==') {
      tokens.push({ type: 'COMPOP', value: two === '==' ? '=' : two === '<>' ? '!=' : (two as '<=' | '>=') });
      i += 2;
      continue;
    }

    if (ch === '=' || ch === '<' || ch === '>') {
      tokens.push({ type: 'COMPOP', value: ch as '=' | '<' | '>' });
      i += 1;
      continue;
    }

    if ('+-*/%^(),'.includes(ch)) {
      tokens.push({ type: ch as '+' | '-' | '*' | '/' | '%' | '^' | '(' | ')' | ',' });
      i += 1;
      continue;
    }

    throw new Error(`Expresión de regla no soportada: carácter "${ch}" no reconocido`);
  }

  tokens.push({ type: 'EOF' });
  return tokens;
}

function parse(tokens: Token[]): AstNode {
  let pos = 0;
  const peek = () => tokens[pos];
  const advance = () => tokens[pos++];
  const expect = (type: Token['type']) => {
    if (peek().type !== type) {
      throw new Error(`Expresión de regla inválida: se esperaba "${type}" y se encontró "${peek().type}"`);
    }
    return advance();
  };

  function parseOr(): AstNode {
    let node = parseAnd();
    while (peek().type === 'OR') {
      advance();
      node = { kind: 'or', left: node, right: parseAnd() };
    }
    return node;
  }
  function parseAnd(): AstNode {
    let node = parseNot();
    while (peek().type === 'AND') {
      advance();
      node = { kind: 'and', left: node, right: parseNot() };
    }
    return node;
  }
  function parseNot(): AstNode {
    if (peek().type === 'NOT') {
      advance();
      return { kind: 'not', operand: parseNot() };
    }
    return parseComparison();
  }
  function parseComparison(): AstNode {
    const left = parseAdditive();
    const token = peek();
    if (token.type === 'COMPOP') {
      advance();
      const right = parseAdditive();
      return { kind: 'compare', op: token.value, left, right };
    }
    return left;
  }
  function parseAdditive(): AstNode {
    let node = parseMultiplicative();
    while (peek().type === '+' || peek().type === '-') {
      const op = advance().type as '+' | '-';
      node = { kind: 'binary', op, left: node, right: parseMultiplicative() };
    }
    return node;
  }
  function parseMultiplicative(): AstNode {
    let node = parseUnary();
    while (peek().type === '*' || peek().type === '/' || peek().type === '%') {
      const op = advance().type as '*' | '/' | '%';
      node = { kind: 'binary', op, left: node, right: parseUnary() };
    }
    return node;
  }
  function parseUnary(): AstNode {
    if (peek().type === '-' || peek().type === '+') {
      const op = advance().type as '+' | '-';
      return { kind: 'unary', op, operand: parseUnary() };
    }
    return parsePower();
  }
  function parsePower(): AstNode {
    const base = parsePrimary();
    if (peek().type === '^') {
      advance();
      const exponent = parseUnary(); // asociativo a la derecha
      return { kind: 'binary', op: '^', left: base, right: exponent };
    }
    return base;
  }
  function parsePrimary(): AstNode {
    const token = peek();
    if (token.type === 'NUMBER') {
      advance();
      return { kind: 'number', value: Number(token.value) };
    }
    if (token.type === 'TRUE') {
      advance();
      return { kind: 'boolean', value: true };
    }
    if (token.type === 'FALSE') {
      advance();
      return { kind: 'boolean', value: false };
    }
    if (token.type === 'ROUND') {
      advance();
      expect('(');
      const value = parseOr();
      let decimals: AstNode | null = null;
      if (peek().type === ',') {
        advance();
        decimals = parseOr();
      }
      expect(')');
      return { kind: 'round', value, decimals };
    }
    if (token.type === '(') {
      advance();
      const node = parseOr();
      expect(')');
      return node;
    }
    throw new Error(`Expresión de regla inválida: token inesperado "${token.type}"`);
  }

  const result = parseOr();
  expect('EOF');
  return result;
}

function evaluateAst(node: AstNode): number | boolean {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'boolean':
      return node.value;
    case 'unary': {
      const value = asNumber(evaluateAst(node.operand));
      return node.op === '-' ? -value : value;
    }
    case 'binary': {
      const left = asNumber(evaluateAst(node.left));
      const right = asNumber(evaluateAst(node.right));
      switch (node.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return left / right;
        case '%':
          return left % right;
        case '^':
          return Math.pow(left, right);
      }
      break;
    }
    case 'compare': {
      const left = asNumber(evaluateAst(node.left));
      const right = asNumber(evaluateAst(node.right));
      switch (node.op) {
        case '=':
          return left === right;
        case '!=':
          return left !== right;
        case '>':
          return left > right;
        case '>=':
          return left >= right;
        case '<':
          return left < right;
        case '<=':
          return left <= right;
      }
      break;
    }
    case 'and':
      return Boolean(evaluateAst(node.left)) && Boolean(evaluateAst(node.right));
    case 'or':
      return Boolean(evaluateAst(node.left)) || Boolean(evaluateAst(node.right));
    case 'not':
      return !evaluateAst(node.operand);
    case 'round': {
      const value = asNumber(evaluateAst(node.value));
      const decimals = node.decimals === null ? 0 : Math.trunc(asNumber(evaluateAst(node.decimals)));
      return roundHalfAwayFromZero(value, decimals);
    }
  }
  throw new Error('Expresión de regla inválida: nodo no soportado');
}

function asNumber(value: number | boolean): number {
  return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

/**
 * Redondeo "half away from zero" (2.5 -> 3, -2.5 -> -3), igual que
 * `ROUND(numeric, integer)` de Postgres -- DISTINTO de `Math.round` nativo
 * de JS para negativos (`Math.round(-2.5)` da -2, no -3) y del
 * "banker's rounding" (half-to-even). El `toPrecision(15)` antes de
 * `Math.round` corrige artefactos de punto flotante conocidos (ej.
 * `1.005 * 100` da `100.49999999999999` en JS, no `100.5`, lo que sin
 * esta corrección redondearía mal para abajo).
 */
function roundHalfAwayFromZero(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  const sign = value < 0 ? -1 : 1;
  const shifted = Number((Math.abs(value) * factor).toPrecision(15));
  return (sign * Math.round(shifted)) / factor;
}

function evaluate(source: string): number | boolean {
  return evaluateAst(parse(tokenize(source)));
}

/**
 * Evalúa el `IF` de una regla. Igual que el original: si el texto es
 * literalmente `TRUE` (sin importar mayúsculas) no pasa por el parser en
 * absoluto, se toma como verdadero directamente.
 */
export function evaluateBooleanExpression(source: string): boolean {
  const trimmed = source.trim();
  if (trimmed.toUpperCase() === 'TRUE') return true;
  if (trimmed.toUpperCase() === 'FALSE') return false;
  return Boolean(evaluate(trimmed));
}

/** Evalúa el `THEN`/`ELSE` de una regla, que siempre debe resultar en un
 *  valor numérico (Amount/Rate/Prime o el valor de un concepto). */
export function evaluateNumericExpression(source: string): number {
  const result = evaluate(source.trim());
  const num = asNumber(result);
  if (Number.isNaN(num)) {
    throw new Error(`La expresión de regla "${source}" no produjo un valor numérico válido`);
  }
  return num;
}
