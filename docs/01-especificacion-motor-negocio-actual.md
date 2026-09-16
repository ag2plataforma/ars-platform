# Especificación funcional del motor de negocio actual (PL/pgSQL)

> Documento de referencia para la migración a NestJS/TypeScript. Extraído del análisis de las 44 funciones PL/pgSQL que hoy implementan la lógica de negocio del sistema ARS (esquema `entity` en Postgres). El objetivo es no perder ninguna regla de negocio al reimplementar en el nuevo stack.

## 1. Hallazgo central

El sistema actual **no tiene su lógica de negocio en el backend Node/LoopBack**: los servicios `ag2quotemanager`, `ag2contractmanager-1`, `ag2ratemanager`, etc. son en gran parte capas CRUD que invocan funciones de Postgres con SQL crudo. El verdadero "motor" de cotización, tarificación, contratación, facturación y máquina de estados vive en 44 funciones PL/pgSQL, orquestadas mediante 4 piezas centrales:

1. **`FGetState`** — máquina de estados genérica y configurable (tabla `SStateRule`). Toda transición de estado de cualquier entidad (cotización, contrato, certificado, riesgo, cobertura, movimiento, concepto) pasa por aquí. Modos: `INITIAL`, `NEXT`, `STATE`.
2. **Motor de fórmulas `{IF, THEN, ELSE}`** — reglas de cálculo (`SCalculationRule`) almacenadas como JSON, evaluadas con SQL dinámico (`EXECUTE`). Se repite en `FQuoteCoverageConcept` (mundo cotización) y `FMovementConcept` (mundo contrato/póliza). Las reglas se encadenan por un campo `Order` y pueden referenciar el resultado de una regla anterior con `rule(...)`.
3. **`FGetValueAttribute` / `FGetValueRule`** — resuelven, dentro de una fórmula, el valor de un campo personalizado del riesgo o el resultado ya calculado de otra regla. Si el dato no existe, devuelven `0` en silencio (regla de negocio implícita: "atributo no configurado = no aporta al cálculo").
4. **Orquestación en cascada** — `FContract` (alta de póliza), `FQuote` (cotización) y `FQuote_SetState`/`FContract`(SETSTATE) propagan cambios a través de 4-6 niveles de tablas relacionadas en un orden específico que debe respetarse.

Esto cambia la forma de abordar el rediseño: no es "traducir CRUD de LoopBack a NestJS", es **extraer un motor de reglas de negocio configurable** y reconstruirlo en TypeScript de forma segura (sin SQL dinámico) y testeable.

## 2. Máquina de estados (`FGetState` / `SStateRule`)

- Tabla `SStateRule` define, por entidad (`SEntity`) y código operativo (`DesOperativeCode`, ej. `Aceptar`, `Activar`, `Anular`, `Modificar`, `Contratar`, `Facturar`), cuál es el estado destino desde cada estado origen.
- `INITIAL`: estado inicial de una entidad. `NEXT`: siguiente estado dado el actual + operación. `STATE`: resuelve un estado por su nombre (ej. `'Activo'`) como constante.
- Si no existe una transición configurada, la función lanza excepción — no hay fallback silencioso aquí (a diferencia del motor de fórmulas).
- **Recomendación para el rediseño:** implementar como un servicio de dominio (`StateMachineService`) que lea la misma tabla de reglas (se puede conservar tal cual, es un buen diseño) y exponga `getInitial(entity)`, `getNext(entity, from, operation)`, `getByCode(code)`. Preservar la tabla `SStateRule` es más importante que preservar la función SQL.

## 3. Motor de tarificación y fórmulas

### 3.1 Jerarquía de reglas
`SCalculationRule` aplica por combinación **Producto > PlanProductRisk > CoveragePlan**, con `NULL` como comodín ("aplica a todos"). Se ordenan por `Order` — el orden importa porque una regla puede usar `rule(codigo)` para leer el resultado de una regla anterior de la misma cobertura.

