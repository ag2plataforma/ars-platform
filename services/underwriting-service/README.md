# underwriting-service

Sustituye a: `ag2quotemanager` + `ag2contractmanager-1`.

Alcance: cotización (`TQuote*`, equivalente a `FQuote`, `FQuoteRiskPlan`, `FQuoteCoverage`, `FGetQuoteSummary`) y contratación (`TContract*`, equivalente a `FContract`, `FContractOperation`, `FContractBilling`, `FCoverageMovement`, `FRiskCoverage`).

Es el trabajo de mayor riesgo del proyecto — ver `docs/01-especificacion-motor-negocio-actual.md` §4 para el orden exacto de la cascada de creación de contrato que hay que preservar. Candidato a dividirse en dos servicios más adelante si crece demasiado (quote vs. contract) — no se hace ahora para no anticipar una separación que quizá no haga falta.

## Estado actual

Scaffold base igual al resto de servicios (`ConfigModule` con ruta absoluta al `.env` propio, guard JWT global de `@ars-platform/shared-common` — este servicio no emite tokens, solo los verifica — y `GET /health` público), más un primer módulo de negocio real:

### `QuotingModule` — motor de cotización real, Fase 1 (crear + cotizar + seleccionar)

Investigado y confirmado contra código y datos reales (ver `packages/database/scripts/investigate-quote-engine.js` y `docs/02-roadmap.md`) antes de implementarse, mismo criterio que se usó con `FGetRateValue` y el motor de atributos: el ALGORITMO y los VALORES de `FQuote`/`FQuoteRiskPlan`/`FQuoteCoverage`/`FQuoteCoverageConcept` se preservan exactos; la forma de la respuesta JSON es una decisión de API propia, libre, ya que el frontend nuevo todavía no existe.

- `POST /quotes` — crea `TQuote` + un `TQuoteRisk` por riesgo (sin planes/coberturas todavía).
- `POST /quotes/:id/price` — equivalente a `FQuote('QUOTEPRICING', ...)`: reconstruye `TQuoteRiskPlan` (planes "vigentes" de `SPlanProductRisk`, confirmado: estado inicial + `now()` dentro de `[TstInitial, TstEnd]`) → `TQuoteCoverage` (una fila por `SCoveragePlan`, valores por defecto de las columnas `Upper*` si el flag `IndFixed*` correspondiente está activo, preseleccionada si es obligatoria) → `TQuoteCoverageConcept` (vía el `RulesEngineService` ya existente, en vez del `EXECUTE` de SQL dinámico original) para los riesgos todavía en borrador. Repetible: permite re-cotizar tantas veces como haga falta antes de aceptar.
- `GET /quotes/:id` — el mismo JSON de resultado que `price`, sin recalcular.
- `PATCH /quotes/:id/risks/:ideQuoteRisk/plans/:ideQuoteRiskPlan/select` — selecciona un plan (CRUD directo en el original, sin función PL/pgSQL). Regla agregada, ausente como validación explícita en el original pero implícita en `FGetQuoteSummary`: un único plan seleccionado por riesgo.
- `PATCH /quotes/:id/risk-plans/:ideQuoteRiskPlan/coverages/:ideQuoteCoverage` (body: `{ "selected": boolean }`) — selecciona/deselecciona una cobertura opcional (mismo caso, CRUD directo en el original). Regla agregada: una cobertura obligatoria (`SCoveragePlan.IndMandatory`) no se puede deseleccionar.
- `NumQuote` se genera con una secuencia real de Postgres (`ars_platform."SeqTQuoteNumber"`, creada una sola vez con `npm run db:setup-quote-sequence`) en vez de replicar el `split_part`+1 en memoria del original, que tiene riesgo real de colisión bajo concurrencia — decisión explícita del usuario. Mismo formato visible `<CodProducto>-<Año>-<N>`, pero `N` ahora es global, no por producto.

Sin `@Roles(...)`: cotizar es una operación de usuario autenticado normal, no administración de catálogo.

**Hallazgo real, no replicado a propósito**: la rama `QUOTESUMMARY` dentro de `FQuote` real tiene dos defectos de sintaxis (coma faltante en un `json_build_object`, alias de tabla pegado al nombre) presentes idénticos en las 3 copias del esquema — nunca llegó a ejecutarse en producción tal cual está. La función hermana `FGetQuoteSummary` (sintácticamente válida) es la referencia para cuando se implemente el resumen real.

### Personas, resumen y transición de estado (ahora que `party-service` tiene `TPerson`/`SPersonRol`)

