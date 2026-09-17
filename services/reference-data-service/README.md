# reference-data-service

Sustituye a: `core-common-data-service` + `ag2customattributesmanager` + `ag2translatormanager` + `ag2setupmanager` + `ag2flowmanager`.

Alcance: catálogos comunes (país, moneda, idioma, género, profesión...), atributos personalizables (`SFieldDictionary`, `SAttribute`, `SModelAttribute` — equivalente a `FGetCustomAttributes`), i18n (`STranslator`, `STextContent`), setup inicial (`SApplication`, `SSiteMap`), y flujos de proceso configurables (`SFlowStep`, `SProcessFlow` — equivalente a `FFlowStep`, `FGetNextFlowStep`, `FPInstanceFlow`).

## Estado actual

Scaffold base igual al resto de servicios (`ConfigModule` con ruta absoluta al `.env` propio, guard JWT global de `@ars-platform/shared-common` — este servicio no emite tokens, solo los verifica — y `GET /health` público), más un primer módulo de negocio real:

### `FieldCatalogModule` — `SFieldDictionary` / `SFieldValue`

CRUD completo del diccionario de campos y sus valores posibles (mismo patrón `CatalogCrudService` que usa `product-rating-service`, ahora en `@ars-platform/shared-common` porque ya lo comparten dos servicios). Estas dos tablas son las que consumen los factores de tarifa (`SRateFactor.IdeFieldDictionary`, ver `product-rating-service`) y la sustitución de custom fields dentro de una fórmula de `SCalculationRule` (`substituteFieldTokens` en `RulesEngineService`).

- `GET /field-dictionary`, `GET /field-dictionary/:id`, `POST /field-dictionary` (`ADMIN`), `PATCH /field-dictionary/:id` (`ADMIN`), `PATCH /field-dictionary/:id/state` (`ADMIN`).
- `GET /field-values`, `GET /field-values/:id`, `POST /field-values` (`ADMIN`, requiere `codFieldDictionary` de un campo existente), `PATCH /field-values/:id` (`ADMIN`), `PATCH /field-values/:id/state` (`ADMIN`).

**Deliberadamente afuera de este módulo** — y de esta fase — el motor de atributos personalizables/flujos configurables completo (`SAttribute`, `SAttributeProperty`, `SModelAttribute`, enlazado con `SEntity`/`SFlowStep`, y consumido en runtime vía el JSON `RiskAttributeValue` de `TQuoteRisk`/`TFileRisk` — ver `PrismaAttributeValueResolver` en `@ars-platform/database`). Es una pieza bastante más grande e interconectada que el diccionario de campos; implementarla bien exige su propia investigación primero (mismo criterio que se usó con `FGetRateValue`), ver `docs/02-roadmap.md`.

El resto del alcance de este servicio (i18n, setup, flujos de proceso) sigue sin implementar.

## Cómo correrlo

```bash
cp services/reference-data-service/.env.example services/reference-data-service/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm run start:reference-data
```

O en modo watch: `npm run start:reference-data:watch`.
