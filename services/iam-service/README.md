# iam-service

Autenticación, usuarios, roles y permisos. Sustituye a `ag2authmanager` + `core-iam-service` del sistema v1 (hoy duplicados: ambos tenían modelo de usuarios y JWT, pero solo `ag2authmanager` tenía el endpoint de login funcional).

Este servicio es la **plantilla de referencia** para el resto de servicios del monorepo — misma estructura de carpetas, mismo patrón de `package.json`/`tsconfig.json`/`Dockerfile`.

## Estado actual

- `GET /health` — salud del servicio (`@Public()`, no requiere token).
- **Autenticación JWT real, protegiendo TODA la API por defecto**:
  - `POST /auth/login` (`@Public()`) — `{ userName, password, extendedTokenDuration? }` → `{ token, codUser, userData }`. Equivalente a `POST /login` del v1 (`ag2authmanager`), usando la credencial más reciente del usuario (bcrypt) en vez de una fila arbitraria.
  - `POST /auth/change-password` (autenticado) — `{ currentPassword, newPassword }`. Crea una fila nueva en `TUserCredential` (nunca sobreescribe), conservando el historial.
  - `POST /auth/forgot-password` (`@Public()`) — `{ userName }`. Siempre responde igual exista o no el usuario (evita enumeración); si existe, envía un correo (Brevo) con un link de reseteo.
  - `POST /auth/reset-password` (`@Public()`) — `{ token, newPassword }`. El `token` es un JWT de un solo uso y vida corta (30 min) que referencia la credencial vigente al emitirlo — se autoinvalida al usarse o al cambiar la contraseña por cualquier otra vía, sin necesidad de una tabla de tokens en la BD.
  - Todas las demás rutas (de este y de cualquier servicio futuro que importe `AuthModule` de `shared-common`) exigen `Authorization: Bearer <token>` — se marca `@Public()` explícitamente lo que deba quedar abierto, no al revés.
  - El JWT lleva `{ sub: IdeUser, code: CodUser, role: CodRol, lang }`, igual que el `UserProfile` que armaba v1.
  - `JWT_SECRET` es obligatorio (sin fallback hardcodeado — v1 sí traía uno embebido en el código, ver `docs/01-especificacion-motor-negocio-actual.md`).
  - Para probar sin tener usuarios cargados: `npm run db:seed-admin` (desde la raíz del repo) crea un usuario `admin` con contraseña aleatoria (impresa en consola) contra el `ars_platform` real.
- **Gestión de usuarios** (`/users`, requiere rol `ADMIN` salvo `/users/me`):
  - `GET /users/me` — perfil propio (cualquier usuario autenticado).
  - `POST /users` — crear usuario (`codUser`, `userName` como email, `password`, `codRol`, `userData?`).
  - `GET /users?codRol=&page=&limit=` — listado paginado.
  - `GET /users/:id`, `PATCH /users/:id` — detalle y edición (userName/rol/userData).
  - `PATCH /users/:id/state` — activar/desactivar/etc. (`{ codState }`, validado contra el catálogo `SState` real vía la máquina de estados — no hardcodea qué códigos existen).
  - Control de acceso por rol vía `@Roles('ADMIN')` + `RolesGuard` (`shared-common`), reutilizable por cualquier otro servicio.
- **Máquina de estados conectada a Postgres real** (esquema `ars_platform`), vía `@ars-platform/database` (`PrismaStateRuleRepository`). Endpoints de prueba, protegidos por el guard JWT (no son API de negocio, se retiran cuando haya endpoints reales que la usen):
  - `GET /state-machine/state/:code` — equivalente a `FGetState('STATE', null, null, code)`.
  - `GET /state-machine/initial/:codEntity` — equivalente a `FGetState('INITIAL', codEntity, null, null)`.
  - `GET /state-machine/next/:codEntity/:currentStateId/:operativeCode` — equivalente a `FGetState('NEXT', codEntity, currentStateId, operativeCode)`.

**Diferido a una fase posterior:** doble factor de autenticación (v1 tampoco lo tenía implementado — decisión explícita para no sumar alcance ahora: secretos TOTP, QR de enrolamiento, segundo paso en el login y códigos de respaldo son una pieza grande en sí misma).

Pendiente para Fase 2:

- Equivalente a `FGetSiteMap` (árbol de menú por rol, vía `SApplicationRole`/`SSiteMap`/`SSiteMapRole`) — hoy en v1 usa SQL dinámico, aquí se reimplementa como query estructurada.
- Doble factor de autenticación (ver nota arriba).

## Cómo correrlo

```bash
cp .env.example .env   # completar JWT_SECRET y, para recuperar contraseña, BREVO_API_KEY/EMAIL_SENDER_ADDRESS
npm install
npm run db:seed-admin  # (una vez) crea un usuario de prueba, desde la raíz del repo
npm run start:dev
```

### Probar el flujo completo

```bash
# 1. login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userName":"admin","password":"<la que imprimió db:seed-admin>"}'

# 2. con el token devuelto, crear un usuario nuevo (requiere rol ADMIN)
curl -X POST http://localhost:3001/users \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"codUser":"jperez","userName":"jperez@example.com","password":"Passw0rd!","codRol":"ADMIN"}'

# 3. cambiar la propia contraseña
curl -X POST http://localhost:3001/auth/change-password \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"currentPassword":"<actual>","newPassword":"<nueva>"}'

# 4. recuperar contraseña (revisa el correo que llega vía Brevo)
curl -X POST http://localhost:3001/auth/forgot-password \
  -H "Content-Type: application/json" -d '{"userName":"jperez@example.com"}'

curl -X POST http://localhost:3001/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"<el del link del correo>","newPassword":"<nueva>"}'
```
