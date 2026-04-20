#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/metis-config/apps-api.env}"
DEPLOY_CMD="${DEPLOY_CMD:-/srv/blackstorm-command-center/scripts/deploy-prod.sh}"
BACKUP_DIR="${BACKUP_DIR:-/root/metis-key-rotation-backups}"
MODE="${1:-rotate}"   # rotate | finalize | status

mkdir -p "$BACKUP_DIR"

fail() {
  echo "[ERR] $*" >&2
  exit 1
}

info() {
  echo "[INFO] $*"
}

require_file() {
  [ -f "$1" ] || fail "Missing file: $1"
}

get_env_value() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true
}

set_env_value() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$value" '
      BEGIN { done=0 }
      $0 ~ ("^" k "=") { print k "=" v; done=1; next }
      { print }
      END { if (!done) print k "=" v }
    ' "$ENV_FILE" > "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

append_previous_key() {
  local old_key="$1"
  local current_prev
  current_prev="$(get_env_value APP_PREVIOUS_KEYS)"

  if [ -z "$old_key" ]; then
    fail "Old APP_KEY is empty"
  fi

  if [ -z "$current_prev" ]; then
    set_env_value APP_PREVIOUS_KEYS "$old_key"
    return
  fi

  IFS=',' read -r -a arr <<< "$current_prev"
  for item in "${arr[@]}"; do
    if [ "$item" = "$old_key" ]; then
      return
    fi
  done

  set_env_value APP_PREVIOUS_KEYS "${current_prev},${old_key}"
}

remove_previous_key() {
  local key_to_remove="$1"
  local current_prev new_prev
  current_prev="$(get_env_value APP_PREVIOUS_KEYS)"

  if [ -z "$current_prev" ]; then
    return
  fi

  IFS=',' read -r -a arr <<< "$current_prev"
  new_prev=""
  for item in "${arr[@]}"; do
    [ "$item" = "$key_to_remove" ] && continue
    if [ -z "$new_prev" ]; then
      new_prev="$item"
    else
      new_prev="${new_prev},${item}"
    fi
  done

  set_env_value APP_PREVIOUS_KEYS "$new_prev"
}

generate_key() {
  php -r 'echo "base64:".base64_encode(random_bytes(32)).PHP_EOL;'
}

show_status() {
  require_file "$ENV_FILE"
  echo "ENV_FILE=$ENV_FILE"
  echo "APP_KEY=$(get_env_value APP_KEY)"
  echo "APP_PREVIOUS_KEYS=$(get_env_value APP_PREVIOUS_KEYS)"
}

rotate_key() {
  require_file "$ENV_FILE"
  [ -x "$DEPLOY_CMD" ] || fail "Deploy script is not executable: $DEPLOY_CMD"

  local ts backup_file old_key new_key
  ts="$(date +%F-%H%M%S)"
  backup_file="${BACKUP_DIR}/apps-api.env.${ts}.bak"

  cp "$ENV_FILE" "$backup_file"
  info "Backup created: $backup_file"

  old_key="$(get_env_value APP_KEY)"
  [ -n "$old_key" ] || fail "APP_KEY not found in $ENV_FILE"

  new_key="$(generate_key)"
  [ -n "$new_key" ] || fail "Failed to generate new APP_KEY"

  info "Rotating APP_KEY..."
  set_env_value APP_KEY "$new_key"
  append_previous_key "$old_key"

  info "Running deploy..."
  "$DEPLOY_CMD"

  info "Rotation complete."
  echo
  echo "NEXT:"
  echo "1) Re-save all encrypted external service / AI provider secrets in the app UI."
  echo "2) When finished, run:"
  echo "   $0 finalize \"$old_key\""
}

finalize_rotation() {
  require_file "$ENV_FILE"
  [ -x "$DEPLOY_CMD" ] || fail "Deploy script is not executable: $DEPLOY_CMD"

  local old_key="${2:-}"
  if [ -z "$old_key" ]; then
    fail "Usage: $0 finalize '<old_app_key>'"
  fi

  info "Removing old key from APP_PREVIOUS_KEYS..."
  remove_previous_key "$old_key"

  info "Running deploy..."
  "$DEPLOY_CMD"

  info "Finalize complete."
}

case "$MODE" in
  rotate)
    rotate_key
    ;;
  finalize)
    finalize_rotation "$@"
    ;;
  status)
    show_status
    ;;
  *)
    fail "Unknown mode: $MODE (use: rotate | finalize | status)"
    ;;
esac