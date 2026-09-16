# gateway (pendiente de scaffolding)

Reemplaza a `ag2servicegateway` — que ya era un BFF funcional (enrutamiento dinámico vía tabla en BD), pero que hoy **ningún frontend usa** (cada app llama directo a cada microservicio vía su propio nginx).

Alcance: único punto de entrada real para `ag2backofficewebapp` y `ag2salewebapp`, con agregación de respuestas cuando haga falta y propagación de autenticación. A diferencia del original, este gateway debe quedar efectivamente conectado a ambos frontends desde el principio (ver `docs/00-arquitectura.md` §2 y §6).

Se scaffoldeará siguiendo exactamente la misma estructura que `services/iam-service` cuando toque su turno.
