#!/usr/bin/env bash
# Despliega la version actual de `main` en esta VPS.
#
#   - git pull --ff-only
#   - reconstruye SOLO lo que cambio desde el ultimo despliegue correcto
#   - docker compose up -d --wait (espera a que todo quede "healthy")
#
# Lo ejecuta GitHub Actions por SSH en cada push a main (con CI en verde), y se
# puede lanzar a mano:  bash ~/ars-platform/deploy/scripts/update.sh
# Reconstruirlo todo a la fuerza:  FORCE_ALL=1 bash .../update.sh
#
# El ultimo commit desplegado con exito se guarda en deploy/.deployed-commit; si
# un despliegue falla a medias, el siguiente vuelve a intentar lo pendiente.
set -euo pipefail

# Todo dentro de una funcion y `exit` al final: `git pull` puede reemplazar este
# mismo archivo mientras bash lo lee, y asi se lee entero antes de ejecutarse.
main() {
  local ROOT
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$ROOT"

  # Un solo despliegue a la vez.
  exec 9>/tmp/ars-deploy.lock
  flock 9

  git pull --ff-only
  local NEW OLD STATE
  NEW="$(git rev-parse HEAD)"
  STATE="$ROOT/deploy/.deployed-commit"
  OLD="$(cat "$STATE" 2>/dev/null || true)"
  if [ -n "$OLD" ] && ! git cat-file -e "${OLD}^{commit}" 2>/dev/null; then OLD=""; fi

  local ALL="iam product-rating party reference-data underwriting claims billing social-impact documents gateway"
  local build=" "
  add() { case "$build" in *" $1 "*) ;; *) build="$build$1 " ;; esac; }

  if [ -z "$OLD" ] || [ "${FORCE_ALL:-0}" = "1" ]; then
    for s in $ALL web; do add "$s"; done
    echo ">> Reconstruccion completa (sin despliegue previo registrado o FORCE_ALL=1)"
  else
    local f d
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      case "$f" in
        package.json|package-lock.json|tsconfig.base.json)
          for s in $ALL web; do add "$s"; done ;;
        packages/*)
          for s in $ALL; do add "$s"; done ;;
        services/*/*)
          d="${f#services/}"; d="${d%%/*}"; add "${d%-service}" ;;
        apps/*|deploy/web/*)
          add web ;;
      esac
    done < <(git diff --name-only "$OLD" "$NEW")
    echo ">> Cambios desde ${OLD:0:7} hasta ${NEW:0:7}"
  fi

  cd "$ROOT/deploy"
  if [ -n "${build// /}" ]; then
    echo ">> Reconstruyendo:${build}"
    # shellcheck disable=SC2086
    COMPOSE_PARALLEL_LIMIT=2 docker compose build $build
  else
    echo ">> Nada que reconstruir (solo documentacion/config)"
  fi

  echo ">> Levantando y esperando a que todo este healthy..."
  docker compose up -d --wait --wait-timeout 240

  echo "$NEW" > "$STATE"
  docker image prune -f >/dev/null
  docker compose ps
  echo ">> Despliegue correcto: ${NEW:0:7}"
}

main "$@"
exit $?
