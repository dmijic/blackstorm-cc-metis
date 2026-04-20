#!/usr/bin/env bash
# first_run.sh — Initial setup for Metis / Blackstorm Command Center
#
# Run once after cloning or after a full docker compose down -v.
# Safe to re-run: idempotent checks guard each step.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"
COMPOSE=(docker compose --project-directory "$ROOT_DIR" -f "$COMPOSE_FILE")

# ── Colours ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERR]${NC}   $*" >&2; exit 1; }
divider() { echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ── 1. .env files ──────────────────────────────────────────────────────────────
divider
info "Checking .env files..."

copy_env() {
  local src="$1" dst="$2"
  if [ -f "${dst}" ]; then
    warn "${dst} already exists — skipping."
  elif [ -f "${src}" ]; then
    cp "${src}" "${dst}"
    info "Created ${dst} from ${src}"
  else
    warn "No .env.example found at ${src}. Skipping — using docker-compose env vars."
  fi
}

copy_env "${ROOT_DIR}/apps/api/.env.example" "${ROOT_DIR}/apps/api/.env"
copy_env "${ROOT_DIR}/apps/web/.env.example" "${ROOT_DIR}/apps/web/.env"
copy_env "${ROOT_DIR}/infra/docker/.env.example" "${ROOT_DIR}/infra/docker/.env"

generate_app_key() {
  if command -v php >/dev/null 2>&1; then
    php -r 'echo "base64:".base64_encode(random_bytes(32));'
    return
  fi

  docker run --rm php:8.4-cli-alpine php -r 'echo "base64:".base64_encode(random_bytes(32));'
}

ensure_env_value() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "${file}" 2>/dev/null; then
    perl -0pi -e "s/^${key}=.*\$/${key}=${value}/m" "${file}"
  else
    printf '\n%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

divider
info "Ensuring APP_KEY exists in apps/api/.env..."
if [ -f "${ROOT_DIR}/apps/api/.env" ]; then
  if grep -q "^APP_KEY=$" "${ROOT_DIR}/apps/api/.env" 2>/dev/null || \
     grep -q "^APP_KEY=base64:$" "${ROOT_DIR}/apps/api/.env" 2>/dev/null || \
     ! grep -q "^APP_KEY=" "${ROOT_DIR}/apps/api/.env" 2>/dev/null; then
    APP_KEY_VALUE="$(generate_app_key)"
    ensure_env_value "${ROOT_DIR}/apps/api/.env" "APP_KEY" "${APP_KEY_VALUE}"
    info "Generated APP_KEY locally and stored it in apps/api/.env"
  else
    warn "APP_KEY already set in apps/api/.env — skipping regeneration."
  fi
fi

# ── 2. Build & start stack ─────────────────────────────────────────────────────
divider
info "Building images and starting stack..."
"${COMPOSE[@]}" up -d --build

# ── 3. Wait for api to become healthy ──────────────────────────────────────────
divider
info "Waiting for API container to become healthy (composer install + php-fpm)..."
info "This can take up to 3 minutes on first run."

TIMEOUT=300
ELAPSED=0
INTERVAL=10

while true; do
  API_CONTAINER_ID="$("${COMPOSE[@]}" ps -q api 2>/dev/null || true)"
  STATUS="$(docker inspect --format='{{.State.Health.Status}}' "${API_CONTAINER_ID}" 2>/dev/null || echo "unknown")"

  if [ "${STATUS}" = "healthy" ]; then
    info "API is healthy."
    break
  fi

  if [ "${ELAPSED}" -ge "${TIMEOUT}" ]; then
    error "API did not become healthy within ${TIMEOUT}s. Check logs: docker compose -f \"${COMPOSE_FILE}\" logs api"
  fi

  echo -n "  Waiting (${ELAPSED}s / ${TIMEOUT}s) — status: ${STATUS}..."
  printf '\r'
  sleep "${INTERVAL}"
  ELAPSED=$((ELAPSED + INTERVAL))
done
printf '\n'

# ── 4. Storage permissions ─────────────────────────────────────────────────────
divider
info "Fixing storage & cache permissions..."
"${COMPOSE[@]}" exec -T api chmod -R 775 storage bootstrap/cache
"${COMPOSE[@]}" exec -T api chown -R www-data:www-data storage bootstrap/cache 2>/dev/null || true

# ── 5. Clear config/cache ──────────────────────────────────────────────────────
divider
info "Clearing config and cache..."
"${COMPOSE[@]}" exec -T api php artisan config:clear
"${COMPOSE[@]}" exec -T api php artisan cache:clear

# ── 6. Migrations ──────────────────────────────────────────────────────────────
divider
info "Running database migrations..."
"${COMPOSE[@]}" exec -T api php artisan migrate --force

# ── 7. Seed ────────────────────────────────────────────────────────────────────
divider
info "Seeding database..."
"${COMPOSE[@]}" exec -T api php artisan db:seed --force

# ── 8. Summary ─────────────────────────────────────────────────────────────────
divider
echo ""
echo -e "${GREEN}  Metis / Blackstorm Command Center is ready.${NC}"
echo ""
echo "  Frontend (Vite):   http://localhost:5173"
echo "  API (nginx):       http://localhost:8000"
echo "  MailHog:           http://localhost:8025"
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
