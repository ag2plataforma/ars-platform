# reference-data-service

Sustituye a: `core-common-data-service` + `ag2customattributesmanager` + `ag2translatormanager` + `ag2setupmanager` + `ag2flowmanager`.

Alcance: catálogos comunes (país, moneda, idioma, género, profesión...), atributos personalizables (`SFieldDictionary`, `SAttribute`, `SModelAttribute` — equivalente a `FGetCustomAttributes`), i18n (`STranslator`, `STextContent`), setup inicial (`SApplication`, `SSiteMap`), y flujos de proceso configurables (`SFlowStep`, `SProcessFlow` — equivalente a `FFlowStep`, `FGetNextFlowStep`, `FPInstanceFlow`).

## Estado actual

Scaffold minimo, siguiendo exactamente la misma plantilla que `services/iam-service`/`services/product-rating-service`: `ConfigModule` con ruta absoluta al `.env` propio, guard JWT global (`AuthModule` de `@ars-platform/shared-common` — este servicio no emite tokens, solo los verifica) y `GET /health` (`@Public()`, no requiere token). Sin lógica de negocio todavía — eso llega en su fase correspondiente (ver `docs/02-roadmap.md`).

## Cómo correrlo

```bash
cp services/reference-data-service/.env.example services/reference-data-service/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm run start:reference-data
```

O en modo watch: `npm run start:reference-data:watch`.
