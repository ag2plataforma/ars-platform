# party-service

Sustituye a: `ag2personmanager` + `ag2consentmanager` + `ag2commercialmanager`.

Alcance: personas (`TPerson`, `TAddress`, `TContactData`), consentimiento GDPR (`SConsent`, `TPersonConsent` — equivalente a `FConsent`), brokers/comercial (`TBroker`, árbol de comisiones `SCommissionTree`/`SCommissionTable`/`SCommission`, split de comisión por canal `SCommissionProduct`).

## Estado actual

Scaffold base igual al resto de servicios (`ConfigModule` con ruta absoluta al `.env` propio, guard JWT global de `@ars-platform/shared-common` — este servicio no emite tokens, solo los verifica — y `GET /health` público), más dos primeros módulos de negocio real:

### `PersonsModule` — personas, direcciones, datos de contacto y roles

Investigado y confirmado contra código y datos reales (ver `packages/database/scripts/investigate-party-service.js` y `docs/02-roadmap.md`) antes de implementarse. `TPerson`/`TAddress`/`TContactData` no tienen función PL/pgSQL propia de escritura (solo `FPerson_GetBy`, de solo lectura) -- eran CRUD directo de la capa LoopBack original, igual que `TQuote`/`TQuoteRisk`.

- `POST /persons`, `GET /persons/lookup?idePerson=&numIdentification=&email=` (equivalente a `FPerson_GetBy` -- si se envía más de un criterio, deben matchear TODOS a la vez, confirmado contra el código real), `GET /persons/:id` (con direcciones/contactos activos anidados), `PATCH /persons/:id`.
- `POST/PATCH /persons/:id/addresses/...`, `POST/PATCH /persons/:id/contact-data/...` -- dos reglas de negocio agregadas explícitamente (ausentes como validación en el original, que dependía del frontend Angular): una única dirección principal y un único dato de contacto principal por clase (`SContactClass`), por persona.
- `GET/POST/PATCH /person-roles` (`ADMIN` para mutaciones) -- catálogo `SPersonRol`, confirmado contra datos reales: `TOMADOR`, `TITULAR`, `BENEFICIARIO`, `ASEGURADO` (sin ningún seed/constante en el repo antes de esta investigación).
- Toda persona nace `IndLead=true`/`IndClient=false` -- confirmado contra `FContractPerson` real: el original solo marca `IndClient=true`+`TstRelationshipStart=now()` al crear un CONTRATO, nunca antes. Ese paso es de underwriting-service (fase de contratación, todavía no implementada).
- Sin `@Roles(...)` en `PersonsController`: gestionar personas es una operación de usuario autenticado normal, como cotizar.

### `ConsentModule` — consentimiento GDPR

Equivalente a `FConsent`, confirmado contra el código real. **Corrección deliberada de un defecto real del original** (decisión explícita del usuario): `FConsent` tiene un bug de precedencia de operadores (`IdeProduct IS NULL OR IdeProduct = X AND Activo AND vigente`, que por precedencia SQL hace que los consentimientos GLOBALES se devuelvan siempre, estén o no activos/vigentes) -- acá el chequeo de estado+vigencia aplica a todos los consentimientos, también a los globales.

- `GET/POST/PATCH /consents` (`ADMIN` para mutaciones) -- catálogo `SConsent`, mismo patrón `CatalogCrudService`.
- `GET /consents/applicable?codProduct=X` -- equivalente a `FConsent`, con la corrección de arriba.
- `POST /persons/:personId/consents` (body: `{ ideConsent, ideQuote }`), `GET /persons/:personId/consents?ideQuote=` -- registra/lista la aceptación de un consentimiento (`TPersonConsent`, sin función PL/pgSQL propia en el original). Idempotente a propósito (regla agregada): aceptar el mismo consentimiento dos veces para la misma persona+cotización no duplica el registro.
- Fase 1: `TPersonConsent` solo se liga a una cotización (`IdeQuote`) -- `IdeContractOperation` queda para cuando exista la fase de contratación real.

### `BrokersModule` -- brokers y árbol de comisiones

