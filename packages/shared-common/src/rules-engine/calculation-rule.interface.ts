/**
 * Contratos (puertos) del motor de reglas de cálculo — equivalente en
 * TypeScript a `FQuoteCoverageConcept`/`FMovementConcept` +
 * `FGetValueAttribute`/`FGetValueRule` (ver
 * docs/01-especificacion-motor-negocio-actual.md, §3).
 *
 * Mismo patrón que `StateRuleRepository` en `state-machine.service.ts`:
 * shared-common no depende de Prisma ni de ningún ORM. Cada servicio
 * conecta la implementación real (contra Postgres, en
 * `@ars-platform/database`) vía `RulesEngineModule.forRoot(...)`.
 */

/** 'Quote' = mundo cotización (TQuoteCoverage/TQuoteCoverageConcept).
 *  'Contract' = mundo póliza ya emitida (TCoverageMovement/TMovementConcept). */
export type RuleOrigin = 'Quote' | 'Contract';

export interface CalculationRuleFormula {
  if: string;
  then: string;
  else: string;
}

/** Una fila de `SCalculationRule`, con el `FormulaJSON` ya desestructurado. */
export interface CalculationRule {
  ideCalculationRule: string;
  codCalculationRule: string;
  order: number;
  ideConcept: string;
  /** Si viene informado, el resultado sobreescribe esa columna
   *  (Amount/Rate/Prime) en `TQuoteCoverage`/`TCoverageMovement` en vez de
   *  crear un concepto nuevo — igual que el `DesColumnName` original. */
  desColumnName: string | null;
  formula: CalculationRuleFormula;
}

/** Un custom field configurado (`SFieldDictionary` + `SAttribute` activos),
 *  el mismo universo que `FQuoteCoverageConcept` recorre para cada fórmula. */
export interface FieldToken {
  codFieldDictionary: string;
  ideAttribute: string;
}

export interface CalculationRuleHierarchy {
  ideProduct: string | null;
  idePlanProductRisk: string | null;
  ideCoveragePlan: string;
}

/**
 * Puerto de acceso a la configuración de reglas (`SCalculationRule`,
 * `SFieldDictionary`/`SAttribute`). Implementación real:
 * `PrismaCalculationRuleRepository` en `@ars-platform/database`.
 */
export interface CalculationRuleRepository {
  /** Reglas aplicables por la jerarquía Producto > PlanProductRisk >
   *  CoveragePlan (NULL = comodín), ya ordenadas por `Order` — igual que
   *  el `WHERE`/`ORDER BY` de `FQuoteCoverageConcept`. */
  findApplicableRules(hierarchy: CalculationRuleHierarchy): Promise<CalculationRule[]>;

  /** Todos los custom fields activos — el mismo universo que
   *  `FQuoteCoverageConcept` recorre en su "Paso 1" para cada fórmula. */
  listActiveFieldTokens(): Promise<FieldToken[]>;
}

/**
 * Puerto equivalente a `FGetValueAttribute`: resuelve el valor de un
 * custom field para el riesgo de origen. Devuelve el `CodFieldValue` como
 * texto (igual que el original, que retorna `character varying`, no
 * numérico) — por defecto `'0'` si no hay dato, replicando el "atributo no
 * configurado = no aporta al cálculo" del sistema actual.
 *
 * `dbTransaction` es un handle OPACO (no tipado acá a propósito --
 * `shared-common` no depende de Prisma, ver el doc-comment de este
 * archivo): cuando el llamador está dentro de una transacción activa que
 * pudo haber escrito el dato que este método necesita leer (por ejemplo,
 * `TFileRisk.RiskAttributeValue` recién creado por
 * `ContractsService.copyRisksAndCoverages` dentro de la misma
 * transacción), lo pasa para que la implementación concreta
 * (`PrismaAttributeValueResolver` en `@ars-platform/database`) lea por esa
 * misma conexión en vez de una aparte -- si no, bajo READ COMMITTED, esa
 * fila le resulta invisible hasta que la transacción externa haga commit.
 * Si se omite, la implementación usa su conexión normal (no-transaccional).
 */
export interface AttributeValueResolver {
  resolveAttributeValue(
    origin: RuleOrigin,
    ideOriginRisk: string,
    ideAttribute: string,
    dbTransaction?: unknown,
  ): Promise<string>;
}

/**
 * Puerto equivalente a `FGetValueRule`: resuelve el valor ya calculado de
 * una regla anterior para la misma cobertura/movimiento. Por defecto `0`
 * si no hay dato (igual que el original).
 *
 * `dbTransaction`: mismo handle opaco y mismo motivo que en
 * `AttributeValueResolver.resolveAttributeValue` -- necesario para
 * `origin: 'Contract'` cuando el `TMovementConcept` a leer fue escrito por
 * la misma transacción activa (`ContractsService.createInitialMovements`),
 * todavía sin commit.
 */
