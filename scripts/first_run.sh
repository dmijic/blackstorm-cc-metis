#!/usr/bin/env bash
# first_run.sh — Initial local setup for Metis / Blackstorm Command Center

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export REPO_ROOT="${ROOT_DIR}"
COMPOSE_ARGS=(
  --env-file "${ROOT_DIR}/infra/docker/.env"
  -f "${ROOT_DIR}/infra/docker/docker-compose.yml"
  -f "${ROOT_DIR}/infra/docker/docker-compose.dev.yml"
)
COMPOSE=(docker compose --project-directory "${ROOT_DIR}" "${COMPOSE_ARGS[@]}")

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERR]${NC}   $*" >&2; exit 1; }
divider() { echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

ensure_env_file() {
  local example_file="$1"
  local target_file="$2"

  if [ -f "${target_file}" ]; then
    warn "${target_file} already exists — keeping it."
    chmod 600 "${target_file}" 2>/dev/null || true
    return
  fi

  if [ -f "${example_file}" ]; then
    install -m 600 "${example_file}" "${target_file}"
    info "Created ${target_file} from ${example_file}"
    return
  fi

  warn "Missing ${example_file}; skipped ${target_file} bootstrap."
}

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

ensure_app_key() {
  local env_file="$1"
  local current_value

  if [ ! -f "${env_file}" ]; then
    warn "Skipping APP_KEY bootstrap because ${env_file} does not exist."
    return
  fi

  current_value="$(grep -E '^APP_KEY=' "${env_file}" 2>/dev/null | head -n 1 | cut -d= -f2- || true)"

  if [ -n "${current_value}" ] && [ "${current_value}" != "base64:" ]; then
    warn "APP_KEY already set in ${env_file} — skipping regeneration."
    return
  fi

  set_env_value "${env_file}" "APP_KEY" "$(generate_app_key)"
  info "Generated APP_KEY locally and stored it in ${env_file}"
}

get_env_value() {
  local file_path="$1"
  local key="$2"

  grep -E "^${key}=" "${file_path}" 2>/dev/null | head -n 1 | cut -d= -f2- || true
}

port_in_use() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltnH "( sport = :${port} )" 2>/dev/null | grep -q .
    return $?
  fi

  return 1
}

ensure_free_host_port() {
  local env_file="$1"
  local key="$2"
  local fallback_port="$3"
  local current_port candidate_port

  current_port="$(get_env_value "${env_file}" "${key}")"
  candidate_port="${current_port:-${fallback_port}}"

  if ! [[ "${candidate_port}" =~ ^[0-9]+$ ]]; then
    candidate_port="${fallback_port}"
  fi

  if ! port_in_use "${candidate_port}"; then
    set_env_value "${env_file}" "${key}" "${candidate_port}"
    return
  fi

  while port_in_use "${candidate_port}"; do
    candidate_port=$((candidate_port + 1))
  done

  set_env_value "${env_file}" "${key}" "${candidate_port}"
  warn "${key} port was busy; switched to ${candidate_port} in ${env_file}"
}

load_compose_ports() {
  WEB_HOST_PORT="$(get_env_value "${ROOT_DIR}/infra/docker/.env" "WEB_HOST_PORT")"
  API_HOST_PORT="$(get_env_value "${ROOT_DIR}/infra/docker/.env" "API_HOST_PORT")"
  POSTGRES_HOST_PORT="$(get_env_value "${ROOT_DIR}/infra/docker/.env" "POSTGRES_HOST_PORT")"
  REDIS_HOST_PORT="$(get_env_value "${ROOT_DIR}/infra/docker/.env" "REDIS_HOST_PORT")"
  MAILHOG_SMTP_HOST_PORT="$(get_env_value "${ROOT_DIR}/infra/docker/.env" "MAILHOG_SMTP_HOST_PORT")"
  MAILHOG_UI_HOST_PORT="$(get_env_value "${ROOT_DIR}/infra/docker/.env" "MAILHOG_UI_HOST_PORT")"
}