### 3.2 Algoritmo de cálculo de una prima (caso `FQuote` / `QUOTEPRICING`)
1. `FQuoteRiskPlan`: limpia cálculos previos (permite re-cotizar) y genera todas las combinaciones de plan vigentes para cada riesgo cotizado.
2. `FQuoteCoverage`: por cada plan, crea una fila en `TQuoteCoverage` por cada cobertura configurada (`SCoveragePlan`), con montos por defecto (fijo si `IndFixed*=true`, si no 0) y pre-selección de las obligatorias (`IndMandatory`).
3. `FQuoteCoverageConcept`, por cada cobertura:
   - Obtiene las reglas aplicables (`SCalculationRule`) ordenadas por `Order`.
   - Sustituye en el JSON `{IF,THEN,ELSE}` los tokens de custom fields por su valor real (`FGetValueAttribute`) y las referencias `rule(...)` por el resultado de reglas previas (`FGetValueRule`).
   - Evalúa el `IF` y ejecuta `THEN` o `ELSE` (hoy: SQL dinámico; en el rediseño: **evaluador de expresiones seguro**, no `eval` ni SQL dinámico — ver recomendación abajo).
   - Si la regla trae `DesColumnName`, actualiza esa columna directamente (Amount/Rate/Prime); si no, inserta un concepto nuevo (ej. `PrimaNeta`, impuestos, comisión, `PrimaTotal`).
4. `TQuoteCoverage.Prime` = valor del concepto `PrimaTotal`. La suma de las coberturas seleccionadas = precio base mostrado al usuario.

El mismo patrón exacto se repite para pólizas ya emitidas en `FMovementConcept` (casos `SETRULEPRIME`/`SETNETPRIME`/`SETCANCELCONCEPT`/`SETCANCELPRIME`), con lógica adicional de **prorrateo** (por fracción de pago o por días exactos, configurable vía `SProduct.IndProportionalPrime`) para endosos y anulaciones.

### 3.3 Tablas de tarifa multidimensional (`FGetRateValue`)
Busca un valor en `SRateTable`/`SRateValue` con hasta 5 factores, donde cada factor es opcional (`NULL` = no filtra por esa dimensión). Semántica de "comodín" a preservar exactamente.

### 3.4 Recomendación de reemplazo tecnológico
Reemplazar el `EXECUTE` de SQL dinámico por un **evaluador de expresiones en TypeScript** (candidatas: `json-logic-js`, `expr-eval`, o un motor de reglas dedicado como **GoRules Zen Engine**, que usa un formato JDM similar en espíritu a este `{IF,THEN,ELSE}` pero con editor visual y sin riesgo de inyección). Esto elimina de raíz la superficie de inyección SQL que existe hoy en varias funciones (`FGetIdeDesc`, `FGetSiteMap`, `FGetParsedRiskAttribute`, y el propio motor de fórmulas) y hace las reglas testeables con Jest.

## 4. Ciclo de vida: Cotización → Contrato

Orden exacto de la cascada al convertir una cotización aceptada en póliza (`FContract`/`CONTRACTNEW`), que debe respetarse en la reimplementación:

```
Contract → ContractOperation → ContractPerson → ContractDistributionChannel
  → ContractBilling(SET) → ContractFile → ContractFilePerson → FileRisk
  → RiskCoverage → CoverageMovement → MovementConcept → Receipt
  → ContractBilling(BILL) → SetState(Activar) → Quote.SetState(Contratar)
```

Reglas de negocio a conservar:
- Fecha de inicio: `NOW` o fecha configurada del producto; por defecto, día siguiente.
- Vigencia anual si `IndAnnual=true`; **los otros 3 tipos de vigencia (`TempPack`/`TempDays`/`TempDate`) están sin implementar en el sistema actual** (placeholder que siempre cae a 1 año) — decidir si se implementan de verdad en el rediseño o se documenta como limitación conocida.
- `FContractPerson`: el momento exacto en que un prospecto se convierte en cliente (`IndClient=true`, `TstRelationshipStart=now()`) es al crear el contrato, no al cotizar.
- `FContractDistributionChannel`: split de comisión configurable por canal (`SCommissionProduct`); si no hay configuración, 100% al canal de origen de la cotización.
- Anulación (`CANCELCONTRACT`): genera un movimiento de cierre con montos en 0 hasta la fecha de anulación (mecánica de prorrateo/reverso), y la devolución de prima/comisión/impuesto es configurable por endoso (`SProductEndorsement.ConditionData`).
- Comisiones (`FReceipt`): se calculan por un árbol (`SCommissionTree` → `SCommissionTable` → `SCommission`) con comodines NULL, tomando el canal principal (`IndMain=true`) del contrato.