- `PUT /quotes/:id/persons` (body: `{ idePerson, codPersonRol }`), `GET /quotes/:id/persons`, `DELETE /quotes/:id/persons/:codPersonRol` — asocia/lista/quita una persona con un rol (`TQuotePerson`, sin función PL/pgSQL propia en el original). `TPerson`/`SPersonRol` se resuelven directo por Prisma contra el mismo Postgres compartido con `party-service`, sin llamada HTTP entre servicios. Regla agregada explícitamente: asignar una persona a un rol reemplaza a quien tuviera ese rol antes en esa cotización (`FGetQuoteSummary` asume con una subconsulta escalar que hay como mucho un TOMADOR y un TITULAR por cotización).
- `GET /quotes/:id/summary` — equivalente a `FGetQuoteSummary` (confirmado contra el código real, no a la rama `QUOTESUMMARY` de `FQuote`, que tiene los dos defectos de sintaxis ya documentados). `attributes` (`FGetParsedRiskAttribute`) queda deliberadamente afuera -- esa función todavía no se investigó; se expone `riskAttributeValue` crudo en su lugar.
- `POST /quotes/:id/state` (body: `{ codOperative }`) — equivalente a `FQuote_SetState`, confirmado contra el código real: aplica una transición de estado a la cotización Y a todo su árbol (`TQuoteRisk`/`TQuoteRiskPlan`/`TQuoteCoverage`/`TQuoteCoverageConcept`, no solo lo seleccionado), reutilizando el `StateMachineService` ya existente. `codOperative` se expone tal cual, sin traducirlo a un endpoint "aceptar" fijo: el código real que dispara la aceptación (y la cascada de contrato que le sigue) todavía no se investigó -- ver el ítem siguiente del roadmap.

Tampoco se investigó todavía `FGetParsedRiskAttribute` (parseo de `RiskAttributeValue` para el resumen).

### `ContractsModule` — cascada de creación de contrato, Fase 1 (`FContract('CONTRACTNEW', ...)`)

"El trabajo de mayor riesgo del proyecto". Investigado y confirmado contra el código real de `FContract` (dispatcher con los 5 casos CONTRACTNEW/CANCELCONTRACT/GETJSONBY/GETNUMBER/SETSTATE, idéntico en las 3 copias del esquema ag2ars/entity/temporal — ver `packages/database/scripts/investigate-contract-engine.js`) y de sus operaciones (`FContractOperation`, `FContractBilling`, `FCoverageMovement`, `FMovementConcept`, `FRiskCoverage`, `FFileRisk`, `FReceipt`/`FReceipt_GetNumber`), más `FContractPerson`/`FContractFilePerson` (confirmados en la investigación de party-service).

- `POST /quotes/:ideQuote/contract` (body opcional: `{ codPaymentFraction?, initialDate? }`) — ejecuta toda la cascada: valida que la cotización esté en estado "Aceptado" y sin contrato previo → `NumContract` (secuencia real de Postgres, mismo criterio que `NumQuote`, ver abajo) → `TContract` → `TContractOperation('CONTGENE')` → `TContractPerson` (copia `TQuotePerson` con rol TOMADOR/TITULAR y recién ahí marca `TPerson.IndClient=true`+`TstRelationshipStart=now()`, confirmado contra el código real) → `TContractDistributionChannel` → `TContractBilling` (períodos según `SPaymentFraction.NumFraction`) → `TContractFile` → `TFileRisk`/`TRiskCoverage` (copiados de los planes/coberturas seleccionados de la cotización) + `TContractRequirement` → `TCoverageMovement`/`TMovementConcept` (vía el mismo `RulesEngineService.evaluateChain`, `origin: 'Contract'`, sin cambios de código — confirmado que fue diseñado para esto) → `TReceipt`/`TReceiptDetail` → transición a "Activar" de todo el árbol del contrato → transición a "Contratar" de la cotización de origen (reutiliza `QuotesService.transitionState`).
- `GET /contracts/:id` — contrato con su árbol completo (archivo → riesgos → coberturas → movimientos).
- `POST /contracts/:id/state` (body: `{ codOperative }`) — equivalente genérico a `FContract('SETSTATE', ...)`, misma cascada completa de árbol que `POST /quotes/:id/state`.
- `NumContract` se genera con una secuencia real de Postgres (`ars_platform."SeqTContractNumber"`, creada una sola vez con `npm run db:setup-contract-sequence`) — mismo riesgo de colisión bajo concurrencia confirmado en `FContract('GETNUMBER', ...)` que el ya resuelto para `NumQuote`.

**Deliberadamente afuera de esta primera pasada** (ver `docs/02-roadmap.md`):
- `CANCELCONTRACT` (cascada de anulación completa) y `FReceipt('BILLFRACTION')` (confirmado como stub no-operativo en el original).
- Contratos colectivos reales (`IndCollective=true`, múltiples `TContractFile`): esta pasada crea siempre un solo `TContractFile` por contrato. `TContractFilePerson` queda sin poblar — no hay dato de origen a nivel de archivo en `TQuotePerson` del que copiar.
- Cálculo de comisión (`SCommissionTree`/`SCommissionTable`/`SCommission`) sobre el recibo: `TReceipt.Fee` se persiste en 0, fórmula real no confirmada contra el código fuente en esta ronda.
- `FMovementConcept('SetNetPrime', ...)`: se replica únicamente `SetRulePrime`; el código real de `SConcept` para la prima neta no se confirmó.
- `ContractAge` (columna real de `TContract`): se persiste en 0, fórmula exacta no confirmada.
- El formato visible de `NumContract`/`NumReceipt` (`CONT-<Año>-<N>` / `REC-<Año>-<N>`) es una decisión de esta implementación, no una réplica carácter por carácter del original.

## Cómo correrlo

```bash
cp services/underwriting-service/.env.example services/underwriting-service/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm run start:underwriting
```

O en modo watch: `npm run start:underwriting:watch`.
