# reference-data-service (pendiente de scaffolding)

Sustituye a: `core-common-data-service` + `ag2customattributesmanager` + `ag2translatormanager` + `ag2setupmanager` + `ag2flowmanager`.

Alcance: catálogos comunes (país, moneda, idioma, género, profesión...), atributos personalizables (`SFieldDictionary`, `SAttribute`, `SModelAttribute` — equivalente a `FGetCustomAttributes`), i18n (`STranslator`, `STextContent`), setup inicial (`SApplication`, `SSiteMap`), y flujos de proceso configurables (`SFlowStep`, `SProcessFlow` — equivalente a `FFlowStep`, `FGetNextFlowStep`, `FPInstanceFlow`).

Se scaffoldeará siguiendo exactamente la misma estructura que `services/iam-service` cuando toque su turno (ver `docs/02-roadmap.md`, Fase 1/2).
