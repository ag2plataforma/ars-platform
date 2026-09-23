# social-impact-service

Sustituye a: nada -- servicio nuevo por completo, sin equivalente en v1 (ver `docs/02-roadmap.md`, Fase 3 — Impacto Social).

Alcance: cálculo de SIP (puntos de impacto social), CFP (huella de carbono) y SP (sostenibilidad), y el ajuste dinámico de primas resultante, para los productos que decidan participar.

## Estado actual — Etapa 2 (fórmulas reales)

Decisión explícita del usuario (2026-09-22): fórmulas propias (no una API externa de "score de impacto social", que no existe gratis para individuos -- ver investigación en el roadmap) para SIP/SP, apoyadas en `emissions.dev` (nivel gratis) para el componente eléctrico de la huella de carbono. Auto y vuelos usan factores públicos estables calculados localmente, sin llamada externa.

- **`SSocialImpactConfig`** (Etapa 1, sin cambios): qué productos participan de Impacto Social. Una fila por producto (`IdeProduct` único), `ConfigJSON` (placeholder de Etapa 1, ya no se usa para el cálculo real, solo para saber SI el producto participa) e `IdeState` (Activo/Inactivo).
- **`SocialImpactConfigModule`** (Etapa 1, sin cambios): CRUD real de `SSocialImpactConfig` -- `GET/POST /social-impact-config`, `GET/PATCH /social-impact-config/:id`, `PATCH /social-impact-config/:id/state`.
- **`SSocialImpactScoring`** (tabla nueva, fila única global, `packages/database/scripts/setup-social-impact-scoring-tables.js`): la fórmula real completa en `FormulaJSON` -- tramos de CFP (kg CO2/año -> puntos), factores de auto/vuelos, país por defecto para electricidad, pesos de SIP (puntos por hora de voluntariado, bonus por causa recurrente/donaciones), pesos del score combinado, y tramos de score combinado -> % de ajuste de prima. Mismo patrón que `SCalculationRule.FormulaJSON`: fórmula real como JSON, editable sin deploy.
- **`TQuoteSocialImpactAnswer`** (tabla nueva, en `underwriting-service`): una fila por cotización con las respuestas crudas del formulario (`AnswersJSON`) y el resultado ya calculado (kg CO2, score CFP, score SIP, score combinado, % de ajuste) -- evita repetir la llamada a `emissions.dev` cada vez que se recalcula el precio.
- **`SocialImpactScoringModule`** (este servicio, nuevo): `GET/PATCH /social-impact-scoring` (config de la fórmula, `PATCH` solo `ADMIN`) y `POST /social-impact-score` (calcula CFP/SIP/score combinado/% de ajuste a partir de las respuestas del formulario -- cálculo puro, no persiste nada, quien llama decide si guarda el resultado).
- **`EmissionsDevClient`**: cliente de la API externa `emissions.dev`, usado SOLO para el componente eléctrico de la huella (la intensidad de red varía mucho por país). Degradación elegante: si `EMISSIONS_DEV_API_KEY` no está configurada o la llamada falla, ese componente queda en 0 kg CO2 y el resultado marca `electricityDataAvailable: false`, en vez de romper todo el cálculo.
- **`underwriting-service`**: nuevo paso del wizard de Cotización -- `POST /quotes/:id/social-impact-answers` valida que el producto participe (`SocialImpactConfigResolver`, EN PROCESO vía Prisma, sin cambios respecto a Etapa 1), llama a este servicio por HTTP real (`SocialImpactHttpClient`, reenviando el mismo `Authorization` del usuario) y persiste el resultado en `TQuoteSocialImpactAnswer`. `POST /quotes/:id/price` y `GET /quotes/:id` siguen exponiendo `socialImpact` en la respuesta, ahora con tres formas posibles: `{ active: false }` (no participa), `{ active: true, answered: false }` (participa, falta el formulario) o `{ active: true, answered: true, kgCo2Year, cfpScore, sipScore, combinedScore, pctPrimaAdjustment }` (ya calculado).

**Decisión de arquitectura explícita del usuario (2026-09-22) -- llamada HTTP real**: a diferencia de todo lo demás en este proyecto (que comparte el mismo Postgres y se resuelve en proceso vía los puertos de `shared-common`), esta SÍ es una llamada HTTP real entre servicios -- `underwriting-service` llama a `POST /social-impact-score` de este servicio. Primer caso de este tipo en el proyecto. La pregunta barata "¿participa el producto?" se sigue resolviendo en proceso (no vale la pena una llamada HTTP solo para eso).

**Deliberadamente afuera de esta etapa**: el nuevo paso del wizard en `apps/backoffice` (frontend) -- se valida primero el backend completo; SP (sostenibilidad) queda fuera de la fórmula inicial (solo CFP+SIP), a agregar cuando se defina su propio criterio.

**Corregido (23/09/2026)**: la primera versión de `EmissionsDevClient` devolvía `403` -- estaba mal en tres cosas a la vez (método `POST` en vez de `GET`, ruta `/electricity/calculate` en vez de `/electricity/emissions`, parámetros en el body JSON en vez de query string), confirmado contra la documentación pública real. Ya corregido.

## Cómo correrlo

```bash
cp services/social-impact-service/.env.example services/social-impact-service/.env   # completar JWT_SECRET (mismo valor que iam-service) y EMISSIONS_DEV_API_KEY (tu propia cuenta en emissions.dev)
node packages/database/scripts/setup-social-impact-config-table.js       # una sola vez (Etapa 1)
node packages/database/scripts/setup-social-impact-scoring-tables.js     # una sola vez (Etapa 2)
npm run db:pull --workspace=packages/database
npm run db:generate --workspace=packages/database
npm run start:social-impact
```

O en modo watch: `npm run start:social-impact:watch`. `underwriting-service` necesita `SOCIAL_IMPACT_SERVICE_URL` en su propio `.env` (default `http://localhost:3008`, ver su `.env.example`).
