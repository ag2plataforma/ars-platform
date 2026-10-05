#!/usr/bin/env bash
# Copia el esquema ars_platform de Neon al Postgres de la VPS (dump + restore).
# Se corre en la VPS, desde deploy/, con el contenedor postgres ya definido:
#
#   cd ~/ars-platform/deploy
#   NEON_URL='postgresql://user:pass@host/db?sslmode=require&schema=ars_platform' \
#     bash scripts/migrate-from-neon.sh
#
# Detalles:
# - NEON_URL es solo variable de entorno de ESTE comando: no se guarda en disco.
# - Se quita el parametro `schema=` (lo entiende Prisma, no libpq/pg_dump).
# - Solo se copia el esquema ars_platform (el esquema `entity` de la v1 no).
# - Es seguro repetir: borra y recrea ars_platform en la VPS antes de restaurar.
#   PARA la app antes (docker compose stop gateway) si la VPS ya estaba en uso.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${NEON_URL:?Define NEON_URL con la cadena de conexion de Neon}"
[ -f .env ] || { echo "Falta deploy/.env" >&2; exit 1; }
set -a; . ./.env; set +a
DB="${POSTGRES_DB:-ars}"

# Quita schema=... de la URL (manteniendo bien formados ? y &).
CLEAN_URL="$(printf '%s' "$NEON_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"

mkdir -p backups
DUMP="backups/neon-$(date +%Y%m%d-%H%M%S).dump"

echo ">> Levantando postgres..."
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U ars -d "$DB" >/dev/null 2>&1; do sleep 2; done

echo ">> Dump desde Neon -> $DUMP"
docker compose exec -T postgres pg_dump "$CLEAN_URL" \
  --schema=ars_platform --format=custom --no-owner --no-privileges > "$DUMP"
ls -lh "$DUMP"

echo ">> Extensiones y restauracion en la VPS..."
docker compose exec -T postgres psql -U ars -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DROP SCHEMA IF EXISTS ars_platform CASCADE;
SQL
docker compose exec -T postgres pg_restore -U ars -d "$DB" \
  --no-owner --no-privileges --exit-on-error < "$DUMP"

echo ">> Verificacion (tablas en ars_platform): origen vs VPS"
Q="select count(*) from information_schema.tables where table_schema='ars_platform'"
SRC="$(docker compose exec -T postgres psql "$CLEAN_URL" -Atc "$Q")"
DST="$(docker compose exec -T postgres psql -U ars -d "$DB" -Atc "$Q")"
echo "   Neon: $SRC   VPS: $DST"
[ "$SRC" = "$DST" ] && echo "OK: mismo numero de tablas." || { echo "ATENCION: difieren."; exit 1; }
echo "   Guarda $DUMP en un sitio seguro (contiene todos los datos)."
