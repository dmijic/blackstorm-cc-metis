#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="${ROOT_DIR}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
SERVER_CONFIG_DIR="${SERVER_CONFIG_DIR:-/opt/metis-config}"

API_ENV_SOURCE="${SERVER_CONFIG_DIR}/apps-api.env"
WEB_ENV_SOURCE="${SERVER_CONFIG_DIR}/apps-web.env"
COMPOSE_ENV_SOURCE="${SERVER_CONFIG_DIR}/compose.env"

COMPOSE_ARGS=(
  -f "${REPO_DIR}/infra/docker/docker-compose.yml"
  -f "${REPO_DIR}/infra/docker/docker-compose.prod.yml"
)
COMPOSE=(docker compose "${COMPOSE_ARGS[@]}")

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail() { echo -e "${RED}[ERR]${NC}   $*" >&2; exit 1; }
divider() { echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

require_file() {
  local file_path="$1"
  [ -f "${file_path}" ] || fail "Missing required file: ${file_path}"
}

copy_env_file() {
  local source_file="$1"
  local target_file="$2"

  install -m 600 "${source_file}" "${target_file}"
  info "Copied $(basename "${source_file}") -> ${target_file}"
}

load_server_env() {
  set -a
  export REPO_ROOT="${REPO_DIR}"
  # shellcheck disable=SC1090
  source "${API_ENV_SOURCE}"
  # shellcheck disable=SC1090
  source "${WEB_ENV_SOURCE}"
  if [ -f "${COMPOSE_ENV_SOURCE}" ]; then
    # shellcheck disable=SC1090
    source "${COMPOSE_ENV_SOURCE}"
  fi
  set +a
}

wait_for_service() {
  local service_name="$1"
  local timeout_seconds="${2:-300}"
  local elapsed=0
  local interval=5

  info "Waiting for ${service_name} to become healthy..."

  while true; do
    local container_id
    container_id="$("${COMPOSE[@]}" --project-directory "${REPO_DIR}" ps -q "${service_name}" 2>/dev/null || true)"

    if [ -n "${container_id}" ]; then
      local status
      status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || echo "unknown")"

      if [ "${status}" = "healthy" ] || [ "${status}" = "running" ]; then
        info "${service_name} status: ${status}"
        return 0
      fi

      printf '  %s status: %s (%ss/%ss)\r' "${service_name}" "${status}" "${elapsed}" "${timeout_seconds}"
    fi

    if [ "${elapsed}" -ge "${timeout_seconds}" ]; then
      printf '\n'
      fail "${service_name} did not become healthy within ${timeout_seconds}s"
    fi

    sleep "${interval}"
    elapsed=$((elapsed + interval))
  done
}

divider
info "Deploying branch origin/${DEPLOY_BRANCH} into ${REPO_DIR}"
require_file "${API_ENV_SOURCE}"
require_file "${WEB_ENV_SOURCE}"

git -C "${REPO_DIR}" fetch origin
git -C "${REPO_DIR}" reset --hard "origin/${DEPLOY_BRANCH}"

copy_env_file "${API_ENV_SOURCE}" "${REPO_DIR}/apps/api/.env"
copy_env_file "${WEB_ENV_SOURCE}" "${REPO_DIR}/apps/web/.env"

if [ -f "${COMPOSE_ENV_SOURCE}" ]; then
  copy_env_file "${COMPOSE_ENV_SOURCE}" "${REPO_DIR}/infra/docker/.env"
elif [ -f "${REPO_DIR}/infra/docker/.env.example" ]; then
  install -m 600 "${REPO_DIR}/infra/docker/.env.example" "${REPO_DIR}/infra/docker/.env"
  warn "compose.env not found in ${SERVER_CONFIG_DIR}; using infra/docker/.env.example defaults."
fi

load_server_env

divider
info "Building and starting production compose stack..."
"${COMPOSE[@]}" --project-directory "${REPO_DIR}" up -d --build --remove-orphans

wait_for_service api 420
wait_for_service proxy 180
wait_for_service web 420

divider
info "Running Laravel migrations and cache cleanup..."
"${COMPOSE[@]}" --project-directory "${REPO_DIR}" exec -T api php artisan migrate --force
"${COMPOSE[@]}" --project-directory "${REPO_DIR}" exec -T api php artisan optimize:clear

divider
info "Restarting queue worker and scheduler to pick up fresh code..."
"${COMPOSE[@]}" --project-directory "${REPO_DIR}" restart worker scheduler

divider
info "Container status"
"${COMPOSE[@]}" --project-directory "${REPO_DIR}" ps

divider
info "Health checks"
curl -fsS "http://127.0.0.1:${API_HOST_PORT:-8000}/api/health" || fail "API health endpoint failed."
echo ""
curl -fsSI "http://127.0.0.1:${WEB_HOST_PORT:-5173}" >/dev/null || fail "Web health probe failed."
info "Web preview reachable on 127.0.0.1:${WEB_HOST_PORT:-5173}"

divider
info "Listening port summary"
ss -ltn | grep -E ':(80|443|5173|8000|5432|6379|8025|1025)\s' || true

divider
info "Production deploy completed."
