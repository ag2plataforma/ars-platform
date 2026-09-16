# ARS Platform

Reconstrucción moderna del core de seguros ARS (cotización, emisión y gestión de pólizas), incorporando un motor de **Impacto Social** para ajuste dinámico de primas e IA para gestión de siniestros.

Este repo sustituye a los ~20 repos independientes del sistema anterior (LoopBack 4) por un monorepo con un número consolidado de servicios en **NestJS/TypeScript**, manteniendo el modelo de datos actual (Postgres) con los ajustes necesarios.

## Documentación

Empieza por aquí, en orden:

1. [`docs/00-arquitectura.md`](./docs/00-arquitectura.md) — decisiones de arquitectura y mapa de servicios (viejo → nuevo).
2. [`docs/01-especificacion-motor-negocio-actual.md`](./docs/01-especificacion-motor-negocio-actual.md) — especificación funcional del motor de negocio actual (extraída de las funciones PL/pgSQL), base para no perder reglas de negocio en la migración.
3. [`docs/02-roadmap.md`](./docs/02-roadmap.md) — plan por fases.

## Estructura del monorepo

```
ars-platform/
  packages/
    shared-common/      # Librería compartida real: máquina de estados, motor de reglas, auditoría
  services/
    iam-service/         # Autenticación, usuarios, roles, permisos (referencia/plantilla, ya scaffoldeado)
    party-service/        # Personas, contactos, consentimiento, comercial/brokers
    reference-data-service/ # Catálogos comunes, atributos personalizables, i18n, setup, flujos
    product-rating-service/ # Productos, coberturas, tarifas, motor de reglas de cálculo
    underwriting-service/   # Cotización y contratación (el núcleo más grande)
    claims-service/         # Siniestros
    billing-service/        # Cobros y pagos
    gateway/                 # BFF real, único punto de entrada para los frontends
  docs/
```

Cada servicio nuevo se irá scaffoldeando siguiendo exactamente la misma plantilla que `services/iam-service` (ya funcional). Los que todavía no tienen código tienen un `README.md` con su alcance.

## Cómo levantar el entorno (por ahora, `iam-service` y `product-rating-service`)

Requisitos: Node 20+ (ver `.nvmrc`), npm 10+.

```bash
npm install
npm run db:seed-admin   # (una vez) crea un usuario de prueba en ars_platform
npm run start:iam
```

`start:iam` compila las librerías compartidas (`packages/shared-common`, `packages/database`), compila `iam-service`, y lo corre directo con `node` (sin recarga automática por ahora). Si tocas código, hay que volver a correr `npm run start:iam`.

Toda la API (salvo `/health` y `POST /auth/login`) requiere `Authorization: Bearer <token>` — el token se obtiene haciendo login con el usuario creado por `db:seed-admin`. Ver `services/iam-service/README.md` para el detalle y ejemplos de `curl`.

`product-rating-service` (motor de reglas de cálculo, ver `docs/01-especificacion-motor-negocio-actual.md` §3) se levanta igual, en otra terminal (usa el puerto 3002; completa su `.env` con el MISMO `JWT_SECRET` que `iam-service`, porque solo verifica tokens, no los emite):

```bash
cp services/product-rating-service/.env.example services/product-rating-service/.env
npm run start:product-rating
```

Verificación sin base de datos del motor de reglas (evaluador de expresiones + una cadena de ejemplo, no requiere `ars_platform` ni ningún servicio corriendo): `npm run verify:rules-engine`. Ver `services/product-rating-service/README.md` para probar los endpoints `/rules-engine/*` contra Postgres real.

> **Nota (resuelta):** si un servicio nuevo compila con `nest build`/`npm run build` sin errores pero no genera `dist/`, revisa que exista `tsconfig.build.json` junto a `tsconfig.json`. `@nestjs/cli` busca ese archivo por convención (no `tsconfig.json`) para saber qué compilar; si falta, `nest build` compila "0 archivos" en silencio: exit 0, sin errores, sin salida, sin `dist`. Cada servicio nuevo debe copiar ambos archivos de `iam-service` (`tsconfig.json` y `tsconfig.build.json`), o declarar explícitamente `"compilerOptions": { "tsConfigPath": "tsconfig.build.json" }` en su `nest-cli.json`. Esto era también la causa real de que `nest start --watch` fallara con `Cannot find module dist/main` — no era un problema del watcher ni de los npm workspaces.

El resto de servicios se irán habilitando fase a fase — ver el roadmap.
