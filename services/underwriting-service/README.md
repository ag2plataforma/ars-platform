# underwriting-service (pendiente de scaffolding)

Sustituye a: `ag2quotemanager` + `ag2contractmanager-1` — el núcleo más grande y crítico del sistema (43 modelos / 21 controladores solo en contractmanager v1).

Alcance: cotización (`TQuote*`, equivalente a `FQuote`, `FQuoteRiskPlan`, `FQuoteCoverage`, `FGetQuoteSummary`) y contratación (`TContract*`, equivalente a `FContract`, `FContractOperation`, `FContractBilling`, `FCoverageMovement`, `FRiskCoverage`). Es el trabajo de mayor riesgo del proyecto — ver `docs/01-especificacion-motor-negocio-actual.md` §4 para el orden exacto de la cascada de creación de contrato que hay que preservar.

Candidato a dividirse en dos servicios más adelante si crece demasiado (quote vs. contract) — no se hace ahora para no anticipar una separación que quizá no haga falta.

Se scaffoldeará siguiendo exactamente la misma estructura que `services/iam-service` cuando toque su turno (ver `docs/02-roadmap.md`, Fase 2).
