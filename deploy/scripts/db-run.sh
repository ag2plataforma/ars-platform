#!/usr/bin/env bash
# Ejecuta un script de packages/database/scripts contra la BD de la VPS.
#
#   bash deploy/scripts/db-run.sh --list                  # scripts disponibles
#   bash deploy/scripts/db-run.sh setup-collectives.js    # setup/seed/fix/migrate: confirmacion + backup
#   bash deploy/scripts/db-run.sh investigate-quote-engine.js   # solo lectura: se ejecuta directo
#   bash deploy/scripts/db-run.sh --sql                   # consola psql
#
# Opciones (antes del nombre del script): -y (sin confirmacion), --no-backup.
#
# Como funciona: levanta un contenedor TEMPORAL a partir de la imagen ars/iam
# (trae @prisma/client y bcryptjs), en la red interna de Compose, con SOLO
# DATABASE_URL como variable (ningun otro secreto). Los scripts se montan de solo
# lectura desde el repo (siempre la version recien descargada con git pull). `pg`
# no esta en las imagenes de runtime: se instala una vez en el volumen
# `ars_dbtools` y se reutiliza (NODE_PATH). DATABASE_SSL=false desactiva el SSL
# que los scripts forzaban (el Postgres de la VPS es interno y no lo usa).
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(cd .. && pwd)"
SCRIPTS_DIR="$REPO/packages/database/scripts"
IMAGE="ars/iam:latest"
NETWORK="ars_internal"
TOOLS_VOLUME="ars_dbtools"
PG_VERSION="8.23.0"   # el mismo que package-lock.json

envval() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; }

ASSUME_YES=0; DO_BACKUP=1
while [ $# -gt 0 ]; do
  case "$1" in
    -y) ASSUME_YES=1; shift ;;
    --no-backup) DO_BACKUP=0; shift ;;
    *) break ;;
  esac
done

DB="$(envval POSTGRES_DB || true)"; DB="${DB:-ars}"

case "${1:-}" in
  ""|-h|--help) sed -n '2,12p' "$0"; exit 0 ;;
  --list)
    ls "$SCRIPTS_DIR" | grep -E '\.js$' | grep -E '^(setup|seed|migrate|fix|cleanup|delete|apply|normalize)-' | sed 's/^/  [escribe] /'
    ls "$SCRIPTS_DIR" | grep -E '\.js$' | grep -E '^(investigate|verify|find|list|generate)[-_]' | sed 's/^/  [lectura] /'
    exit 0 ;;
  --sql)
    exec docker compose exec postgres psql -U ars -d "$DB" ;;
esac

SCRIPT="$(basename "$1")"; shift
[ -f "$SCRIPTS_DIR/$SCRIPT" ] || { echo "No existe $SCRIPT (usa --list)" >&2; exit 1; }
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "Falta la imagen $IMAGE: levanta el stack primero (docker compose up -d)" >&2; exit 1; }

PW="$(envval POSTGRES_PASSWORD || true)"
[ -n "$PW" ] || { echo "POSTGRES_PASSWORD vacio en deploy/.env" >&2; exit 1; }
export DATABASE_URL="postgresql://ars:${PW}@postgres:5432/${DB}?schema=ars_platform"

# Instala `pg` una sola vez en el volumen de herramientas.
docker run --rm -v "$TOOLS_VOLUME:/tools" -w /tools "$IMAGE" sh -c \
  "[ -d node_modules/pg ] || { echo 'Instalando pg $PG_VERSION en el volumen $TOOLS_VOLUME...'; npm init -y >/dev/null && npm install --no-audit --no-fund pg@$PG_VERSION; }"

# Los scripts de solo lectura (investigate/verify/find/list/generate) no piden nada.
if [[ ! "$SCRIPT" =~ ^(investigate|verify|find|list|generate)[-_] ]]; then
  if [ "$ASSUME_YES" -ne 1 ]; then
    echo "Vas a ejecutar $SCRIPT contra la BD '$DB' de la VPS (puede modificar datos)."
    read -r -p "Escribe 'si' para continuar: " ANS
    [ "$ANS" = "si" ] || { echo "Cancelado."; exit 1; }
  fi
  if [ "$DO_BACKUP" -eq 1 ]; then
    echo "== Backup previo"
    bash scripts/backup.sh
  fi
fi

echo "== Ejecutando $SCRIPT"
TTY_FLAG=""; [ -t 0 ] && TTY_FLAG="-t"
docker run --rm -i $TTY_FLAG \
  --network "$NETWORK" \
  -e DATABASE_URL -e DATABASE_SSL=false -e NODE_PATH=/tools/node_modules \
  -v "$TOOLS_VOLUME:/tools:ro" \
  -v "$SCRIPTS_DIR:/app/packages/database/scripts:ro" \
  -w /app "$IMAGE" \
  node "packages/database/scripts/$SCRIPT" "$@"
echo "== $SCRIPT terminado"