## 5. Flujos de proceso configurables (wizard de cotización)

- `SFlowStep` define pasos con bifurcación por resultado (`IndResultOK`), reconstruidos con una CTE recursiva (`FPInstanceFlow`, `FFlowStep`).
- `FGetNextFlowStep` / `FPFlowStepRegistry` llevan el progreso de cada sesión de usuario (`UIDSession`) en `TFlowStepInstance`.
- Es un patrón de máquina de estados configurable por datos — coherente con la narrativa original de "flujos de contratación configurables por canal/producto". Vale la pena preservarlo como concepto, reimplementado sin el hack de reemplazo de caracteres encontrado (`replace('#','Bicicleta')`, ver §6).

## 6. Deuda técnica y riesgos detectados (a resolver, no a replicar)

| Hallazgo | Ubicación | Riesgo |
|---|---|---|
| SQL dinámico con concatenación de texto | `FGetIdeDesc`, `FGetSiteMap`, `FGetParsedRiskAttribute`, motor de fórmulas | Inyección SQL |
| Posible typo: llama a `FGeState` (falta la "t") | `FGetProcessFlowByUIDSession` | Puede fallar en runtime; verificar contra catálogo real de funciones |
| Correlativos por parseo de texto (`split_part` + max) sin secuencia real | `FQuote`/GETQUOTENUMBER, `FReceipt_GetNumber`, `FContract`/GETNUMBER | Colisiones bajo concurrencia |
| Hack de caracteres `replace('#','Bicicleta')` | `FFlowStep`, `FPInstanceFlow` | Comportamiento poco claro, investigar propósito real antes de migrar |
| Placeholder de moneda con encoding roto | `FContract_Temp` | Corregir, no replicar |
| Vigencias `TempPack`/`TempDays`/`TempDate` sin implementar | `FContract` | Funcionalidad incompleta ya en producción |
| `ReceiptType` marcado por el propio equipo como "REVISAR ESTE PROCESO ESTA MALO" | `FReceipt` | Deuda técnica reconocida, revisar antes de portar |
| Función marcada como deprecada en su propio comentario | `FSetContractOperation` | Verificar si sigue en uso antes de decidir si se porta |
| Dashboard sin filtro de estado/vigencia | `FDashboard` | Agrega histórico completo, puede no ser el comportamiento deseado |
| Código muerto comentado dejado en el cuerpo de la función | `FContract_JSONDetail`, `FSOperationProductTemplate` | Limpiar en la migración |
| Templates de email e IDs de plantilla hardcodeados por producto, remitentes hardcodeados (incluida una dirección personal) | `FSOperationProductTemplate` | Externalizar a configuración |

## 7. Recomendaciones para el rediseño

1. **Separar el motor de reglas del motor de estados** como dos servicios de dominio independientes en el nuevo backend (`RulesEngineService`, `StateMachineService`), ambos data-driven a partir de las mismas tablas de configuración (`SCalculationRule`, `SStateRule`) — no hace falta rediseñar el modelo de datos de configuración, ya es bueno.
2. **Sustituir el `EXECUTE` de SQL dinámico** por un evaluador de expresiones seguro en TypeScript (recomendado explorar GoRules Zen Engine dado que da además un editor visual de reglas, alineado con "parrillas de tarifas configurables" de la narrativa ARS).
3. **Conservar el orden exacto de la cascada** de creación de contrato y de propagación de estado — es lógica de integridad, no solo de estilo.
4. **Reemplazar los correlativos por secuencias reales** (o una tabla de contadores con lock) para número de cotización, póliza y recibo.
5. **Tratar la tabla `SStateRule` y `SCalculationRule` como el activo más valioso a migrar sin pérdida** — son la configuración de negocio real; el código es solo el intérprete.
6. Antes de dar por buena esta especificación, sería ideal una sesión de validación contigo (o con quien conozca el negocio) repasando los puntos de la sección 6 y confirmando si el comportamiento actual (aunque parezca un bug, como `FQuote_SetState` actualizando planes no seleccionados) es intencional o no.
