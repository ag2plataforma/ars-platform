# claims-service (pendiente de scaffolding)

Sustituye a: `ag2claimmanager`.

Alcance: siniestros (`TClaim`, `TClaimFile`, `TClaimOperation`, `TClaimRequirement`, `TClaimRisk`). Nota importante: en el backoffice v1 el módulo de siniestros existe solo como cascarón (routing sin componentes) — no hay UI real que auditar como referencia de comportamiento esperado, a diferencia de cotización/contratación.

La integración de IA para triage/priorización llega en Fase 4 (ver `docs/02-roadmap.md`).

Se scaffoldeará siguiendo exactamente la misma estructura que `services/iam-service` cuando toque su turno.
