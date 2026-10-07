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

3. **Copia fuera de la VPS (Backblaze B2 cifrada con rclone).** Un backup en la misma máquina no protege si el servidor se pierde, y estos datos son personales, así que se suben **cifrados** (rclone `crypt`): Backblaze solo ve ficheros ilegibles.

   a. En Backblaze (web): crear cuenta, un bucket **privado** (p. ej. `ars-backups-ag2`, región EU) y una *Application Key* limitada a ese bucket con lectura y escritura. Anotar `keyID` y `applicationKey` (se muestran una sola vez). Nunca en el chat ni en el repo.

   b. En la VPS, instalar rclone y crear los remotos (los secretos solo se teclean en la terminal):

```bash
sudo apt-get install -y rclone
read -rp "keyID: " B2ID; read -rsp "applicationKey: " B2KEY; echo
rclone config create b2ars b2 account="$B2ID" key="$B2KEY" >/dev/null; unset B2ID B2KEY
read -rsp "Contraseña de cifrado (guárdala en tu gestor de contraseñas): " P1; echo
rclone config create ars-crypt crypt remote=b2ars:NOMBRE-DEL-BUCKET/ars password="$P1" --obscure >/dev/null; unset P1
```

   c. Probar: `echo hola > /tmp/t.txt && rclone copy /tmp/t.txt ars-crypt: && rclone ls ars-crypt: && rclone delete ars-crypt: --include t.txt`.

   d. Activar en `deploy/.env`: `BACKUP_RCLONE_REMOTE=ars-crypt:` y ejecutar `bash scripts/backup.sh` (sube y limpia lo anterior a `BACKUP_KEEP_DAYS`).

   e. **Guarda en tu gestor de contraseñas** la contraseña de cifrado y el contenido de `~/.config/rclone/rclone.conf` (`rclone config show`). Sin ellos los backups cifrados no se pueden recuperar si pierdes la VPS.

   Para recuperar en otra máquina: instalar rclone, recrear los dos remotos con esos datos y `rclone copy ars-crypt: ./restore/`.

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
2. URL **completa, con la ruta**: `https://backoffice.ag2aplicaciones.com/api/underwriting/public/payments/webhook/stripe` (con tu dominio). Si guardas solo el dominio, Stripe hace `POST /`, Caddy lo sirve como parte del frontend y responde **405** con cuerpo vacío (el listado de Stripe puede mostrar la ruta como texto aparte y engañar: comprueba el campo *URL del endpoint*). Se corrige editando la URL; el signing secret no cambia.
3. Eventos a suscribir (los que procesa `stripe-payment-gateway.ts`): `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`. Cualquier otro se ignora.
4. Copia el *signing secret* (`whsec_...`) a `STRIPE_WEBHOOK_SECRET`, la clave secreta de test a `STRIPE_SECRET_KEY`, y `PAYMENT_PROVIDER=stripe`.
5. `docker compose up -d underwriting` (recrea solo ese servicio con el nuevo `.env`).
6. Prueba un pago con tarjeta de test `4242 4242 4242 4242` y confirma que el contrato se activa y el recibo queda cobrado.
7. Bizum: el servicio **no fija** `payment_method_types` al crear el Checkout, así que Stripe muestra los métodos que tengas activos en el Dashboard. Entra en Settings → Payment methods y comprueba que Bizum figura disponible y activado para tu cuenta (Bizum es asíncrono: llegará por `async_payment_succeeded`, ya contemplado). Si no aparece como disponible, hay que solicitarlo a Stripe; no requiere cambios de código.
8. Verificar el webhook: en el evento de Stripe pulsa «Vuelve a enviarlo»; debe dar **200** (`{"received":true,...}`; con un contrato ya activado responde `processed:false, reason:ALREADY_PROCESSED`, que es lo correcto). En la VPS, `docker compose logs --since 5m web | grep -i webhook` muestra método, ruta y estado (Caddy registra los accesos en JSON). Una prueba con `curl` sin cabecera `Stripe-Signature` devuelve **401** (`Falta la cabecera Stripe-Signature`): es lo esperado y confirma que la ruta llega a la verificación de firma.
9. Para producción: repite con las claves *live* y un endpoint nuevo en modo live.

