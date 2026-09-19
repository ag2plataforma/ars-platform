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

### `CommonCatalogsModule` — catálogos comunes

Los ocho catálogos simples y `SCountry` incluyen `SState` (y `SLanguage` en
el caso de `SCountry`) en las respuestas de `findAll`/`findOne`/`create`/
`update`/`setState` -- agregado al construir la pantalla de Catálogos del
backoffice (`apps/backoffice`), para que el frontend pueda mostrar
Activo/Inactivo real sin una llamada aparte. Aditivo, no rompe el contrato
anterior.

Ocho catálogos simples con `CatalogCrudService` genérico (`GET`, `GET /:id`, `POST` `ADMIN`, `PATCH /:id` `ADMIN`, `PATCH /:id/state` `ADMIN`): `GET /languages`, `GET /genders`, `GET /marital-statuses`, `GET /professions`, `GET /business-activities`, `GET /identification-types`, `GET /relationships`, `GET /contact-classes`.

Dos catálogos con lógica extra:
- `GET /countries` — `SCountry`, con `CodDDI` e `IdeLanguage` (resuelto desde `codLanguage` en el body).
- `GET /locations` — `SLocation`, escrito a mano (no `CatalogCrudService`) porque su unicidad real es compuesta (`CodLocation`+`IdeCountry`, no `CodLocation` solo) y tiene jerarquía propia (`codLocationParent`).

### `I18nModule` — `STextContent` / `STranslator`

Confirmado por grep sobre las funciones PL/pgSQL reales (no existe ninguna función de negocio para traducción, ni `Translat*` ni `GetText*` propias — solo el `pg_catalog.translate` nativo de Postgres) que esto es CRUD puro, sin algoritmo que replicar.

- `GET/POST /text-content` — `STextContent`, el "grupo de traducción" referenciado por ~60 tablas vía su `IdeTextContent` opcional.
- `GET/POST/PATCH /translations` — `STranslator`, una traducción puntual a un idioma. Único real por (`IdeTextContent`, `IdeLanguage`) — se valida antes de insertar.

### `SetupModule` — configuración del árbol de navegación

Incluye el único módulo de este servicio con una función PL/pgSQL de LECTURA real confirmada y migrada línea por línea: `FGetSiteMap` (idéntica en los esquemas `ag2ars`/`entity`/`temporal`; `ag2servicio.FGetSiteMap` es un sistema legado no relacionado, con tablas `ARS_APLICACION_MENU*` propias, descartado). El algoritmo real: árbol de 3 niveles de `SSiteMap` (raíz = `IdeSiteMapParent IS NULL`), filtrado por `SSiteMapRole`/`SApplicationRole` contra uno o más códigos de rol (separados por coma), ordenado por `NumOrder` ascendente por nivel. La función original usa SQL dinámico sin parametrizar para la lista de roles (riesgo de inyección, ya señalado en la Fase 0) — acá se reemplazó por consultas Prisma parametrizadas.

**Desviación deliberada, con visto bueno explícito del usuario** (ver `docs/02-roadmap.md`): la función original NO tiene `DISTINCT`, así que un usuario con varios roles que comparten acceso al mismo ítem lo recibe duplicado. Acá se deduplica (consecuencia natural de consultar `SSiteMap` directo vía Prisma, sin código extra) porque el árbol de navegación no es lógica financiera/de negocio crítica como un cálculo de prima — a diferencia de esos casos, aquí sí se permitió corregir el defecto en vez de replicarlo tal cual.

- `GET/POST/PATCH /applications` — `SApplication`, catálogo simple (`CatalogCrudService`).
- `GET/POST/PATCH /application-roles` — `SApplicationRole`, catálogo simple con `codApplication` resuelto.
- `GET/POST/PATCH /site-map` — `SSiteMap`, ítems del árbol (`CodSiteMap` es único global, sí usa `CatalogCrudService`), jerarquía propia vía `codSiteMapParent`.
- `GET /site-map-menu?codApplicationRole=COD1,COD2` — el árbol de menú real ya filtrado y armado (equivalente a `FGetSiteMap`), de solo lectura.
- `GET/POST /site-map-roles` (`PATCH /:id/state`, sin `update`) — `SSiteMapRole`, concesión rol→ítem de menú. Único real por (`IdeSiteMap`, `IdeApplicationRole`) — se valida antes de insertar. Sin `update` porque es una concesión de acceso: se otorga o se retira, no se edita.

Todos los `POST`/`PATCH` de `CommonCatalogsModule`, `I18nModule` y `SetupModule` requieren rol `ADMIN`, igual que `FieldCatalogModule`.

El resto del alcance original de este servicio ya está cubierto por los tres módulos de arriba más `FieldCatalogModule`/`AttributeEngineModule`.

## Cómo correrlo

```bash
cp services/reference-data-service/.env.example services/reference-data-service/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm run start:reference-data
```

O en modo watch: `npm run start:reference-data:watch`.
