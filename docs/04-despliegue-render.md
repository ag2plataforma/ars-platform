# Despliegue de referencia: Render (plan B / paralelo a Oracle)

## Por qué existe este documento

`docs/03-despliegue-oracle-coolify.md` documenta el camino "principal"
(Oracle Cloud Always Free + Coolify), pero la capa Ampere A1.Flex de Oracle
está sujeta a un cupo de capacidad físico que en la práctica lleva días sin
liberarse en la mayoría de dominios de disponibilidad (`Out of capacity for
shape VM.Standard.A1.Flex in availability domain AD-1...`). Es un problema
de disponibilidad de Oracle, no de la configuración — está ampliamente
documentado como algo común en la capa gratuita.

Decisión (2026-09-18): en paralelo, sin abandonar Oracle, se levanta el
mismo `iam-service` en **Render**, que tiene capa gratuita permanente (no
crédito de prueba), sin necesidad de tarjeta, y soporta el mismo Dockerfile
de monorepo ya preparado sin cambios. Si más adelante la instancia Oracle
A1.Flex se consigue (ver sección "Reintento automático de capacidad Oracle"
más abajo), se migra siguiendo `docs/03-despliegue-oracle-coolify.md` tal
cual está escrito — el trabajo de Dockerfile/contexto de build es el mismo
para ambos caminos.

Limitación conocida de Render free tier a tener presente: los servicios web
gratuitos se "duermen" tras 15 minutos sin tráfico entrante y tardan
~1 minuto en reactivarse con la primera petición después de dormir (cold
start). No tiene disco persistente en el plan gratuito, lo cual no afecta
a este proyecto porque Postgres ya está alojado externamente (Neon/Vercel),
no en el propio servicio.

## Configuración en Render para `iam-service`

1. Crear cuenta en [render.com](https://render.com) (sin tarjeta).
2. **New +** → **Web Service** → conectar el repo de GitHub `ars-platform`.
3. **Language/Runtime**: `Docker` (no Node nativo — igual que en Coolify,
   este repo es un monorepo con workspaces, no un proyecto Node "plano").
4. **Root Directory**: dejar vacío/en blanco.
5. **Dockerfile Path**: `services/iam-service/Dockerfile`.
6. **Docker Build Context Directory**: `.` (raíz del repo) — en el
   dashboard actual de Render este campo está escondido dentro de la
   sección **"Advanced"**, no aparece en el formulario principal. Es el
   equivalente exacto al "Base Directory: /" de Coolify: si el contexto de
   build fuera `services/iam-service/` en vez de la raíz, el build no
   podría ver `packages/` y fallaría. (Si por alguna razón no aparece ni
   siquiera en Advanced, dejarlo vacío también sirve: Render usa la raíz
   del repo como contexto por defecto cuando el campo no se completa.)
7. **Instance Type**: `Free`.
8. **Variables de entorno** (idénticas a las de
   `services/iam-service/.env.example`, con valores reales — mismo criterio
   que en `docs/03-despliegue-oracle-coolify.md`):
   - `PORT=3001` (Render expone el puerto que la app escuche; confirmar que
     coincide con el `EXPOSE`/`PORT` del Dockerfile).
   - `DATABASE_URL=...` → la misma cadena de conexión a Postgres
     (Neon/Vercel) que ya se usa en local y en el intento de Oracle, con
     `?schema=ars_platform` — se reutiliza la misma base (no se levanta una
     BD de producción aparte, misma decisión que ya está tomada).
   - `JWT_SECRET=...` → generar uno real (`openssl rand -base64 32`), nunca
     el `change-me` del ejemplo.
   - `JWT_EXPIRES_IN=8h`
   - `JWT_EXTENDED_EXPIRES_IN=90d`
   - `BREVO_API_KEY`, `EMAIL_SENDER_ADDRESS`, `EMAIL_SENDER_NAME`,
     `PASSWORD_RESET_URL_BASE` → igual que en Oracle, alcanza con cualquier
     valor para esta prueba (no bloquean `/health` ni `/auth/login`).
9. **Health Check Path** (en la sección "Health & Alerts" del servicio):
   `/health` → mismo endpoint público (`@Public()`) que ya existe.
10. Create Web Service → Render dispara el build automáticamente. Revisar
    el log: al igual que en Coolism/GitHub Actions (y a diferencia del
    sandbox de desarrollo, que no tiene salida de red hacia
    `binaries.prisma.sh`), acá `prisma generate` debería resolver sin
    problema por tener salida de red completa.

## Verificación

Igual que en Oracle:

- `GET https://<subdominio-de-render>.onrender.com/health` → 200 con el
  JSON de estado. Si el servicio estaba dormido, la primera respuesta puede
  tardar hasta ~1 minuto.
- `POST /auth/login` con el usuario admin ya sembrado, contra la misma BD
  real → confirma que el contenedor desplegado pega de verdad contra
  Postgres.

## Para el resto de los servicios

Mismo procedimiento (Language `Docker`, Dockerfile Path
`services/<nombre>/Dockerfile`, Build Context Directory `.`, puerto según
la tabla de `docs/00-arquitectura.md`), cuando les toque en Fase 2. Cada
servicio es un Web Service de Render separado (o, si el número de servicios
gratuitos empieza a ser un problema, evaluar en su momento agrupar algunos
Blueprint-style — no es necesario decidirlo ahora, con `iam-service` solo).

## Reintento automático de capacidad Oracle (en paralelo)

Para no abandonar el camino Oracle+Coolify (que no depende de que un
servicio esté "despierto" y no tiene el cold-start de Render), en paralelo
se puede dejar corriendo una herramienta que reintente la creación de la
instancia `VM.Standard.A1.Flex` automáticamente hasta que Oracle libere
capacidad. La opción evaluada como más práctica para este caso es
[UxmanX/oci-freenium-retry](https://github.com/UxmanX/oci-freenium-retry):
corre como GitHub Action (cron cada 5 minutos), así que no requiere dejar
una laptop o servidor propio prendido — apenas se configuran los secrets
una vez, GitHub se encarga de los reintentos.

Requiere, del lado de Oracle Cloud (a hacer por el usuario, son credenciales
de su cuenta):

- OCID de tenancy y de usuario, fingerprint y clave privada de una API Key
  (se generan desde la consola de Oracle: Perfil → My Profile → API Keys).
- OCID de la VCN y de la subnet donde se creará la instancia.
- Región (ej. la misma que ya se venía usando).
- Clave pública SSH para poder entrar a la instancia una vez creada.

Y del lado de GitHub: cargar todo lo anterior como *Secrets* del repo (o de
un fork/repo aparte, si no se quiere mezclar credenciales de Oracle con el
repo de `ars-platform`) y, opcional pero recomendado, un webhook de Discord
para recibir notificación en el momento en que consiga la instancia (el
cron de GitHub Actions puede demorar hasta 10-15 minutos extra sobre el
intervalo configurado, es una limitación conocida de GitHub, no de la
herramienta).

**Importante**: esto requiere generar y cargar credenciales reales de la
cuenta de Oracle del usuario — es una acción que el usuario debe hacer él
mismo en su cuenta (consola de Oracle + configuración de secrets en
GitHub), no algo que se pueda automatizar desde acá. Cuando la instancia
se consiga, migrar siguiendo `docs/03-despliegue-oracle-coolify.md` sin
cambios.