## Despliegue automático (GitHub Actions)

Cada push a `main` ejecuta el CI (`.github/workflows/ci.yml`: lint + build + tests). **Si pasa**, `.github/workflows/deploy.yml` entra por SSH a la VPS y ejecuta `deploy/scripts/update.sh`, que hace `git pull`, reconstruye solo lo que cambió desde el último despliegue correcto (servicios tocados, `web` si cambia el frontend, todo si cambian `packages/`, `package.json` o el lockfile), levanta con `docker compose up -d --wait` y falla si algún servicio no queda `healthy`. También se puede lanzar a mano desde Actions → Deploy → Run workflow.

Configuración inicial (una vez):

1. En tu Mac, llave exclusiva para GitHub (sin passphrase, porque la usa una máquina):

```bash
ssh-keygen -t ed25519 -f ~/ars_gha_deploy -N "" -C "gh-actions-ars"
```

2. Autorizarla en la VPS **restringida a update.sh** (`restrict` quita shell interactiva, reenvíos y TTY; `command=` fuerza ese único comando):

```bash
KEYLINE="command=\"bash /home/deploy/ars-platform/deploy/scripts/update.sh\",restrict $(cat ~/ars_gha_deploy.pub)"
ssh ars-vps "echo '$KEYLINE' >> ~/.ssh/authorized_keys"
```

3. Probar desde el Mac que la llave dispara el despliegue (debe correr update.sh y terminar en `Despliegue correcto`):

```bash
ssh -i ~/ars_gha_deploy -o IdentitiesOnly=yes deploy@178.238.225.7 deploy
```

4. Huella del servidor para `known_hosts` (verifica que coincide con `ssh ars-vps 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'`):

```bash
ssh-keyscan -t ed25519 178.238.225.7
```

5. En GitHub: repo → Settings → Secrets and variables → Actions → New repository secret:
   - `VPS_HOST` = `178.238.225.7`
   - `VPS_SSH_KEY` = contenido completo de `~/ars_gha_deploy` (la privada, con las líneas BEGIN/END)
   - `VPS_KNOWN_HOSTS` = la línea que imprimió `ssh-keyscan`

6. Borra la privada del Mac cuando esté en GitHub: `rm ~/ars_gha_deploy ~/ars_gha_deploy.pub`.

Si GitHub se viera comprometido, el daño máximo de esa llave es ejecutar `update.sh` (un `git pull` + build de lo que haya en `main`). Para revocarla, borra su línea de `~/.ssh/authorized_keys` en la VPS.

**Volver atrás** un despliegue malo: `git revert <commit>` + push; el pipeline despliega el revert. Scripts de base de datos (`setup-*.js`, seeds) no forman parte del pipeline: se ejecutan aparte con `deploy/scripts/db-run.sh` (ver «Operación diaria»). Un `git revert` no deshace cambios de esquema ya aplicados; para eso, restaura el backup.

## Operación diaria

- Actualizar a mano (si el pipeline no está o falló): `bash ~/ars-platform/deploy/scripts/update.sh`.
- Logs de un servicio: `docker compose logs -f --tail=200 underwriting`.
- Reiniciar uno: `docker compose restart claims`.
- Estado y recursos: `docker compose ps`, `docker stats --no-stream`, `df -h`.
- Scripts de BD (`setup-*.js`, `seed-*.js`, `fix-*.js`, `investigate-*.js`...): `bash ~/ars-platform/deploy/scripts/db-run.sh <script>.js` (tras el `git pull`/despliegue que lo trae). `--list` muestra los disponibles. Los que escriben piden confirmación y hacen antes un backup (`-y` y `--no-backup` lo omiten); los de solo lectura (`investigate-*`, `verify-*`...) se ejecutan directo. Corren en un contenedor temporal de la red interna con solo `DATABASE_URL`, usando `pg` instalado en el volumen `ars_dbtools` (la primera vez lo instala). `bash deploy/scripts/db-run.sh --sql` abre `psql`. Los scripts siguen siendo idempotentes (`IF NOT EXISTS`): repetir uno ya aplicado no rompe nada. Orden: primero despliega el código, luego corre el script de esquema, y reinicia los servicios afectados solo si el script lo indica.

## Conectar DBeaver a la base de datos

