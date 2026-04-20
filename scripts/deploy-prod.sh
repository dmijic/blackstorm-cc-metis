#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="${ROOT_DIR}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
SERVER_CONFIG_DIR="${SERVER_CONFIG_DIR:-/opt/metis-config}"
SKIP_GIT_SYNC="${SKIP_GIT_SYNC:-0}"

API_ENV_SOURCE="${SERVER_CONFIG_DIR}/apps-api.env"
WEB_ENV_SOURCE="${SERVER_CONFIG_DIR}/apps-web.env"
COMPOSE_ENV_SOURCE="${SERVER_CONFIG_DIR}/compose.env"

COMPOSE_ARGS=(
  --env-file "${REPO_DIR}/infra/docker/.env"
  -f "${REPO_DIR}/infra/docker/docker-compose.yml"
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

generate_app_key() {
  if command -v php >/dev/null 2>&1; then
    php -r 'echo "base64:".base64_encode(random_bytes(32));'
    return
  fi

  docker run --rm php:8.4-cli-alpine php -r 'echo "base64:".base64_encode(random_bytes(32));'
}

set_env_value() {
  local file_path="$1"
  local key="$2"
  local value="$3"
  local tmp_file

  mkdir -p "$(dirname "${file_path}")"
  touch "${file_path}"
  tmp_file="$(mktemp)"

  awk -v key="${key}" -v value="${value}" '
    BEGIN { updated = 0 }
    index($0, key "=") == 1 {
      print key "=" value
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) {
        print key "=" value
      }
    }
  ' "${file_path}" > "${tmp_file}"

  mv "${tmp_file}" "${file_path}"
  chmod 600 "${file_path}" 2>/dev/null || true
}

ensure_env_file() {
  local label="$1"
  local source_file="$2"
  local target_file="$3"
  local example_file="$4"

  if [ -f "${source_file}" ]; then
    install -m 600 "${source_file}" "${target_file}"
    info "Loaded ${label} from ${source_file}"
    return
  fi

  if [ -f "${target_file}" ]; then
    info "Using existing ${label} at ${target_file}"
    chmod 600 "${target_file}" 2>/dev/null || true
    return
  fi

  if [ -f "${example_file}" ]; then
    install -m 600 "${example_file}" "${target_file}"
    warn "${label} missing; bootstrapped ${target_file} from ${example_file}"
    return
  fi

  fail "Missing ${label}: neither ${target_file} nor ${example_file} exists"
}

normalize_api_env_for_production() {
  local env_file="$1"

  set_env_value "${env_file}" "APP_ENV" "production"
  set_env_value "${env_file}" "APP_DEBUG" "false"
  set_env_value "${env_file}" "APP_URL" "https://blackstorm.dariomijic.com"
  set_env_value "${env_file}" "APP_FRONTEND_URL" "https://blackstorm.dariomijic.com"
  set_env_value "${env_file}" "LOG_LEVEL" "info"
  set_env_value "${env_file}" "DB_CONNECTION" "pgsql"
  set_env_value "${env_file}" "DB_HOST" "postgres"
  set_env_value "${env_file}" "DB_PORT" "5432"
  set_env_value "${env_file}" "DB_DATABASE" "blackstorm"
  set_env_value "${env_file}" "DB_USERNAME" "blackstorm"
  set_env_value "${env_file}" "DB_PASSWORD" "blackstorm"
  set_env_value "${env_file}" "CACHE_STORE" "redis"
  set_env_value "${env_file}" "QUEUE_CONNECTION" "redis"
  set_env_value "${env_file}" "REDIS_CLIENT" "predis"
  set_env_value "${env_file}" "SESSION_DRIVER" "file"
  set_env_value "${env_file}" "SESSION_SECURE_COOKIE" "true"
  set_env_value "${env_file}" "SESSION_SAME_SITE" "lax"
  set_env_value "${env_file}" "REDIS_HOST" "redis"
  set_env_value "${env_file}" "REDIS_PORT" "6379"
  set_env_value "${env_file}" "MAIL_HOST" "mailhog"
  set_env_value "${env_file}" "MAIL_PORT" "1025"
  set_env_value "${env_file}" "SANCTUM_STATEFUL_DOMAINS" "blackstorm.dariomijic.com"
  set_env_value "${env_file}" "CORS_ALLOWED_ORIGINS" "https://blackstorm.dariomijic.com"
}

normalize_web_env_for_production() {
  local env_file="$1"

  set_env_value "${env_file}" "VITE_API_URL" "/api"
}

