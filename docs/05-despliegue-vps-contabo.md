# Despliegue en VPS (Contabo Cloud VPS 4) con Docker Compose + Caddy

Estado: preparado, pendiente de la primera ejecución real.

Decisiones tomadas (2026-10-05):

- Servidor: Contabo Cloud VPS 4 (4 vCPU / 8 GB), Ubuntu 24.04, IP `178.238.225.7`.
- Orquestación: **Docker Compose + Caddy** (sin Coolify). Todo versionado en `deploy/`.
- HTTPS: dominio propio apuntando a la IP; Caddy obtiene y renueva el certificado de Let's Encrypt.
- Base de datos: **Postgres 17 en la propia VPS** (contenedor), migrada desde Neon con dump/restore.
- Código: `git clone` del repo privado con *deploy key* de solo lectura; se construye en la VPS.

Este documento reemplaza en la práctica a `03` (Oracle/Coolify) y `04` (Render), que quedan como referencia histórica.

## Arquitectura

```
Internet --443--> Caddy (web)  --/api/*--> gateway:3000 --> iam, product-rating, party,
                      |                                      reference-data, underwriting,
                      +--> frontend Angular (estático)       claims, billing, social-impact,
                                                             documents  --> postgres:5432
```

Solo `web` publica puertos (80/443). Postgres y los servicios están en la red interna de Docker. El frontend llama a `/api/<servicio>/...` y Caddy quita el prefijo `/api` antes de pasar al gateway.

Archivos: `deploy/docker-compose.yml`, `deploy/web/{Dockerfile,Caddyfile}`, `deploy/.env.example`, `deploy/scripts/{bootstrap-server,migrate-from-neon,backup,update}.sh`.

## Paso 0 — DNS (en tu proveedor de dominio)

Crea un registro **A**: `app.tudominio.com → 178.238.225.7` (o el subdominio que elijas). Si usas Cloudflare, déjalo en "solo DNS" (nube gris) al menos durante la primera emisión del certificado. Comprueba con `dig +short app.tudominio.com`.

## Paso 1 — Acceso SSH con llave (en tu Mac)

Contabo te envió una contraseña de root. **No la compartas en ningún chat**; úsala solo para el primer acceso.

```bash
ssh-keygen -t ed25519 -C "ars-vps"            # si aún no tienes llave
ssh-copy-id root@178.238.225.7                 # pide la contraseña de root una vez
ssh root@178.238.225.7                         # ya entra con llave
```

## Paso 2 — Endurecer el servidor

El repo es privado y la VPS todavía no tiene permiso para leerlo (eso se resuelve en el paso 3), así que aquí **no se clona nada**: copias solo el script desde tu Mac.

En tu Mac, desde la carpeta del repo:

```bash
scp deploy/scripts/bootstrap-server.sh root@178.238.225.7:/root/
```

Entra a la VPS como root y ejecútalo:

```bash
ssh root@178.238.225.7
bash /root/bootstrap-server.sh
passwd deploy                                  # define la clave de sudo
```

El script crea el usuario `deploy` (con tu llave), activa el firewall (solo 22/80/443), fail2ban, actualizaciones automáticas de seguridad, 4 GB de swap y Docker. Después, **en otra terminal de tu Mac**:

```bash
ssh deploy@178.238.225.7                       # debe entrar con llave
```

Solo cuando eso funcione, vuelve a la sesión de root y cierra SSH a root/contraseñas:

```bash
bash /root/bootstrap-server.sh lock-ssh
```

## Paso 3 — Dar a la VPS acceso de lectura al repo privado (deploy key)

Un repo privado de GitHub no se puede clonar sin credenciales. Una *deploy key* es un par de llaves SSH dedicado a **un solo repo**: la VPS guarda la privada, GitHub guarda la pública y, con eso, la VPS puede clonar y hacer `git pull`. Si la marcas como solo lectura, ni siquiera puede escribir en el repo, y no expone tu cuenta de GitHub ni tu contraseña.

Todo en la VPS, como `deploy` (`ssh deploy@178.238.225.7`):

1. Generar el par de llaves (sin passphrase, para poder automatizar `update.sh`):

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/ars_deploy -N "" -C "ars-vps-deploy"
   cat ~/.ssh/ars_deploy.pub
   ```

   El último comando imprime **la llave pública** (una línea que empieza por `ssh-ed25519`). Cópiala. Es seguro pegarla en GitHub; **nunca** copies `ars_deploy` (la privada, sin `.pub`).

2. Registrarla en GitHub, desde tu navegador: repo `ag2plataforma/ars-platform` → **Settings → Deploy keys → Add deploy key**. Título `ars-vps`, pega la pública y **deja sin marcar** "Allow write access". Guardar. (Necesitas ser admin del repo.)

3. Decirle a SSH que use esa llave con GitHub. Pega el bloque tal cual, **sin espacios delante de ninguna línea** (si `CONF` lleva sangría, el shell se queda esperando con un prompt `>`):

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/ars_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config && chmod 600 ~/.ssh/config
cat ~/.ssh/config
```

