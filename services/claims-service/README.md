# claims-service

Sustituye a: `ag2claimmanager`.

Alcance: siniestros (`TClaim`, `TClaimFile`, `TClaimOperation`, `TClaimRequirement`, `TClaimRisk`).

Nota importante: en el backoffice v1 el módulo de siniestros existe solo como cascarón (routing sin componentes) — no hay UI real que auditar como referencia de comportamiento esperado, a diferencia de cotización/contratación. La integración de IA para triage/priorización llega en Fase 4 (ver `docs/02-roadmap.md`).

## Estado actual

Scaffold minimo, siguiendo exactamente la misma plantilla que `services/iam-service`/`services/product-rating-service`: `ConfigModule` con ruta absoluta al `.env` propio, guard JWT global (`AuthModule` de `@ars-platform/shared-common` — este servicio no emite tokens, solo los verifica) y `GET /health` (`@Public()`, no requiere token). Sin lógica de negocio todavía — eso llega en su fase correspondiente (ver `docs/02-roadmap.md`).

## Cómo correrlo

```bash
cp services/claims-service/.env.example services/claims-service/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm run start:claims
```

O en modo watch: `npm run start:claims:watch`.