wait_for_api_health() {
  local timeout=300
  local elapsed=0
  local interval=10

  divider
  info "Waiting for API container to become healthy..."
  info "This can take up to 3 minutes on first run."

  while true; do
    local container_id status
    container_id="$("${COMPOSE[@]}" ps -q api 2>/dev/null || true)"
    status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || echo "unknown")"

    if [ "${status}" = "healthy" ]; then
      info "API is healthy."
      printf '\n'
      return 0
    fi

    if [ "${elapsed}" -ge "${timeout}" ]; then
      printf '\n'
      error "API did not become healthy within ${timeout}s. Check logs with: docker compose --project-directory \"${ROOT_DIR}\" -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml logs api"
    fi

    printf '  Waiting (%ss / %ss) — status: %s\r' "${elapsed}" "${timeout}" "${status}"
    sleep "${interval}"
    elapsed=$((elapsed + interval))
  done
}

divider
info "Checking local runtime env files..."
ensure_env_file "${ROOT_DIR}/apps/api/.env.example" "${ROOT_DIR}/apps/api/.env"
ensure_env_file "${ROOT_DIR}/apps/web/.env.example" "${ROOT_DIR}/apps/web/.env"
ensure_env_file "${ROOT_DIR}/infra/docker/.env.example" "${ROOT_DIR}/infra/docker/.env"

divider
info "Ensuring APP_KEY exists in apps/api/.env..."
ensure_app_key "${ROOT_DIR}/apps/api/.env"

divider
info "Checking local host port availability..."
ensure_free_host_port "${ROOT_DIR}/infra/docker/.env" "WEB_HOST_PORT" 5173
ensure_free_host_port "${ROOT_DIR}/infra/docker/.env" "API_HOST_PORT" 8000
ensure_free_host_port "${ROOT_DIR}/infra/docker/.env" "POSTGRES_HOST_PORT" 5432
ensure_free_host_port "${ROOT_DIR}/infra/docker/.env" "REDIS_HOST_PORT" 6379
ensure_free_host_port "${ROOT_DIR}/infra/docker/.env" "MAILHOG_SMTP_HOST_PORT" 1025
ensure_free_host_port "${ROOT_DIR}/infra/docker/.env" "MAILHOG_UI_HOST_PORT" 8025
load_compose_ports

divider
info "Building images and starting local development stack..."
"${COMPOSE[@]}" up -d --build

wait_for_api_health

divider
info "Fixing storage and cache permissions..."
"${COMPOSE[@]}" exec -T api chmod -R 775 storage bootstrap/cache
"${COMPOSE[@]}" exec -T api chown -R www-data:www-data storage bootstrap/cache 2>/dev/null || true

divider
info "Clearing config and cache..."
"${COMPOSE[@]}" exec -T api php artisan config:clear
"${COMPOSE[@]}" exec -T api php artisan cache:clear

divider
info "Running database migrations..."
"${COMPOSE[@]}" exec -T api php artisan migrate --force

divider
info "Seeding database..."
"${COMPOSE[@]}" exec -T api php artisan db:seed --force

divider
echo ""
echo -e "${GREEN}  Metis / Blackstorm Command Center is ready.${NC}"
echo ""
echo "  Frontend (Vite):   http://localhost:${WEB_HOST_PORT:-5173}"
echo "  API (nginx):       http://localhost:${API_HOST_PORT:-8000}"
echo "  MailHog:           http://localhost:${MAILHOG_UI_HOST_PORT:-8025}"
echo "  PostgreSQL:        localhost:${POSTGRES_HOST_PORT:-5432}"
echo "  Redis:             localhost:${REDIS_HOST_PORT:-6379}"
echo ""
echo "  Demo accounts (password: Blackstorm123!):"
echo "    admin@blackstorm.local"
echo "    operator@blackstorm.local"
echo "    analyst@blackstorm.local"
echo "    viewer@blackstorm.local"
echo ""
echo "  First migrate after code changes:"
echo "    make migrate"
echo ""
divider
