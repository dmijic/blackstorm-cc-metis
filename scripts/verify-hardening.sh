#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_BASE="${ROOT_DIR}/infra/docker/docker-compose.yml"
COMPOSE_DEV="${ROOT_DIR}/infra/docker/docker-compose.dev.yml"
DEPLOY_SCRIPT="${ROOT_DIR}/scripts/deploy-prod.sh"
API_BASE_UTIL="${ROOT_DIR}/apps/web/src/lib/apiBase.js"
export REPO_ROOT="${ROOT_DIR}"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC}  $*"; }
fail() { echo -e "${RED}[FAIL]${NC}  $*" >&2; exit 1; }

assert_contains() {
  local file_path="$1"
  local expected="$2"
  grep -Fq -- "${expected}" "${file_path}" || fail "${file_path} is missing: ${expected}"
}

assert_not_contains() {
  local file_path="$1"
  local forbidden="$2"
  if grep -Fq -- "${forbidden}" "${file_path}"; then
    fail "${file_path} should not contain: ${forbidden}"
  fi
}

assert_service_has_no_ports() {
  local file_path="$1"
  local service_name="$2"

  if awk -v service="${service_name}" '
    $0 ~ "^  " service ":" { in_service = 1; next }
    in_service && $0 ~ "^  [a-zA-Z0-9_-]+:" { in_service = 0 }
    in_service && $0 ~ "^    ports:" { found = 1 }
    END { exit(found ? 0 : 1) }
  ' "${file_path}"; then
    fail "${file_path} should not expose host ports for service ${service_name}"
  fi
}

check_runtime_port() {
  local port="$1"
  local label="$2"
  local expected_mode="$3"
  local lines addresses

  if command -v ss >/dev/null 2>&1; then
    lines="$(ss -ltnH "( sport = :${port} )" 2>/dev/null || true)"
    addresses="$(printf '%s\n' "${lines}" | awk '{print $4}' || true)"
  elif command -v lsof >/dev/null 2>&1; then
    lines="$(lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
    addresses="$(printf '%s\n' "${lines}" | awk 'NR > 1 {print $9}' || true)"
  else
    pass "Neither ss nor lsof is available; skipped runtime check for ${label}"
    return 0
  fi

  if [ -z "${addresses}" ]; then
    pass "${label} is not listening on the host"
    return 0
  fi

  case "${expected_mode}" in
    loopback)
      if echo "${addresses}" | grep -Ev '^(127\.0\.0\.1|localhost|\[::1\]|::1):' >/dev/null; then
        fail "${label} is listening on a non-loopback address:\n${lines}"
      fi
      pass "${label} is loopback-bound at runtime"
      ;;
    not-public)
      if echo "${addresses}" | grep -E '^(0\.0\.0\.0|\[\:\:\]|:::)' >/dev/null; then
        fail "${label} is publicly exposed:\n${lines}"
      fi
      pass "${label} is not publicly exposed at runtime"
      ;;
    *)
      fail "Unknown runtime check mode: ${expected_mode}"
      ;;
  esac
}

tracked_env_files="$(git -C "${ROOT_DIR}" ls-files | grep -E '(^|/)\.env$|(^|/)[^/]+\.env$' || true)"
[ -z "${tracked_env_files}" ] || fail "Tracked env files found:\n${tracked_env_files}"
pass "No tracked runtime .env files remain in git"

hardcoded_app_key_matches="$(git -C "${ROOT_DIR}" grep -n -E 'APP_KEY[:=][[:space:]]*base64:[A-Za-z0-9+/=]{20,}' -- . || true)"
[ -z "${hardcoded_app_key_matches}" ] || fail "Hardcoded APP_KEY still present in tracked files:\n${hardcoded_app_key_matches}"
pass "No tracked hardcoded APP_KEY values found"

assert_contains "${COMPOSE_BASE}" '127.0.0.1:${WEB_HOST_PORT:-5173}:5173'
assert_contains "${COMPOSE_BASE}" '127.0.0.1:${API_HOST_PORT:-8000}:80'
assert_service_has_no_ports "${COMPOSE_BASE}" 'postgres'
assert_service_has_no_ports "${COMPOSE_BASE}" 'redis'
assert_service_has_no_ports "${COMPOSE_BASE}" 'mailhog'
pass "Base compose keeps only web/proxy host bindings and does not expose postgres/redis/mailhog"

assert_contains "${COMPOSE_DEV}" '127.0.0.1:${POSTGRES_HOST_PORT:-5432}:5432'
assert_contains "${COMPOSE_DEV}" '127.0.0.1:${REDIS_HOST_PORT:-6379}:6379'
assert_contains "${COMPOSE_DEV}" '127.0.0.1:${MAILHOG_SMTP_HOST_PORT:-1025}:1025'
assert_contains "${COMPOSE_DEV}" '127.0.0.1:${MAILHOG_UI_HOST_PORT:-8025}:8025'
pass "Dev override adds loopback-only helper service ports"

assert_contains "${DEPLOY_SCRIPT}" 'infra/docker/docker-compose.yml'
assert_contains "${DEPLOY_SCRIPT}" '--env-file "${REPO_DIR}/infra/docker/.env"'
assert_not_contains "${DEPLOY_SCRIPT}" 'docker-compose.prod.yml'
assert_contains "${DEPLOY_SCRIPT}" 'ensure_env_file'
assert_contains "${DEPLOY_SCRIPT}" 'SKIP_GIT_SYNC'
pass "Deploy script uses repo-contained production compose with optional fallback env handling"

assert_contains "${API_BASE_UTIL}" 'const DEFAULT_API_BASE_URL = "/api";'
assert_contains "${API_BASE_UTIL}" 'if (!isLocalHostname(currentHostname) && isUnsafeLocalhostBase(configuredBase))'
pass "Frontend source uses /api as the production-safe API base"

if [ -d "${ROOT_DIR}/apps/web/dist" ]; then
  build_localhost_hits="$(rg -n 'localhost:8000|127\.0\.0\.1:8000|localhost:5173|127\.0\.0\.1:5173' "${ROOT_DIR}/apps/web/dist" || true)"
  [ -z "${build_localhost_hits}" ] || fail "Frontend build still references localhost:\n${build_localhost_hits}"
  pass "Built frontend does not reference localhost API or Vite URLs"
else
  pass "Built frontend assets not present; source-level localhost fallback guard verified"
fi

docker compose -f "${COMPOSE_BASE}" --project-directory "${ROOT_DIR}" config >/dev/null
pass "docker compose base config parses successfully"

docker compose -f "${COMPOSE_BASE}" -f "${COMPOSE_DEV}" --project-directory "${ROOT_DIR}" config >/dev/null
pass "docker compose base + dev override parses successfully"

check_runtime_port 5173 "Web preview" loopback
check_runtime_port 8000 "API proxy" loopback
check_runtime_port 5432 "Postgres" not-public
check_runtime_port 6379 "Redis" not-public
check_runtime_port 1025 "MailHog SMTP" not-public
check_runtime_port 8025 "MailHog UI" not-public
