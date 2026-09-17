# party-service

Sustituye a: `ag2personmanager` + `ag2consentmanager` + `ag2commercialmanager`.

Alcance: personas (`TPerson`, `TAddress`, `TContactData`), consentimiento GDPR (`SConsent`, `TPersonConsent` — equivalente a `FConsent`), brokers/comercial (`TBroker`, comisiones por canal `SCommission*`).

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

**Deliberadamente afuera de esta fase**: brokers (`TBroker`) y el árbol de comisiones (`SCommissionTree`/`SCommissionTable`/`SCommission`/`SCommissionProduct`) -- no bloquean nada hasta `FReceipt`, bastante después en la cascada de contratación; les toca su propia investigación e implementación por separado. Tampoco se implementa en esta fase la asociación persona+rol+cotización (`TQuotePerson`) -- eso vive naturalmente del lado de `underwriting-service` (mutación sobre el agregado cotización, mismo patrón que `selectPlan`/`toggleCoverage`), y es el siguiente ítem del roadmap (resumen y aceptación de cotización).

## Cómo correrlo

```bash
cp services/party-service/.env.example services/party-service/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm run start:party
```

O en modo watch: `npm run start:party:watch`.
