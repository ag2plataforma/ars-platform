# ADR-0001 — Arquitectura objetivo de ARS Platform

Fecha: 2026-09-14
Estado: Aceptado (decisiones tomadas en conjunto con Ruben, sujeto a revisión en cada fase)

## Contexto

El sistema actual (`ARS` v1) está compuesto por ~20 repositorios independientes en LoopBack 4 (19 en Node, 1 en Python/Flask), dos frontends Angular 16 sin gateway común, y una base de datos Postgres de 130 tablas cuya lógica de negocio real vive en 44 funciones PL/pgSQL. El detalle completo de ese diagnóstico está en el propio historial de decisiones del proyecto; el hallazgo relevante para esta ADR es que la fragmentación en 20 repos con código duplicado es la causa principal de la dificultad de mantenimiento para un solo desarrollador, más que la elección de framework.

## Decisiones

### 1. Framework backend: NestJS (Node.js/TypeScript)

Se descarta .NET (propuesta inicial) a favor de NestJS por continuidad de lenguaje con el frontend Angular (menos cambio de contexto, DTOs compartibles) y porque el patrón de arquitectura modular por decoradores de Nest es prácticamente el mismo que Angular, reduciendo la curva de aprendizaje.

### 2. Topología: microservicios consolidados (no monolito, no 20 repos)

De los ~20 servicios actuales se consolida en 7 servicios de negocio + 1 gateway (BFF), agrupados por dominio real en vez de por conveniencia histórica:

| Servicio nuevo | Sustituye/agrupa (v1) | Notas |
|---|---|---|
| `iam-service` | ag2authmanager + core-iam-service | Hoy duplicados; se consolida en uno solo |
| `party-service` | ag2personmanager + ag2consentmanager + ag2commercialmanager | Personas, consentimiento GDPR, brokers |
| `reference-data-service` | core-common-data-service + ag2customattributesmanager + ag2translatormanager + ag2setupmanager + ag2flowmanager | Catálogos, atributos personalizables, i18n, setup, flujos configurables |
| `product-rating-service` | ag2productmanager + ag2ratemanager | Aquí vive el motor de reglas de tarificación (ver ADR de motor de reglas más abajo) |
| `underwriting-service` | ag2quotemanager + ag2contractmanager-1 | El núcleo más grande y crítico (cotización + contratación) |
| `claims-service` | ag2claimmanager | Hoy sin implementar en el frontend backoffice; IA se incorpora en Fase 4 |
| `billing-service` | ag2paymentgateway + lógica de recibos | |
| `gateway` | ag2servicegateway (rediseñado) | Único punto de entrada real para ambos frontends — hoy ninguno lo usa |

`ag2filemanager` y `ag2-printer-api` (Python) se evalúan en Fase 2: el generador de documentos en Python funciona y no es prioritario reescribirlo; puede quedar como microservicio independiente.

Un servicio nuevo, `social-impact-service`, se añade en Fase 3 para el motor de impacto social (cálculo SIP/CFP/SP y ajuste dinámico de primas), deliberadamente separado del core asegurador para poder iterarlo rápido.

### 3. Librería compartida real

`packages/shared-common` reemplaza el patrón que ya existía en `ins-ars-shared-common` (buena idea, mal ejecutada — no se reutilizaba de forma consistente). Contiene: máquina de estados genérica, motor de reglas de cálculo, interceptor de auditoría, utilidades de autenticación. Todos los servicios dependen de este paquete en vez de copiar archivos.

### 4. Motor de negocio: se saca de PL/pgSQL

La lógica crítica (máquina de estados `SStateRule`, motor de fórmulas `SCalculationRule`) se reimplementa en TypeScript dentro de `shared-common` y `product-rating-service`, eliminando el uso de SQL dinámico (`EXECUTE`) por un evaluador de expresiones seguro. El modelo de datos de configuración (`SStateRule`, `SCalculationRule`, `SRateTable`, etc.) se conserva — es un buen diseño, solo cambia el intérprete. Detalle completo en `01-especificacion-motor-negocio-actual.md`.

### 5. Base de datos: se mantiene Postgres

Con JSONB para atributos personalizables (ya se usaba así). Se evalúa en Fase 1 si dividir el esquema `entity` por servicio o mantenerlo compartido durante la transición.

### 6. Comunicación entre servicios

REST síncrono a través del `gateway` para todo lo que consumen los frontends. Se añade un bus de eventos ligero (a evaluar: NATS) solo cuando haga falta de verdad (recálculo de prima por impacto social, flujo asíncrono de IA en siniestros) — no desde el día uno.

### 7. Despliegue

Oracle Cloud Free Tier (instancia Ampere A1 ARM) + Coolify, sin coste de infraestructura. Cola de trabajos en background basada en Postgres (evita añadir Redis/RabbitMQ como pieza adicional mientras no sea necesario).

### 8. Frontend

Se mantiene Angular (actualizar a la última versión estable) para backoffice y venta. Unificar sobre una sola librería de UI (a decidir en Fase 2 — hoy están mezcladas PrimeNG y Material+Bootstrap). App móvil del cliente vía Capacitor sobre la misma base Angular, no una app nativa separada, salvo que el negocio lo justifique más adelante.

## Consecuencias

- Menos piezas que operar (7 servicios + gateway vs. 20 repos), pero cada servicio es más grande y con más responsabilidad — requiere disciplina de módulos internos bien separados dentro de cada servicio NestJS.
- La migración del motor de negocio (§4) es el trabajo de mayor riesgo del proyecto — requiere validación cuidadosa contra el comportamiento actual antes de dar de baja las funciones PL/pgSQL.
- `underwriting-service` concentra mucha complejidad (cotización + contratación); si crece demasiado, queda como candidato a dividirse en dos servicios más adelante — la separación en `packages/shared-common` ya deja esa puerta abierta sin reescritura mayor.
