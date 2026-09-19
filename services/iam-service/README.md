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

- **Doble factor de autenticación (TOTP), opcional y autoservicio.** Feature nueva de cero -- v1 tampoco la tenía, no hay comportamiento legado que replicar (ver `docs/02-roadmap.md`). Cualquier usuario lo activa/desactiva sobre su propia cuenta; no cambia nada para quien no lo activa.
  - `POST /auth/2fa/enroll` (autenticado) — genera un secreto nuevo (queda "pendiente" hasta confirmarlo) y devuelve `{ secret, otpauthUrl }` para escanear con Google Authenticator/Authy/etc. (o tipear el secreto a mano).
  - `POST /auth/2fa/confirm` (autenticado) — `{ code }`, el código de 6 dígitos que ya generó la app. Si es válido, activa 2FA y devuelve `{ backupCodes: [...10 códigos] }` -- se muestran una sola vez, después solo existe su hash.
  - `POST /auth/2fa/disable` (autenticado) — `{ password, code }`. Exige reingresar la contraseña Y un código válido (TOTP o uno de respaldo) -- estar logueado no alcanza para apagarlo.
  - `POST /auth/login` (`@Public()`) cambia de forma cuando el usuario tiene 2FA activo: en vez de `{ token, ... }` devuelve `{ requiresTwoFactor: true, twoFactorToken }` (vida corta, 5 minutos).
  - `POST /auth/2fa/verify` (`@Public()`) — `{ twoFactorToken, code }` (TOTP o de respaldo) → `{ token, codUser, userData }`, el mismo shape que un login normal sin 2FA.
  - TOTP (RFC 6238) implementado a mano con el módulo `crypto` de Node -- sin librería nueva (`otplib` o similar), verificado línea por línea contra los vectores de prueba oficiales de la RFC. El secreto se guarda en texto plano en `TUserTwoFactor` (no se puede hashear, hace falta el valor original para generar/comparar códigos) -- decisión explícita del usuario para no sumar gestión de claves de cifrado ahora, ver `docs/02-roadmap.md`. Los códigos de respaldo sí van hasheados (bcrypt, igual que `TUserCredential`). Acceso a `TUserTwoFactor`/`TUserBackupCode` vía el cliente Prisma tipado (`this.prisma.tUserTwoFactor`/`tUserBackupCode`), igual que el resto del proyecto -- inicialmente se implementó con `$queryRaw`/`$executeRaw` porque no se podía regenerar el cliente en ese momento, se migró al cliente tipado una vez el usuario corrió `prisma generate`.
  - **Sin cobertura todavía**: recuperación de cuenta si el usuario pierde el celular Y los 10 códigos de respaldo a la vez (escenario de soporte manual, fuera de alcance de esta primera versión).

Pendiente para Fase 2:

- (nada pendiente específico de este servicio por ahora -- lo que quedaba, el equivalente a `FGetSiteMap`, se implementó del lado de `reference-data-service`, que es donde viven `SApplicationRole`/`SSiteMap`/`SSiteMapRole` -- ver su README).

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

# 5. activar 2FA sobre la propia cuenta
curl -X POST http://localhost:3001/auth/2fa/enroll \
  -H "Authorization: Bearer <token>"
# devuelve { "secret": "...", "otpauthUrl": "otpauth://..." } -- escanealo con
# Google Authenticator/Authy, o usa "npm run db:totp-code -- <secret>" para
# generar el codigo de 6 digitos sin celular (solo para probar)

curl -X POST http://localhost:3001/auth/2fa/confirm \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"code":"<el que muestre la app o el script>"}'
# devuelve { "backupCodes": [...10 codigos] } -- se muestran una sola vez

# 6. a partir de aca, el login normal ya no alcanza:
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userName":"admin","password":"<la actual>"}'
# devuelve { "requiresTwoFactor": true, "twoFactorToken": "..." } en vez del token

curl -X POST http://localhost:3001/auth/2fa/verify \
  -H "Content-Type: application/json" \
  -d '{"twoFactorToken":"<el de arriba>","code":"<TOTP o uno de los backupCodes>"}'
# devuelve { "token", "codUser", "userData" } -- igual que un login sin 2FA

# 7. apagar 2FA (exige contraseña + un codigo valido, no solo estar logueado)
curl -X POST http://localhost:3001/auth/2fa/disable \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"password":"<actual>","code":"<TOTP o uno de los backupCodes>"}'
```