export interface RuleValueResolver {
  resolveRuleValue(
    origin: RuleOrigin,
    ideCoverageOrMovement: string,
    codCalculationRule: string,
    dbTransaction?: unknown,
  ): Promise<number>;
}

/**
 * Puerto equivalente a `FGetRateValue`: resuelve el valor de una tabla de
 * tarifa multidimensional (`SRateTable`/`SRateValue`) dados sus factores.
 * Misma firma posicional que la función original
 * (`pCodRateTable, pFactor1..pFactor5`) y misma semántica exacta,
 * confirmada contra su código fuente en Postgres (ver
 * `RulesEngineService.substituteRateValueReferences` para cómo se invoca
 * desde dentro de una fórmula, y la implementación real —
 * `PrismaRateValueResolver` en `@ars-platform/database`, también
 * reutilizada por `product-rating-service` para su endpoint HTTP de
 * prueba `GET /rate-values/lookup`— para el detalle completo):
 *
 * - `factor1` siempre obligatorio, de calce exacto (sin comodín).
 * - `factor2`..`factor5` opcionales: si se omiten (`undefined`), esa
 *   dimensión no se filtra en absoluto; si se envían, deben calzar exacto.
 *   El comodín es del lado de quien llama, no de la fila.
 * - Debe existir EXACTAMENTE una fila que calce — 0 o más de 1 son errores
 *   (el original los trata como `no_data_found`/`too_many_rows`), no un
 *   criterio de desempate por especificidad.
 */
export interface RateValueResolver {
  resolveRateValue(
    codRateTable: string,
    factor1: string,
    factor2?: string,
    factor3?: string,
    factor4?: string,
    factor5?: string,
  ): Promise<number>;
}

/**
 * Puerto nuevo (Fase 3, motor generico de recargos/descuentos -- ver
 * docs/02-roadmap.md): resuelve el valor porcentual de un "ajuste"
 * nombrado (recargo o descuento) ya calculado y persistido para la
 * cotizacion/contrato de origen, para que una formula lo use via
 * `adjustment('COD')` -- mismo mecanismo de sustitucion de texto que
 * `rule('COD')` (ver RulesEngineService.substituteAdjustmentReferences),
 * resuelto ANTES de llegar al evaluador de expresiones.
 *
 * Impacto Social es el primer caso de uso (`CodAdjustment='SOCIAL_IMPACT'`),
 * pero el puerto es generico a proposito: una feature futura de
 * recargos/descuentos (fidelidad, multi-poliza, siniestralidad, etc.)
 * publica su propio `CodAdjustment` sin volver a tocar
 * ContractsService/QuotesService -- alcanza con una fila nueva de
 * SCalculationRule que lo referencie en su formula, exactamente igual
 * que hoy se referencia `rule(...)` o `FGetRateValue(...)`. La
 * implementacion real (`PrismaAdjustmentValueResolver`, en
 * `@ars-platform/database`) es la unica que sabe, por `codAdjustment`,
 * en que tabla de dominio buscar el valor ya calculado.
 *
 * Convencion de signo: igual que `pctPrimaAdjustment` ya expuesto por
 * Impacto Social -- negativo = descuento, positivo = recargo. Por
 * defecto 0 si no hay dato todavia (cotizacion sin el paso contestado,
 * o `codAdjustment` desconocido) -- mismo criterio de "silencio = no
 * aporta al calculo" que el resto del motor (ver AttributeValueResolver).
 *
 * `dbTransaction`: mismo handle opaco y mismo motivo que en
 * AttributeValueResolver/RuleValueResolver (ver esas interfaces) --
 * necesario para `origin: 'Contract'` cuando el dato a leer fue escrito
 * por la misma transaccion activa, todavia sin commit.
 */
export interface AdjustmentValueResolver {
  resolveAdjustmentValue(
    origin: RuleOrigin,
    ideOriginRisk: string,
    codAdjustment: string,
    dbTransaction?: unknown,
  ): Promise<number>;
}

export const CALCULATION_RULE_REPOSITORY = Symbol('CALCULATION_RULE_REPOSITORY');
export const ATTRIBUTE_VALUE_RESOLVER = Symbol('ATTRIBUTE_VALUE_RESOLVER');
export const RULE_VALUE_RESOLVER = Symbol('RULE_VALUE_RESOLVER');
export const RATE_VALUE_RESOLVER = Symbol('RATE_VALUE_RESOLVER');
export const ADJUSTMENT_VALUE_RESOLVER = Symbol('ADJUSTMENT_VALUE_RESOLVER');