Postgres publica su puerto **solo en el loopback de la VPS** (`127.0.0.1:5432`), nunca en internet (ufw sigue sin abrir el 5432 y, además, Docker lo enlaza solo a 127.0.0.1). Desde el Mac se entra por **túnel SSH** que DBeaver abre solo:

1. Nueva conexión → PostgreSQL. Pestaña *Main*: Host `localhost`, Puerto `5432`, Base de datos `ars`, Usuario `ars`, Contraseña = `POSTGRES_PASSWORD` de `deploy/.env` (se lee en la VPS con `grep '^POSTGRES_PASSWORD=' ~/ars-platform/deploy/.env` y se pega solo en DBeaver, nunca en chats).
2. Pestaña *SSH* → marcar *Use SSH Tunnel*: Host `178.238.225.7`, Puerto `22`, Usuario `deploy`, Método *Public Key*, Private Key `~/.ssh/ars_vps` (la passphrase de esa llave en *Password*). Si falla con la llave ed25519, en *Advanced* cambia la implementación a `SSHJ`.
3. *Test Connection*. El esquema de la aplicación es `ars_platform` (DBeaver → Databases → ars → Schemas).
4. Recomendado: en *General* → *Connection type* = *Production* (confirma antes de ejecutar, sin auto-commit), y hacer un backup (`bash deploy/scripts/backup.sh`) antes de modificar datos a mano. Para solo consultar, un usuario de solo lectura es más seguro que `ars`.

Si Postgres no responde en el túnel, comprueba en la VPS que el puerto está publicado: `docker compose ps postgres` debe mostrar `127.0.0.1:5432->5432/tcp`. Tras el cambio de `docker-compose.yml`, el pipeline recrea el contenedor de Postgres (unos segundos de corte; los datos están en el volumen `pgdata`).

## Estado y lecciones del primer despliegue (2026-10)

Desplegado y operativo en https://backoffice.ag2aplicaciones.com: 11 contenedores sanos, base migrada desde Neon (149 tablas), endurecimiento SSH, backups diarios locales + B2 cifrado con restauración probada, correo (Brevo), recuperación de contraseña, despliegue automático por push y webhook de Stripe (modo test) en 200. Pendientes: Bizum depende de que Stripe verifique la cuenta (tipo de negocio y NIF); autenticar el dominio en Brevo (SPF/DKIM) antes de enviar a clientes reales; pasar Stripe a modo live.

Problemas encontrados (para no repetirlos):

- **`.env` con `source`**: un valor con espacios sin comillas rompe los scripts; ahora se leen con `envval()` (grep) y `.env.example` entrecomilla `EMAIL_SENDER_NAME`.
- **Extensiones de Postgres**: en Neon vivían en esquemas propios (`entity`, `ag2ars`) y `pg_restore` fallaba; `migrate-from-neon.sh` las recrea en los mismos esquemas.
- **sshd, primer valor gana**: `50-cloud-init.conf` mantenía `PasswordAuthentication yes` por encima de `99-hardening.conf`; el archivo de endurecimiento se llama `00-hardening.conf`. Verifica siempre con `sshd -T` y una prueba real.
- **Caché del navegador**: `/i18n/es.json` e `index.html` no llevan hash y se servían viejos tras desplegar (claves de traducción en crudo); Caddy los sirve con `no-cache`.
- **Webhook 405**: URL de Stripe guardada sin la ruta (ver Paso 8). Sin registro de accesos no se veía; Caddy ahora lo registra.
- **Comentarios `#` en zsh**: no pegues comandos con comentarios inline que lleven paréntesis.

## Riesgos conocidos

- **Contabo**: reseñas de sobreventa de CPU y soporte lento; vigila la latencia las primeras semanas.
- **Un solo servidor**: sin alta disponibilidad. Los backups externos son lo que realmente protege los datos.
- **Primera ejecución sin probar**: los Dockerfiles de servicios ya se construyeron en Render/CI, pero `deploy/web/Dockerfile`, `docker-compose.yml` y los scripts no se han ejecutado aún; es normal que el primer despliegue pida un par de ajustes.
- **Actualizaciones del SO**: `unattended-upgrades` aplica parches de seguridad, pero puede requerir reinicios (`/var/run/reboot-required`).
