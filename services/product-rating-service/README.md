# product-rating-service

Productos, coberturas, tarifas y el **motor de reglas de cálculo**. Sustituye a `ag2productmanager` + `ag2ratemanager` (v1).

Scaffoldeado siguiendo exactamente la misma plantilla que `services/iam-service` (mismo `tsconfig.build.json`/`nest-cli.json`, mismo patrón de `ConfigModule.forRoot` con ruta absoluta, mismo guard JWT global vía `AuthModule` de `@ars-platform/shared-common`).

## Estado actual

- `GET /health` — salud del servicio (`@Public()`, no requiere token).
- **Motor de reglas de cálculo conectado a Postgres real (validado end-to-end)** (`@ars-platform/shared-common`'s `RulesEngineService`, implementación real en `@ars-platform/database` — ver `docs/01-especificacion-motor-negocio-actual.md`, §3). Endpoints de prueba, protegidos por el guard JWT (no son API de negocio, se retiran cuando haya endpoints reales de cotización/contratación que los usen, igual que pasó con `/state-machine/*` en `iam-service`):
  - `GET /rules-engine/applicable-rules?ideCoveragePlan=<uuid>&ideProduct=<uuid>&idePlanProductRisk=<uuid>` — reglas aplicables por la jerarquía Producto>PlanProductRisk>CoveragePlan, ordenadas por `Order`.
  - `POST /rules-engine/evaluate` — evalúa la cadena completa para una cobertura:
    ```json
    {
      "ideCoveragePlan": "<uuid>",
      "ideProduct": "<uuid opcional>",
      "idePlanProductRisk": "<uuid opcional>",
      "origin": "Quote",
      "ideOriginRisk": "<uuid de TQuoteRisk>",
      "ideCoverageOrMovement": "<uuid de TQuoteCoverage>"
    }
    ```
- **CRUD real de los 8 catálogos "simples"** que hacen falta para configurar `SProduct`/`SCoverage`/`SCoveragePlan` sin tocar la base de datos a mano — reemplaza lo que hasta ahora resolvía `db:seed-example-rules` a mano. Todos comparten la misma forma (`CodX` único, `DesX`, estado) vía una clase genérica (`CatalogCrudService`, ver `src/catalogs/catalog-crud.service.ts`); lectura abierta a cualquier usuario autenticado, creación/edición/cambio de estado restringidos a `@Roles('ADMIN')`:
  - `GET|POST /risk-levels`, `GET|PATCH /risk-levels/:id`, `PATCH /risk-levels/:id/state` — `SRiskLevel` (jerárquico, admite `codRiskLevelParent`).
  - `GET|POST /risks`, `GET|PATCH /risks/:id`, `PATCH /risks/:id/state` — `SRisk` (requiere `codRiskLevel`).
  - `GET|POST /risk-types`, `GET|PATCH /risk-types/:id`, `PATCH /risk-types/:id/state` — `SRiskType`.
  - `GET|POST /currencies`, `GET|PATCH /currencies/:id`, `PATCH /currencies/:id/state` — `SCurrency` (requiere `symbolCurrency`).
  - `GET|POST /insurance-areas`, `GET|PATCH /insurance-areas/:id`, `PATCH /insurance-areas/:id/state` — `SInsuranceArea` (jerárquico, admite `codInsuranceAreaParent`).
  - `GET|POST /insurance-lines`, `GET|PATCH /insurance-lines/:id`, `PATCH /insurance-lines/:id/state` — `SInsuranceLine` (requiere `codInsuranceArea`).
  - `GET|POST /deductible-types`, `GET|PATCH /deductible-types/:id`, `PATCH /deductible-types/:id/state` — `SDeductibleType`.
  - `GET|POST /limit-types`, `GET|PATCH /limit-types/:id`, `PATCH /limit-types/:id/state` — `SLimitType`.
- **CRUD real de las 7 entidades "de dominio"** — la jerarquía completa de configuración de un producto, y la respuesta definitiva a "cómo se registra una fórmula nueva" (reemplaza a `db:seed-example-rules`, que queda solo como ejemplo/semilla rápida). Mismo criterio de permisos que los catálogos (lectura abierta, escritura `@Roles('ADMIN')`). Orden para dar de alta un producto completo:
  1. `GET|POST /products`, `GET|PATCH /products/:id`, `PATCH /products/:id/state` — `SProduct` (requiere `codInsuranceArea`, `codCurrency`).
  2. `GET|POST /risk-products`, `GET|PATCH /risk-products/:id`, `PATCH /risk-products/:id/state` — `SRiskProduct` (requiere `codProduct`, `codRisk`, `codRiskType`).
  3. `GET|POST /plan-products`, `GET|PATCH /plan-products/:id`, `PATCH /plan-products/:id/state` — `SPlanProduct` (requiere `codProduct`).
  4. `GET|POST /plan-product-risks`, `GET|PATCH /plan-product-risks/:id`, `PATCH /plan-product-risks/:id/state` — `SPlanProductRisk` (une plan + riesgo de producto vía `codPlanProduct`/`codRiskProduct`; filtrable por ambos en el `GET` de lista).
  5. `GET|POST /coverages`, `GET|PATCH /coverages/:id`, `PATCH /coverages/:id/state` — `SCoverage` (requiere `codInsuranceLine`; independiente de la jerarquía de producto).
  6. `GET|POST /coverage-plans`, `GET|PATCH /coverage-plans/:id`, `PATCH /coverage-plans/:id/state` — `SCoveragePlan` (la configuración de negocio de una cobertura dentro de un plan: deducible, límite, rangos de monto/tasa/prima, obligatoriedad, período de carencia; requiere el `idePlanProductRisk` del paso 4 y `codCoverage`; filtrable por ambos).
  7. `GET|POST /calculation-rules`, `GET|PATCH /calculation-rules/:id`, `PATCH /calculation-rules/:id/state` — `SCalculationRule` (requiere `ideCoveragePlan` del paso 6, `codConcept`, `order` y `formula: { if, then, else }`; `codProduct`/`idePlanProductRisk` opcionales para el comodín de jerarquía — ver `docs/01-especificacion-motor-negocio-actual.md`, §3; filtrable por `ideCoveragePlan`).
- **CRUD real de tablas de tarifa (`SRateTable`/`SRateFactor`/`SRateValue`)** — la configuración multidimensional de tarifas (hasta 5 factores por tabla). Mismo criterio de permisos (lectura abierta, escritura `@Roles('ADMIN')`):
  - `GET|POST /rate-tables`, `GET|PATCH /rate-tables/:id`, `PATCH /rate-tables/:id/state` — `SRateTable` (el "nombre" de la tabla, ej. "Tarifa por edad y zona"; el `GET` de detalle trae sus `SRateFactor` ya ordenados por `numOrder`).
  - `GET|POST /rate-factors`, `GET|PATCH /rate-factors/:id` — `SRateFactor` (define qué representa cada columna `Factor1`..`Factor5`, ej. Factor1="EDAD"; requiere `codRateTable` y `numOrder` entre 1 y 5, sin repetir posición dentro de la misma tabla; sin `/state`, no tiene flujo propio de activar/desactivar; filtrable por `codRateTable`).
  - `GET|POST /rate-values`, `GET|PATCH /rate-values/:id`, `PATCH /rate-values/:id/state` — `SRateValue` (una fila concreta: hasta 5 valores de factor, vigencia `tstInit`/`tstEnd` y el `value` resultante; filtrable por `codRateTable`).
  - `GET /rate-values/lookup?codRateTable=...&factor1=...&factor2=...` — **equivalente exacto a la función legacy `FGetRateValue`**, confirmado contra su código fuente real en Postgres (`ag2ars`/`entity`/`temporal`, las tres copias idénticas). Semántica exacta (no una reinterpretación):
    - `codRateTable` y `factor1` son obligatorios; `factor1` debe calzar exacto contra la fila (el original NO admite comodín en esta posición).
    - `factor2`..`factor5` son opcionales, y el comodín es del lado de quien consulta, no de la fila: si se envían, deben calzar exacto; si se omiten, esa dimensión no se filtra en absoluto sin importar qué tenga guardado la fila ahí (así lo hace el `OR pFactorN IS NULL` del original). En la práctica, cada `SRateTable` usa tantos factores como `SRateFactor` tenga configurados, y quien llama solo manda esos.
    - Debe encontrar **exactamente una fila**: 0 o más de 1 son errores de configuración en el original (`no_data_found`/`too_many_rows`, acá `404`/`409`) — no hay ningún criterio de desempate por especificidad, contrario a lo que se podría suponer.
    - **El original NO filtra por vigencia** (`TstInit`/`TstEnd`) pese a que la tabla las tiene — se replicó tal cual, sin agregar ese filtro por cuenta propia. Vale la pena confirmar con el negocio si eso fue intencional o es un vacío heredado antes de construir el flujo real de cotización sobre esto.

  **`FGetRateValue` ya está cableado dentro del motor de reglas.** Una fórmula de `SCalculationRule` puede invocarlo directamente con la misma firma posicional que el original: `FGetRateValue('CODRATETABLE','F1','F2',NULL,NULL,NULL)` (6 argumentos siempre; `NULL` sin comillas para omitir un factor, igual que en SQL). `RulesEngineService` (`@ars-platform/shared-common`) sustituye esa llamada por su valor numérico antes de evaluar la expresión, usando el mismo `PrismaRateValueResolver` (`@ars-platform/database`) que expone `GET /rate-values/lookup` — una sola implementación para ambos. **Ojo al escribir una fórmula:** un custom field usado como argumento debe ir entre comillas igual que un literal (ej. `FGetRateValue('TARIFA_EDAD', 'EDAD', NULL, NULL, NULL, NULL)`), porque la sustitución de custom fields es texto plano y preserva las comillas que ya rodeen al identificador. Verificado (sin BD) en `npm run verify:rules-engine` de `packages/shared-common`.

  Con esto, `product-rating-service` cubre el 100% de lo documentado en `docs/01-especificacion-motor-negocio-actual.md` §3 (máquina de estados, motor de reglas y tablas de tarifa, con `FGetRateValue` invocable desde una fórmula) a nivel CRUD + funciones de consulta.
- Todas las rutas salvo `/health` exigen `Authorization: Bearer <token>` — el token lo emite `iam-service` (`POST /auth/login`); este servicio solo lo **verifica** (mismo `JWT_SECRET`, ver `.env.example`).

**Nota importante:** la migración de `ars_platform` trajo la estructura de las 130 tablas pero ninguna fila de configuración de negocio — con el CRUD de arriba ya se puede cargar un producto completo (catálogos + jerarquía + reglas de cálculo) por API. `npm run db:seed-example-rules` (desde la raíz del repo) sigue disponible como atajo rápido para tener datos de ejemplo sin pasar por los 7 pasos a mano (códigos `SEED_...`, claramente de prueba; ver también `npm run verify:rules-engine` en `packages/shared-common` para la verificación del motor de reglas en memoria, sin BD).

Pendiente para Fase 2 (ver `docs/02-roadmap.md`):

- Equivalente a `FGetRateValue` (búsqueda del valor de tarifa aplicable dados los factores reales de una cotización) — el CRUD de `SRateTable`/`SRateFactor`/`SRateValue` ya está, falta confirmar el criterio de desempate exacto contra la función original (ver nota arriba y `find-legacy-function.js`).
- Retirar los endpoints de prueba `/rules-engine/*` cuando `underwriting-service` (u otro consumidor real) use `RulesEngineService` directamente.

## Cómo correrlo

```bash
cp .env.example .env   # completar JWT_SECRET con el MISMO valor que usa iam-service
npm install
npm run db:seed-example-rules   # (una vez, desde la raíz del repo) crea datos de prueba para /rules-engine/*
npm run start:dev
```

### Probar tablas de tarifa con datos reales

`npm run db:seed-example-rate-table` (desde la raíz del repo) crea una tabla de tarifa de ejemplo (`SEED_TARIFA_EDAD_ZONA`, factores EDAD/ZONA) y corre varios lookups reales contra Postgres con la misma lógica de `PrismaRateValueResolver` — incluye el caso de "factor2 omitido con 2 filas que calzan" para confirmar en vivo que no hay desempate por especificidad, solo falla. Al final imprime un `GET /rate-values/lookup` de ejemplo y la llamada equivalente para usar dentro de una fórmula (`FGetRateValue('SEED_TARIFA_EDAD_ZONA','30','NORTE',NULL,NULL,NULL)`).

### Extraer el código fuente de una función legacy de Postgres

Para replicar fielmente lógica legacy (ej. `FGetRateValue`) hace falta ver la definición original en `entity` u otro esquema legacy. El script busca por patrón en TODOS los esquemas de la base y dumpea el `CREATE FUNCTION` completo:

```bash
node packages/database/scripts/find-legacy-function.js rate
# o, más específico:
node packages/database/scripts/find-legacy-function.js FGetRateValue
```


### Probar el motor de reglas

```bash
# 1. login contra iam-service para obtener un token
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userName":"admin","password":"<la que corresponda>"}'

# 2. reglas aplicables a una cobertura (requiere que exista configuración real)
curl "http://localhost:3002/rules-engine/applicable-rules?ideCoveragePlan=<uuid>" \
  -H "Authorization: Bearer <token>"

# 3. evaluar la cadena completa
curl -X POST http://localhost:3002/rules-engine/evaluate \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"ideCoveragePlan":"<uuid>","origin":"Quote","ideOriginRisk":"<uuid>","ideCoverageOrMovement":"<uuid>"}'
```