4. Probar y clonar:

   ```bash
   ssh -T git@github.com        # la primera vez pregunta si confías en el host: yes
   git clone git@github.com:ag2plataforma/ars-platform.git ~/ars-platform
   ```

   El `ssh -T` debe responder algo como "Hi ag2plataforma/ars-platform! You've successfully authenticated, but GitHub does not provide shell access". Es lo esperado.

Antes de clonar, haz `git push` desde tu Mac de los commits pendientes y de `deploy/`; la VPS solo ve lo que esté en GitHub.

## Paso 4 — Configurar `deploy/.env`

```bash
cd ~/ars-platform/deploy
cp .env.example .env && chmod 600 .env
openssl rand -hex 32     # úsalo para POSTGRES_PASSWORD
openssl rand -hex 32     # úsalo para JWT_SECRET (uno solo para todos los servicios)
nano .env
```

Variables y qué servicio las usa:

| Variable | Servicios | Notas |
|---|---|---|
| `DOMAIN`, `ACME_EMAIL` | web (Caddy), iam, underwriting | Dominio y correo para Let's Encrypt; también forman `PUBLIC_APP_URL` y el enlace de reset de clave |
| `POSTGRES_PASSWORD`, `POSTGRES_DB` | postgres + todos los servicios con BD | Usa hex (sin caracteres especiales) para no romper la URL |
| `JWT_SECRET` | gateway y todos los servicios | Debe ser **idéntico** en todos (el compose ya lo comparte) |
| `JWT_EXPIRES_IN`, `JWT_EXTENDED_EXPIRES_IN` | iam | 8h / 90d |
| `BREVO_API_KEY`, `EMAIL_SENDER_ADDRESS`, `EMAIL_SENDER_NAME` | iam, documents | El remitente debe estar verificado en Brevo |
| `PAYMENT_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYMENT_LINK_TTL_DAYS` | underwriting | Empieza con `sandbox`; pasa a `stripe` en el paso 8 |
| `AI_ENABLED`, `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_MAX_FILE_MB` | underwriting, claims | `AI_PROVIDER=mock` hasta tener la clave de Anthropic |
| `COLLECTIVE_MAX_INSUREDS` | underwriting | 100 |
| `SMS_PROVIDER`, `TWILIO_*`, `SMS_SENDER_NAME`, `SMS_DEFAULT_COUNTRY_CODE` | documents | Solo si usas SMS |
| `EMISSIONS_DEV_API_KEY`, `EMISSIONS_DEV_BASE_URL` | social-impact | Opcional |
| `BACKUP_RCLONE_REMOTE`, `BACKUP_KEEP_DAYS` | backup.sh | Copia externa opcional |

## Paso 5 — Migrar la base de datos desde Neon

```bash
cd ~/ars-platform/deploy
NEON_URL='postgresql://USUARIO:CLAVE@HOST/DB?sslmode=require&schema=ars_platform' \
  bash scripts/migrate-from-neon.sh
```

Levanta el contenedor de Postgres, hace `pg_dump` del esquema `ars_platform`, crea las extensiones (`uuid-ossp`, `pgcrypto`), restaura y compara el número de tablas. Como es un dump completo, **ya incluye** todo lo que antes hicieron los scripts `setup-*.js` y `seed-*.js` (secuencias, catálogos, usuario admin, colectivos, operaciones, etc.): no hay que volver a ejecutarlos.

Si en cambio quisieras una BD vacía (sin datos de Neon), el orden sería: `db/migrations/001` y `002` con `db/run-migration.js`, luego los `setup-*.js` en el orden de `docs/02-roadmap.md` y `npm run db:seed-admin`; el dump/restore es más simple y seguro.

> Mientras no cambies de proveedor, Neon sigue siendo la fuente de verdad. Haz la migración una vez, prueba, y solo entonces deja de usar Neon. Si repites la migración, para antes los servicios (`docker compose stop gateway`).

## Paso 6 — Construir y levantar

```bash
cd ~/ars-platform/deploy
COMPOSE_PARALLEL_LIMIT=2 docker compose build     # 15-25 min la primera vez
docker compose up -d
docker compose ps                                  # todos "healthy"
docker compose logs -f web                         # emisión del certificado
```

Prueba: `https://app.tudominio.com` (login) y `https://app.tudominio.com/api/iam/health`.

Nota: el compose arranca `documents` con LibreOffice (conversión docx→PDF), el servicio que más memoria usa. Con 8 GB sobra; revisa con `docker stats --no-stream`.

## Paso 7 — Backups

`backup.sh` hace un `pg_dump` de **toda la base** (formato custom, comprimido, incluye esquemas y extensiones), lo guarda en `~/ars-backups` y conserva 14 días. Opcionalmente sube una copia con rclone si `BACKUP_RCLONE_REMOTE` está definido en `.env`.

