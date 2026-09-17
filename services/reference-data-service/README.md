# reference-data-service

Sustituye a: `core-common-data-service` + `ag2customattributesmanager` + `ag2translatormanager` + `ag2setupmanager` + `ag2flowmanager`.

Alcance: catálogos comunes (país, moneda, idioma, género, profesión...), atributos personalizables (`SFieldDictionary`, `SAttribute`, `SModelAttribute` — equivalente a `FGetCustomAttributes`), i18n (`STranslator`, `STextContent`), setup inicial (`SApplication`, `SSiteMap`), y flujos de proceso configurables (`SFlowStep`, `SProcessFlow` — equivalente a `FFlowStep`, `FGetNextFlowStep`, `FPInstanceFlow`).

## Estado actual

Scaffold base igual al resto de servicios (`ConfigModule` con ruta absoluta al `.env` propio, guard JWT global de `@ars-platform/shared-common` — este servicio no emite tokens, solo los verifica — y `GET /health` público), más un primer módulo de negocio real:

### `FieldCatalogModule` — `SFieldDictionary` / `SFieldValue`

CRUD completo del diccionario de campos y sus valores posibles (mismo patrón `CatalogCrudService` que usa `product-rating-service`, ahora en `@ars-platform/shared-common` porque ya lo comparten dos servicios). Estas dos tablas son las que consumen los factores de tarifa (`SRateFactor.IdeFieldDictionary`, ver `product-rating-service`) y la sustitución de custom fields dentro de una fórmula de `SCalculationRule` (`substituteFieldTokens` en `RulesEngineService`).

- `GET /field-dictionary`, `GET /field-dictionary/:id`, `POST /field-dictionary` (`ADMIN`), `PATCH /field-dictionary/:id` (`ADMIN`), `PATCH /field-dictionary/:id/state` (`ADMIN`).
- `GET /field-values`, `GET /field-values/:id`, `POST /field-values` (`ADMIN`, requiere `codFieldDictionary` de un campo existente), `PATCH /field-values/:id` (`ADMIN`), `PATCH /field-values/:id/state` (`ADMIN`).

### `AttributeEngineModule` — motor de atributos personalizables + flujo configurable

Investigado y confirmado contra código y datos reales (ver `packages/database/scripts/investigate-attribute-engine.js` y `docs/02-roadmap.md`) antes de implementarse, mismo criterio que se usó con `FGetRateValue`. Dos partes:

**Configuración de atributos** (lo que resuelve `attribute('COD')` en el motor de reglas — `PrismaAttributeValueResolver` en `@ars-platform/database`, sin cambios de código ahí, ya coincide con `FGetValueAttribute` real):
- `GET/POST/PATCH /attributes` — `SAttribute`, concepto reutilizable (ej. "Raza del Perro"), ligado a un `SFieldDictionary`.
- `GET/POST/PATCH /model-attributes` — `SModelAttribute`, qué set de atributos aplica a qué entidad/producto (ej. "Perro", "BikeMountain"). `IdeReference` es polimórfico, se acepta como uuid crudo sin validar.
- `GET/POST/PATCH /attribute-properties` — `SAttributeProperty`, el campo de formulario REAL de un producto puntual (JSON real: `name`/`label`/`type`/`validators`), enlaza `SModelAttribute` con `SAttribute`.
- `GET /entities`, `GET /entities/:id` — `SEntity`, de solo lectura (tipos de objeto de negocio del propio código, ej. "TQuoteRisk"; crear uno nuevo no hace nada sin soporte en código).

**Configuración del flujo/wizard** (deliberadamente separado de su ejecución — ver más abajo):
- `GET/POST/PATCH /process-flows` — `SProcessFlow`, catálogo simple.
- `GET/POST/PATCH /steps` — `SStep`, catálogo simple.
- `GET/POST/PATCH /screens` — `SScreen`, con `ScreenContent` (JSON real, no texto).
- `GET/POST/PATCH /flow-steps` — `SFlowStep`, sin código propio (identificado por `IdeProcessFlow`+`IdeStepCurrent`+`IndResultOK`+`IdeStepForward`), escrito a mano en vez de con `CatalogCrudService`.

Todos los `POST`/`PATCH` de `AttributeEngineModule` requieren rol `ADMIN`, igual que `FieldCatalogModule`.

**Deliberadamente afuera de este módulo** la EJECUCIÓN del flujo en una sesión de cotización concreta (`FPInstanceFlow`, `FGetNextFlowStep`, `TFlowStepInstance`, el templating real `replace('#', vDesShort)`) — esto es solo la configuración; ejecutarlo depende de que `underwriting-service` tenga el flujo real de cotización, que todavía no existe.

El resto del alcance de este servicio (i18n, setup) sigue sin implementar.

## Cómo correrlo

```bash
cp services/reference-data-service/.env.example services/reference-data-service/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm run start:reference-data
```

O en modo watch: `npm run start:reference-data:watch`.
