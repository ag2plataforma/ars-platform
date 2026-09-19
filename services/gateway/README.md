# gateway

Sustituye a: `ag2servicegateway` (rediseñado).

Alcance: único punto de entrada real para `ag2backofficewebapp` y `ag2salewebapp`, con agregación de respuestas cuando haga falta y propagación de autenticación.

A diferencia del original, este gateway debe quedar efectivamente conectado a ambos frontends desde el principio (ver `docs/00-arquitectura.md` §2 y §6). Sin `PrismaModule`: a diferencia de los demás servicios, un BFF no tiene su propio modelo de datos — enruta y agrega respuestas de los otros servicios, no consulta Postgres directamente.

## Estado actual

`ConfigModule` con ruta absoluta al `.env` propio, guard JWT global (`AuthModule` de `@ars-platform/shared-common` — este servicio no emite tokens, solo los verifica/propaga) y `GET /health` (`@Public()`, no requiere token) -- mismo scaffold que el resto de servicios.

### `ProxyModule` — único punto de entrada real

Primera versión real del gateway, con alcance explícito decidido con el usuario: **proxy simple 1:1 por servicio, sin agregación**. No hay comportamiento legado que replicar acá -- confirmado contra `docs/00-arquitectura.md` que el sistema v1 nunca tuvo un gateway común de verdad (`ag2servicegateway` existía pero los frontends le pegaban directo a cada servicio), así que esto es diseño nuevo, no una migración.

Un controller por servicio de negocio (`services/gateway/src/proxy/`), cada uno reenviando su prefijo tal cual al servicio real correspondiente vía `ProxyService`:

| Prefijo en el gateway | Servicio real | Variable de entorno |
|---|---|---|
| `/iam/*` | `iam-service` | `IAM_SERVICE_URL` |
| `/party/*` | `party-service` | `PARTY_SERVICE_URL` |
| `/reference-data/*` | `reference-data-service` | `REFERENCE_DATA_SERVICE_URL` |
| `/product-rating/*` | `product-rating-service` | `PRODUCT_RATING_SERVICE_URL` |
| `/underwriting/*` | `underwriting-service` | `UNDERWRITING_SERVICE_URL` |
| `/claims/*` | `claims-service` | `CLAIMS_SERVICE_URL` |
| `/billing/*` | `billing-service` | `BILLING_SERVICE_URL` |

`ProxyService` reenvía método/query/body/headers (incluido `Authorization`) usando el `fetch` global de Node 20 -- sin agregar `axios`/`@nestjs/axios` como dependencia nueva. El guard JWT global del gateway protege todo por defecto; cada controller marca `@Public()` solo en lo que el servicio real también expone público: `GET /health` de los 7, más `POST auth/login`/`auth/forgot-password`/`auth/reset-password` de `iam` (sin login público no se podría obtener un token para empezar). Los errores del downstream (4xx/5xx) se propagan con su status y body reales, tal cual; si el servicio de destino no responde, el gateway devuelve `503` con un mensaje claro en vez de colgarse.

**Verificado end-to-end** (no solo `tsc`/`nest build`) con dos servidores mock y el gateway real corriendo juntos localmente: rutas públicas sin token, rutas protegidas rechazadas sin token (`401`) y reenviadas con el `Authorization` correcto cuando sí hay token, prefijo con guion (`reference-data`) resuelto bien, query string y body JSON reenviados íntegros, error `4xx` del downstream propagado tal cual, y `503` cuando el servicio de destino está caído.

**Deliberadamente afuera de esta versión**: agregación de respuestas de varios servicios en una sola (BFF real) -- se decide cuando una pantalla real de alguno de los dos frontends la necesite, no antes; y upload de archivos (ningún servicio real expone esa operación todavía).

## Cómo correrlo

```bash
cp services/gateway/.env.example services/gateway/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm run start:gateway
```

O en modo watch: `npm run start:gateway:watch`.