`TBroker`/`SCommissionTree`/`SCommissionTable`/`SCommission`/`SCommissionProduct` -- confirmado contra el dump completo de funciones PL/pgSQL que ninguna de las 5 tiene función propia de escritura, así que es CRUD administrativo diseñado de cero, no una réplica de lógica de negocio existente. Ya usado en la práctica por `underwriting-service`: `resolveCommissionPercentage`/`generateReceipts` (ver roadmap) calculan la comisión real de un recibo con `SCommissionTree`/`SCommissionTable`/`SCommission`, y `setContractDistributionChannel` (equivalente a `FContractDistributionChannel('SETQUOTE', ...)`) lee `SCommissionProduct` para armar el split de canales del contrato -- este módulo es lo que faltaba para darlas de alta sin tocar la BD a mano.

- `GET/POST /brokers`, `GET/PATCH /brokers/:id`, `PATCH /brokers/:id/state` (`ADMIN` para mutaciones) -- catálogo `TBroker`, patrón `CatalogCrudService`; resuelve `codBrokerType`→`SBrokerType` y valida que `idePerson`→`TPerson` exista.
- `GET/POST /commission-trees`, `GET/PATCH /commission-trees/:id`, `PATCH /commission-trees/:id/state` -- catálogo `SCommissionTree`, mismo patrón; resuelve `codDistributionChannel`→`SDistributionChannel`.
- `GET/POST /commission-tables`, `GET/PATCH /commission-tables/:id`, `PATCH /commission-tables/:id/state` -- catálogo `SCommissionTable` (filtrable por `codCommissionTree`/`codProduct`); `idePlanProductRisk`/`ideCoveragePlan` opcionales se reciben como uuid crudo (tablas de unión sin código propio, NULL = comodín, mismo criterio que ya usa `resolveCommissionPercentage`).
- `GET/POST /commissions`, `GET/PATCH /commissions/:id`, `PATCH /commissions/:id/state` -- `SCommission` (% vigente por tabla+proceso en una ventana `[TstInitial, TstEnd]`), escrito a mano (sin `Cod`/`Des` propio, mismo estilo que `rate-values.service.ts`). `NumMovement` es un correlativo de versión por `(IdeCommissionTable, IdeProcess)` calculado automáticamente (máximo existente + 1), no un dato que cargue el usuario. `codCommissionTable`/`codProcess` no se pueden cambiar en un `update()` (afectarían la clave de versión) -- para moverla a otra tabla/proceso se crea una fila nueva.

- `GET/POST /commission-products`, `GET/PATCH /commission-products/:id`, `PATCH /commission-products/:id/state` -- `SCommissionProduct` (split de comisión de un producto entre canal de origen y uno o más de destino, con `Percentaje`/`IndMain` por destino). **Sin versionado a propósito** (decisión explícita del usuario): es la ÚNICA de las 5 tablas con función PL/pgSQL real de LECTURA (`FContractDistributionChannel('SETQUOTE', ...)`, en `underwriting-service`), y esa función no filtra por `NumMovement` ni vigencia -- toma TODAS las filas `Activa` que matcheen (producto, canal origen). Por eso `update()` edita en el lugar (`Percentaje`/`IndMain`/vigencia) en vez de crear una fila nueva -- dejar dos filas Activas para el mismo (producto, canal origen, canal destino) a la vez duplicaría el split en el contrato. `codProduct`/`codDistributionChannelOrigin`/`codDistributionChannelDestiny` no se pueden cambiar en `update()` (mueven la identidad de la fila) -- para eso se crea una fila nueva.
- `setContractDistributionChannel` en `underwriting-service` (equivalente a `FContractDistributionChannel('SETQUOTE', ...)`, confirmado línea por línea) ya consulta `SCommissionProduct`: si hay configuración activa para (canal de origen de la cotización, producto), crea un `TContractDistributionChannel` por cada fila que matchee; si no hay ninguna, cae al fallback real (un único canal, 100%, `IndMain=true`). Ver `docs/02-roadmap.md` para el detalle de la investigación.

**Deliberadamente afuera de esta fase**: la asociación persona+rol+cotización (`TQuotePerson`) -- eso vive naturalmente del lado de `underwriting-service` (mutación sobre el agregado cotización, mismo patrón que `selectPlan`/`toggleCoverage`), y es el siguiente ítem del roadmap (resumen y aceptación de cotización).

## Cómo correrlo

```bash
cp services/party-service/.env.example services/party-service/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm run start:party
```

O en modo watch: `npm run start:party:watch`.
