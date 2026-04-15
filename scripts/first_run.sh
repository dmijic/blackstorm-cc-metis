#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"

copy_env_if_missing() {
  local source_file="$1"
  local target_file="$2"

  if [ ! -f "${target_file}" ]; then
    cp "${source_file}" "${target_file}"
    echo "Created ${target_file}"
  fi
}

copy_env_if_missing "${ROOT_DIR}/apps/api/.env.example" "${ROOT_DIR}/apps/api/.env"
copy_env_if_missing "${ROOT_DIR}/apps/web/.env.example" "${ROOT_DIR}/apps/web/.env"

docker compose -f "${COMPOSE_FILE}" up -d --build

docker compose -f "${COMPOSE_FILE}" exec -T api php artisan key:generate --force
docker compose -f "${COMPOSE_FILE}" exec -T api php artisan migrate --force
docker compose -f "${COMPOSE_FILE}" exec -T api php artisan db:seed --force

echo "First run complete."
