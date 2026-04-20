#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_BASE="${ROOT_DIR}/infra/docker/docker-compose.yml"
COMPOSE_PROD="${ROOT_DIR}/infra/docker/docker-compose.prod.yml"
DEPLOY_SCRIPT="${ROOT_DIR}/scripts/deploy-prod.sh"
export REPO_ROOT="${ROOT_DIR}"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC}  $*"; }
fail() { echo -e "${RED}[FAIL]${NC}  $*" >&2; exit 1; }

assert_contains() {
  local file_path="$1"
  local expected="$2"
  grep -Fq "${expected}" "${file_path}" || fail "${file_path} is missing: ${expected}"
}

tracked_env_files="$(git -C "${ROOT_DIR}" ls-files | grep -E '(^|/)\.env$|(^|/)[^/]+\.env$' || true)"
[ -z "${tracked_env_files}" ] || fail "Tracked env files found:\n${tracked_env_files}"
pass "No tracked runtime .env files remain in git"

hardcoded_app_key_matches="$(git -C "${ROOT_DIR}" ls-files -z | xargs -0 rg -n 'APP_KEY[:=][[:space:]]*base64:[A-Za-z0-9+/=]{20,}' || true)"
[ -z "${hardcoded_app_key_matches}" ] || fail "Hardcoded APP_KEY still present in tracked files:\n${hardcoded_app_key_matches}"
pass "No tracked hardcoded APP_KEY values found"

assert_contains "${COMPOSE_PROD}" '127.0.0.1:${WEB_HOST_PORT:-5173}:5173'
assert_contains "${COMPOSE_PROD}" '127.0.0.1:${API_HOST_PORT:-8000}:80'
assert_contains "${COMPOSE_PROD}" '127.0.0.1:${POSTGRES_HOST_PORT:-5432}:5432'
assert_contains "${COMPOSE_PROD}" '127.0.0.1:${REDIS_HOST_PORT:-6379}:6379'
assert_contains "${COMPOSE_PROD}" '127.0.0.1:${MAILHOG_SMTP_HOST_PORT:-1025}:1025'
assert_contains "${COMPOSE_PROD}" '127.0.0.1:${MAILHOG_UI_HOST_PORT:-8025}:8025'
pass "Production override keeps web/api/postgres/redis/mailhog loopback-bound"

assert_contains "${DEPLOY_SCRIPT}" 'infra/docker/docker-compose.yml'
assert_contains "${DEPLOY_SCRIPT}" 'infra/docker/docker-compose.prod.yml'
assert_contains "${DEPLOY_SCRIPT}" '/opt/metis-config'
assert_contains "${DEPLOY_SCRIPT}" 'apps-api.env'
assert_contains "${DEPLOY_SCRIPT}" 'apps-web.env'
pass "Deploy script uses both compose files and copies server-only env files"

if [ -d "${ROOT_DIR}/apps/web/dist" ]; then
  build_localhost_hits="$(rg -n 'localhost:8000|127\.0\.0\.1:8000|localhost:5173|127\.0\.0\.1:5173' "${ROOT_DIR}/apps/web/dist" || true)"
  [ -z "${build_localhost_hits}" ] || fail "Frontend build still references localhost:\n${build_localhost_hits}"
  pass "Built frontend does not reference localhost API or Vite URLs"
else
  echo "Built frontend not present; run 'npm run build' in apps/web and rerun this script to verify built assets."
fi

docker compose -f "${COMPOSE_BASE}" -f "${COMPOSE_PROD}" --project-directory "${ROOT_DIR}" config >/dev/null
pass "docker compose base + production override parses successfully"
