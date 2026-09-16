# party-service (pendiente de scaffolding)

Sustituye a: `ag2personmanager` + `ag2consentmanager` + `ag2commercialmanager`.

Alcance: personas (`TPerson`, `TAddress`, `TContactData`), consentimiento GDPR (`SConsent`, `TPersonConsent` — equivalente a `FConsent`), brokers/comercial (`TBroker`, comisiones por canal `SCommission*`).

Se scaffoldeará siguiendo exactamente la misma estructura que `services/iam-service` cuando toque su turno (ver `docs/02-roadmap.md`, Fase 1/2).