1. Prueba manual y programación diaria (03:15), como `deploy`:

```bash
bash ~/ars-platform/deploy/scripts/backup.sh
ls -lh ~/ars-backups
( crontab -l 2>/dev/null; echo '15 3 * * * /home/deploy/ars-platform/deploy/scripts/backup.sh >> /home/deploy/ars-backups/backup.log 2>&1' ) | crontab -
crontab -l
```

2. **Prueba de restauración** (obligatoria al menos una vez; no toca la base real, usa una base temporal):

```bash
cd ~/ars-platform/deploy
LAST=$(ls -t ~/ars-backups/ars-*.dump | head -1)
docker compose exec -T postgres psql -U ars -d postgres -c 'CREATE DATABASE ars_restore_test'
docker compose exec -T postgres pg_restore -U ars -d ars_restore_test --no-owner < "$LAST"
docker compose exec -T postgres psql -U ars -d ars_restore_test -Atc "select count(*) from information_schema.tables where table_schema='ars_platform'"
docker compose exec -T postgres psql -U ars -d postgres -c 'DROP DATABASE ars_restore_test'
```

Debe imprimir el mismo número de tablas que la base real (149 a día de hoy).

3. **Copia fuera de la VPS.** Un backup en la misma máquina no protege si el servidor se pierde. Configura una copia externa con rclone (Backblaze B2 o cualquier almacenamiento S3) o descarga periódicamente el último `.dump` a otra máquina con `scp`. Revisa también si tu plan de Contabo ofrece snapshots.

### Restaurar la base real (desastre)

Se recrea la base completa (el dump trae esquemas y extensiones):

```bash
cd ~/ars-platform/deploy
docker compose stop gateway iam product-rating party reference-data underwriting claims billing social-impact documents
docker compose exec -T postgres psql -U ars -d postgres -c 'DROP DATABASE ars WITH (FORCE)' -c 'CREATE DATABASE ars'
docker compose exec -T postgres pg_restore -U ars -d ars --no-owner < ~/ars-backups/ars-XXXX.dump
docker compose up -d
```

## Paso 8 — Stripe (webhook) y Bizum

1. Stripe Dashboard (modo test primero) → Developers → Webhooks → Add endpoint.
2. URL: `https://app.tudominio.com/api/underwriting/public/payments/webhook/stripe`.
3. Eventos a suscribir (los que procesa `stripe-payment-gateway.ts`): `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`. Cualquier otro se ignora.
4. Copia el *signing secret* (`whsec_...`) a `STRIPE_WEBHOOK_SECRET`, la clave secreta de test a `STRIPE_SECRET_KEY`, y `PAYMENT_PROVIDER=stripe`.
5. `docker compose up -d underwriting` (recrea solo ese servicio con el nuevo `.env`).
6. Prueba un pago con tarjeta de test `4242 4242 4242 4242` y confirma que el contrato se activa y el recibo queda cobrado.
7. Bizum: el servicio **no fija** `payment_method_types` al crear el Checkout, así que Stripe muestra los métodos que tengas activos en el Dashboard. Entra en Settings → Payment methods y comprueba que Bizum figura disponible y activado para tu cuenta (Bizum es asíncrono: llegará por `async_payment_succeeded`, ya contemplado). Si no aparece como disponible, hay que solicitarlo a Stripe; no requiere cambios de código.
8. Para producción: repite con las claves *live* y un endpoint nuevo en modo live.

## Operación diaria

- Actualizar: `bash ~/ars-platform/deploy/scripts/update.sh` (git pull + build + up -d).
- Logs de un servicio: `docker compose logs -f --tail=200 underwriting`.
- Reiniciar uno: `docker compose restart claims`.
- Estado y recursos: `docker compose ps`, `docker stats --no-stream`, `df -h`.
- Scripts de BD nuevos (`setup-*.js`) contra la BD de la VPS: desde el repo, con `DATABASE_URL` apuntando a `postgres` (ejecuta con `docker compose exec`, o abre un túnel SSH al puerto del contenedor si lo necesitas desde tu Mac). **Aún por definir cuando surja el primer script.**

## Riesgos conocidos

- **Contabo**: reseñas de sobreventa de CPU y soporte lento; vigila la latencia las primeras semanas.
- **Un solo servidor**: sin alta disponibilidad. Los backups externos son lo que realmente protege los datos.
- **Primera ejecución sin probar**: los Dockerfiles de servicios ya se construyeron en Render/CI, pero `deploy/web/Dockerfile`, `docker-compose.yml` y los scripts no se han ejecutado aún; es normal que el primer despliegue pida un par de ajustes.
- **Actualizaciones del SO**: `unattended-upgrades` aplica parches de seguridad, pero puede requerir reinicios (`/var/run/reboot-required`).
