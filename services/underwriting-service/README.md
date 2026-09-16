# underwriting-service

Sustituye a: `ag2quotemanager` + `ag2contractmanager-1`.

Alcance: cotización (`TQuote*`, equivalente a `FQuote`, `FQuoteRiskPlan`, `FQuoteCoverage`, `FGetQuoteSummary`) y contratación (`TContract*`, equivalente a `FContract`, `FContractOperation`, `FContractBilling`, `FCoverageMovement`, `FRiskCoverage`).

Es el trabajo de mayor riesgo del proyecto — ver `docs/01-especificacion-motor-negocio-actual.md` §4 para el orden exacto de la cascada de creación de contrato que hay que preservar. Candidato a dividirse en dos servicios más adelante si crece demasiado (quote vs. contract) — no se hace ahora para no anticipar una separación que quizá no haga falta.

## Estado actual

Scaffold minimo, siguiendo exactamente la misma plantilla que `services/iam-service`/`services/product-rating-service`: `ConfigModule` con ruta absoluta al `.env` propio, guard JWT global (`AuthModule` de `@ars-platform/shared-common` — este servicio no emite tokens, solo los verifica) y `GET /health` (`@Public()`, no requiere token). Sin lógica de negocio todavía — eso llega en su fase correspondiente (ver `docs/02-roadmap.md`).

## Cómo correrlo

```bash
cp services/underwriting-service/.env.example services/underwriting-service/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm run start:underwriting
```

O en modo watch: `npm run start:underwriting:watch`.
