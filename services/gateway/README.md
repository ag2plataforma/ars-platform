# gateway

Sustituye a: `ag2servicegateway` (rediseñado).

Alcance: único punto de entrada real para `ag2backofficewebapp` y `ag2salewebapp`, con agregación de respuestas cuando haga falta y propagación de autenticación.

A diferencia del original, este gateway debe quedar efectivamente conectado a ambos frontends desde el principio (ver `docs/00-arquitectura.md` §2 y §6). Sin `PrismaModule`: a diferencia de los demás servicios, un BFF no tiene su propio modelo de datos — enruta y agrega respuestas de los otros servicios, no consulta Postgres directamente.

## Estado actual

Scaffold minimo (sin `PrismaModule` — ver nota abajo), siguiendo exactamente la misma plantilla que `services/iam-service`/`services/product-rating-service`: `ConfigModule` con ruta absoluta al `.env` propio, guard JWT global (`AuthModule` de `@ars-platform/shared-common` — este servicio no emite tokens, solo los verifica) y `GET /health` (`@Public()`, no requiere token). Sin lógica de negocio todavía — eso llega en su fase correspondiente (ver `docs/02-roadmap.md`).

## Cómo correrlo

```bash
cp services/gateway/.env.example services/gateway/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm run start:gateway
```

O en modo watch: `npm run start:gateway:watch`.