normalize_compose_env_for_production() {
  local env_file="$1"

  set_env_value "${env_file}" "APP_ENV" "production"
  set_env_value "${env_file}" "APP_DEBUG" "false"
  set_env_value "${env_file}" "APP_URL" "https://blackstorm.dariomijic.com"
  set_env_value "${env_file}" "APP_FRONTEND_URL" "https://blackstorm.dariomijic.com"
  set_env_value "${env_file}" "LOG_LEVEL" "info"
  set_env_value "${env_file}" "DB_CONNECTION" "pgsql"
  set_env_value "${env_file}" "DB_HOST" "postgres"
  set_env_value "${env_file}" "DB_PORT" "5432"
  set_env_value "${env_file}" "DB_DATABASE" "blackstorm"
  set_env_value "${env_file}" "DB_USERNAME" "blackstorm"
  set_env_value "${env_file}" "DB_PASSWORD" "blackstorm"
  set_env_value "${env_file}" "CACHE_STORE" "redis"
  set_env_value "${env_file}" "QUEUE_CONNECTION" "redis"
  set_env_value "${env_file}" "REDIS_CLIENT" "predis"
  set_env_value "${env_file}" "SESSION_SECURE_COOKIE" "true"
  set_env_value "${env_file}" "SESSION_SAME_SITE" "lax"
  set_env_value "${env_file}" "SANCTUM_STATEFUL_DOMAINS" "blackstorm.dariomijic.com"
  set_env_value "${env_file}" "CORS_ALLOWED_ORIGINS" "https://blackstorm.dariomijic.com"
  set_env_value "${env_file}" "VITE_API_URL" "/api"
}

ensure_app_key() {
  local env_file="$1"
  local current_value

  current_value="$(grep -E '^APP_KEY=' "${env_file}" 2>/dev/null | head -n 1 | cut -d= -f2- || true)"

  if [ -n "${current_value}" ] && [ "${current_value}" != "base64:" ]; then
    info "APP_KEY already present in ${env_file}"
    return
  fi

  set_env_value "${env_file}" "APP_KEY" "$(generate_app_key)"
  warn "APP_KEY was missing; generated a new key in ${env_file}"
}

load_runtime_env() {
  export REPO_ROOT="${REPO_DIR}"
  set -a
  if [ -f "${REPO_DIR}/apps/api/.env" ]; then
    # shellcheck disable=SC1091
    source "${REPO_DIR}/apps/api/.env"
  fi
  if [ -f "${REPO_DIR}/apps/web/.env" ]; then
    # shellcheck disable=SC1091
    source "${REPO_DIR}/apps/web/.env"
  fi
  if [ -f "${REPO_DIR}/infra/docker/.env" ]; then
    # shellcheck disable=SC1091
    source "${REPO_DIR}/infra/docker/.env"
  fi
  set +a

  WEB_HOST_PORT="${WEB_HOST_PORT:-5173}"
  API_HOST_PORT="${API_HOST_PORT:-8000}"
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

print_listening_summary() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn | grep -E ':(80|443|5173|8000|5432|6379|8025|1025)\s' || true
    return
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(80|443|5173|8000|5432|6379|8025|1025)\b' || true
    return
  fi

  warn "Neither ss nor lsof is available; skipping listening port summary."
}

divider
info "Deploying branch origin/${DEPLOY_BRANCH} into ${REPO_DIR}"

if [ "${SKIP_GIT_SYNC}" = "1" ]; then
  warn "SKIP_GIT_SYNC=1 set; skipping git fetch/reset."
else
  git -C "${REPO_DIR}" fetch origin
  git -C "${REPO_DIR}" reset --hard "origin/${DEPLOY_BRANCH}"
fi

api_env_from_server=0
web_env_from_server=0
compose_env_from_server=0
[ -f "${API_ENV_SOURCE}" ] && api_env_from_server=1
[ -f "${WEB_ENV_SOURCE}" ] && web_env_from_server=1
[ -f "${COMPOSE_ENV_SOURCE}" ] && compose_env_from_server=1

ensure_env_file "API env" "${API_ENV_SOURCE}" "${REPO_DIR}/apps/api/.env" "${REPO_DIR}/apps/api/.env.example"
ensure_env_file "Web env" "${WEB_ENV_SOURCE}" "${REPO_DIR}/apps/web/.env" "${REPO_DIR}/apps/web/.env.example"
ensure_env_file "Compose env" "${COMPOSE_ENV_SOURCE}" "${REPO_DIR}/infra/docker/.env" "${REPO_DIR}/infra/docker/.env.example"

if [ "${api_env_from_server}" != "1" ]; then
  normalize_api_env_for_production "${REPO_DIR}/apps/api/.env"
  info "Normalized fallback API env for production-safe deploy defaults"
fi

if [ "${web_env_from_server}" != "1" ]; then
  normalize_web_env_for_production "${REPO_DIR}/apps/web/.env"
  info "Normalized fallback Web env for production-safe deploy defaults"
fi

if [ "${compose_env_from_server}" != "1" ]; then
  normalize_compose_env_for_production "${REPO_DIR}/infra/docker/.env"
  info "Normalized fallback Compose env for production-safe deploy defaults"
fi

ensure_app_key "${REPO_DIR}/apps/api/.env"
load_runtime_env

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
curl -fsS "http://127.0.0.1:${API_HOST_PORT}/api/health" || fail "API health endpoint failed."
echo ""
curl -fsSI "http://127.0.0.1:${WEB_HOST_PORT}" >/dev/null || fail "Web health probe failed."
info "Web preview reachable on 127.0.0.1:${WEB_HOST_PORT}"

divider
info "Listening port summary"
print_listening_summary

divider
info "Production deploy completed."
