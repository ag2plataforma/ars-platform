#!/usr/bin/env bash
# Actualiza la app: trae los ultimos commits de main, reconstruye y reinicia.
# Uso (en la VPS, como deploy):  bash ~/ars-platform/deploy/scripts/update.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
git pull --ff-only
cd deploy
COMPOSE_PARALLEL_LIMIT=2 docker compose build
docker compose up -d
docker image prune -f
docker compose ps
