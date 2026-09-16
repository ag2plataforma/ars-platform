# party-service

Sustituye a: `ag2personmanager` + `ag2consentmanager` + `ag2commercialmanager`.

Alcance: personas (`TPerson`, `TAddress`, `TContactData`), consentimiento GDPR (`SConsent`, `TPersonConsent` — equivalente a `FConsent`), brokers/comercial (`TBroker`, comisiones por canal `SCommission*`).

## Estado actual

Scaffold minimo, siguiendo exactamente la misma plantilla que `services/iam-service`/`services/product-rating-service`: `ConfigModule` con ruta absoluta al `.env` propio, guard JWT global (`AuthModule` de `@ars-platform/shared-common` — este servicio no emite tokens, solo los verifica) y `GET /health` (`@Public()`, no requiere token). Sin lógica de negocio todavía — eso llega en su fase correspondiente (ver `docs/02-roadmap.md`).

## Cómo correrlo

```bash
cp services/party-service/.env.example services/party-service/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm run start:party
```

O en modo watch: `npm run start:party:watch`.
