# social-impact-service

Sustituye a: nada -- servicio nuevo por completo, sin equivalente en v1 (ver `docs/02-roadmap.md`, Fase 3 — Impacto Social).

Alcance: cálculo de SIP (puntos de impacto social), CFP (huella de carbono) y SP (sostenibilidad), y el ajuste dinámico de primas resultante, para los productos que decidan participar.

## Estado actual — Etapa 1 (andamiaje)

No existen todavía las fórmulas de negocio reales de SIP/CFP/SP (decisión explícita del usuario, 2026-09-22, para no bloquear el trabajo técnico mientras se definen). Esta primera etapa deja construida la arquitectura completa con una fórmula placeholder simple, fácil de reemplazar cuando las fórmulas reales estén definidas:

- **`SSocialImpactConfig`** (tabla nueva, `packages/database/scripts/setup-social-impact-config-table.js`): qué productos participan de Impacto Social. Una fila por producto (`IdeProduct` único), `ConfigJSON` con los parámetros del cálculo (hoy solo `{ pctPrimaAdjustment: number }`, positivo = recargo, negativo = descuento) e `IdeState` (Activo/Inactivo, misma convención de máquina de estados que el resto del sistema).
- **`SocialImpactConfigModule`** (este servicio): CRUD real de `SSocialImpactConfig` -- `GET/POST /social-impact-config`, `GET/PATCH /social-impact-config/:id`, `PATCH /social-impact-config/:id/state`. Reutilizable por un futuro screen de backoffice para decidir qué productos participan.
- **`SocialImpactCalculatorService`** (`@ars-platform/shared-common`): el cálculo en sí. Hoy solo resuelve si el producto participa y devuelve el `pctPrimaAdjustment` placeholder tal cual, sin fórmulas de SIP/CFP/SP reales todavía.
- **`underwriting-service`**: consume `SocialImpactCalculatorService` para exponer el resultado dentro de `POST /quotes/:id/price` (campo `socialImpact` de la respuesta), como información adicional de solo lectura -- **sin acoplar el cálculo base de la cotización al social** (no se toca ningún total de prima real todavía).

**Decisión de arquitectura explícita del usuario (2026-09-22)**: por ahora `underwriting-service` consulta el cálculo EN PROCESO (lee `SSocialImpactConfig` directamente vía Prisma y usa `SocialImpactCalculatorService` de `@ars-platform/shared-common`, mismo patrón que el motor de reglas) -- **no** con una llamada HTTP real a este servicio, para no introducir la complejidad de llamadas entre servicios (timeouts, reintentos, qué pasa si el servicio está caído a mitad de una cotización) sin que hoy exista una razón concreta.

**Pendiente, sin resolver, no bloqueante -- llamada real entre servicios**: cuando haya una razón concreta (por ejemplo, un consumidor externo real como la Store App de Fase 5, o el propio equipo de Impacto Social necesitando desplegar su lógica de forma independiente), reemplazar la lectura en proceso de `underwriting-service` por una llamada HTTP real a este servicio. Este servicio ya expone sus propios endpoints reales desde ahora para eso.

**Deliberadamente afuera de esta etapa**: las fórmulas reales de SIP/CFP/SP, las integraciones con fuentes externas de datos (huella de carbono, voluntariado -- el propio roadmap las marca "a definir"), y cualquier pantalla de backoffice para administrar `SSocialImpactConfig`.

## Cómo correrlo

```bash
cp services/social-impact-service/.env.example services/social-impact-service/.env   # completar JWT_SECRET con el MISMO valor que usa iam-service
node packages/database/scripts/setup-social-impact-config-table.js   # una sola vez, crea la tabla si no existe
npm run start:social-impact
```

O en modo watch: `npm run start:social-impact:watch`.
