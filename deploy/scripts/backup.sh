#!/usr/bin/env bash
# Backup diario de Postgres (pg_dump formato custom, comprimido).
# Retencion local BACKUP_KEEP_DAYS (14 por defecto). Si BACKUP_RCLONE_REMOTE
# esta definido y rclone instalado, sube tambien una copia fuera de la VPS.
#
# Programar (como deploy):  crontab -e
#   15 3 * * * /home/deploy/ars-platform/deploy/scripts/backup.sh >> /var/log/ars-backup.log 2>&1
# (crea antes el log:  sudo touch /var/log/ars-backup.log && sudo chown deploy /var/log/ars-backup.log)
set -euo pipefail
cd "$(dirname "$0")/.."
# Lee una variable de deploy/.env SIN ejecutar el archivo (un valor con
# espacios, p. ej. EMAIL_SENDER_NAME=ARS Platform, rompe un `source`).
envval() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; }
DB="$(envval POSTGRES_DB)"; DB="${DB:-ars}"
BACKUP_KEEP_DAYS="$(envval BACKUP_KEEP_DAYS)"
BACKUP_RCLONE_REMOTE="$(envval BACKUP_RCLONE_REMOTE)"
DIR="${BACKUP_DIR:-$HOME/ars-backups}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DIR"
FILE="$DIR/ars-$(date +%Y%m%d-%H%M%S).dump"

docker compose exec -T postgres pg_dump -U ars -d "$DB" --format=custom --no-owner > "$FILE"
[ -s "$FILE" ] || { echo "$(date -Is) backup vacio" >&2; rm -f "$FILE"; exit 1; }
echo "$(date -Is) OK $FILE ($(du -h "$FILE" | cut -f1))"

find "$DIR" -name 'ars-*.dump' -mtime +"$KEEP" -delete

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$FILE" "$BACKUP_RCLONE_REMOTE" && echo "$(date -Is) subido a $BACKUP_RCLONE_REMOTE"
fi
