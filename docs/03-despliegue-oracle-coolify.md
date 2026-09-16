# Despliegue de referencia: Oracle Cloud + Coolify

Estado: primera prueba end-to-end en curso, con `iam-service` como "hello
world" real (no un ejemplo aislado — el mismo Dockerfile y los mismos pasos
sirven, sin cambios de fondo, para desplegar cualquiera de los otros 7
servicios cuando les toque).

## Prerrequisitos (ya cumplidos)

- Cuenta de Oracle Cloud (capa Always Free) con una instancia ARM Ampere
  levantada y accesible por SSH.
- Coolify instalado y funcionando en esa instancia.
- El repo `ars-platform` en GitHub, con CI en verde (ver
  `.github/workflows/ci.yml`).

## Bug encontrado y corregido: los Dockerfiles scaffoldeados no compilaban

Los 8 `Dockerfile` generados durante el scaffolding (Fase 1) asumían que cada
servicio era un paquete npm aislado (`COPY package.json`, `COPY src`, `npm
install`, `npm run build` desde el propio directorio del servicio). Eso
**no funciona** en este monorepo: cada servicio depende de paquetes internos
(`@ars-platform/shared-common`, `@ars-platform/database`) resueltos por npm
workspaces — no publicados a ningún registro — así que instalar desde la
carpeta del servicio sola falla al no poder resolver esas dependencias.

Corregido en los 8 servicios: el build ahora usa la **raíz del repo como
contexto de build**, copia `package.json`/`package-lock.json`/
`tsconfig.base.json` + `packages/` + `services/` completos, corre `npm ci`
una sola vez (resuelve todos los workspaces), compila `packages/*` con
`npm run build:libs` y luego el servicio puntual con
`npm run build --workspace=services/<nombre>`, y en la etapa final de
runtime solo copia `node_modules` (podado con `npm prune --omit=dev`) más
los `dist` que hacen falta. Esto es exactamente lo que exige el siguiente
punto en la configuración de Coolify.

Se agregó también un `.dockerignore` en la raíz (no existía) para no mandar
`node_modules/`, `.git/`, `dist/`, logs, etc. al contexto de build.

## Configuración en Coolify para `iam-service`

1. **Nueva aplicación** → origen: el repo de GitHub (`ars-platform`), rama
   `main`.
2. **Build Pack**: `Dockerfile` (no Nixpacks — este repo no es un proyecto
   Node "plano", es un monorepo con workspaces).
3. **Base Directory** (contexto de build): `/` — la raíz del repo. Este es
   el punto más importante y menos obvio: si Coolify arma el contexto desde
   `services/iam-service/` (lo más "natural" a primera vista), el build va
   a fallar al no encontrar `packages/`.
4. **Dockerfile Location**: `services/iam-service/Dockerfile`.
5. **Puerto expuesto**: `3001` (coincide con el `EXPOSE` del Dockerfile y
   con `PORT` más abajo).
6. **Variables de entorno** (mismo contenido que
   `services/iam-service/.env.example`, con valores reales):
   - `PORT=3001`
   - `DATABASE_URL=...` → la misma cadena de conexión a Postgres
     (Neon/Vercel) que ya usás en local, con `?schema=ars_platform` — se
     reutiliza la misma base, no se levanta una BD de producción aparte
     (decisión ya tomada: no invertir en infraestructura extra por ahora).
   - `JWT_SECRET=...` → **generar uno real** (`openssl rand -base64 32`),
     nunca el `change-me` del ejemplo — este sí queda expuesto a internet.
   - `JWT_EXPIRES_IN=8h`
   - `JWT_EXTENDED_EXPIRES_IN=90d`
   - `BREVO_API_KEY`, `EMAIL_SENDER_ADDRESS`, `EMAIL_SENDER_NAME`,
     `PASSWORD_RESET_URL_BASE` → necesarias solo para
     `POST /auth/forgot-password`; para esta primera prueba de despliegue
     alcanza con dejarlas con cualquier valor (no bloquean `/health` ni
     `/auth/login`).
7. **Health check** (opcional pero recomendado, ya existe el endpoint):
   `GET /health` → responde `{ status, service, timestamp }` sin
   autenticación (`@Public()`).
8. Deploy, y revisar el log de build — con internet completo en el droplet,
   `prisma generate` (paso que en el entorno de desarrollo en sandbox no
   puede correr, por falta de salida de red hacia `binaries.prisma.sh`)
   debería resolverse sin problema, igual que ya se confirmó en GitHub
   Actions.

## Verificación

- `GET https://<dominio-o-ip>:<puerto>/health` → debe responder 200 con el
  JSON de estado.
- `POST /auth/login` con el usuario admin ya sembrado (`npm run
  db:seed-admin`, corrido previamente contra la misma BD real) → confirma
  que el contenedor desplegado está pegando de verdad contra Postgres, no
  solo que levantó.

## Para el resto de los servicios

Mismo procedimiento exacto (Build Pack Dockerfile, Base Directory `/`,
Dockerfile Location `services/<nombre>/Dockerfile`, puerto según la tabla
de `docs/00-arquitectura.md`), cuando les toque en Fase 2. `gateway` es la
única variante: no depende de `packages/database`, pero su Dockerfile ya
está preparado igual (compila `packages/database` de todos modos, sin
problema, para no tener dos plantillas distintas de Dockerfile que
mantener).
