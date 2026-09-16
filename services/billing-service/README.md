# billing-service

Sustituye a: `ag2paymentgateway` + la lógica de recibos hoy repartida entre `FReceipt`, `FReceipt_GetNumber` y `FMovementConcept`.

Alcance: recibos (`TReceipt`, `TReceiptDetail`), periodos de facturación (`TContractBilling`), y el cálculo de comisiones por árbol de canal (`SCommissionTree`/`SCommissionTable`/`SCommission`) hoy dentro de `FReceipt`.

## Estado actual

Scaffold minimo, siguiendo exactamente la misma plantilla que `services/iam-service`/`services/product-rating-service`: `ConfigModule` con ruta absoluta al `.env` propio, guard JWT global (`AuthModule` de `@ars-platform/shared-common` — este servicio no emite tokens, solo los verifica) y `GET /health` (`@Public()`, no requiere token). Sin lógica de negocio todavía — eso llega en su fase correspondiente (ver `docs/02-roadmap.md`).

## Cómo correrlo

```bash
cp services/billing-service/.env.example services/billing-service/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm run start:billing
```

O en modo watch: `npm run start:billing:watch`.
