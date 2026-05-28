#!/usr/bin/env bash
set -euo pipefail

# Автозагрузка секретов из .secrets/credentials.env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECRETS_FILE="$SCRIPT_DIR/../.secrets/credentials.env"
if [ -f "$SECRETS_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
  set +a
  echo "Secrets loaded from .secrets/credentials.env"
fi

APP_DIR="${APP_DIR:-/opt/mansoni/app}"
BRANCH="${DEPLOY_BRANCH:-main}"
SYSTEMD_SERVICES="${SYSTEMD_SERVICES:-}"
DRY_RUN="${DRY_RUN:-false}"

resolve_env_value() {
  local preferred="$1"
  local fallback="$2"

  if [ -n "$preferred" ]; then
    printf '%s' "$preferred"
    return
  fi

  printf '%s' "$fallback"
}

ensure_frontend_env() {
  local env_file="$APP_DIR/.env.production"
  local supabase_url
  local supabase_key
  local calls_ws_urls

  supabase_url="$(resolve_env_value "${VITE_SUPABASE_URL:-}" "${SUPABASE_URL:-}")"
  supabase_key="$(resolve_env_value "${VITE_SUPABASE_PUBLISHABLE_KEY:-}" "${VITE_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}")"
  calls_ws_urls="$(resolve_env_value "${VITE_CALLS_V2_WS_URLS:-}" "${CALLS_V2_WS_URLS:-}")"

  if [ -f "$env_file" ]; then
    if [ -z "$supabase_url" ]; then
      supabase_url="$(grep -E '^VITE_SUPABASE_URL=' "$env_file" | head -n1 | cut -d'=' -f2- | tr -d '"' || true)"
    fi
    if [ -z "$supabase_key" ]; then
      supabase_key="$(grep -E '^VITE_SUPABASE_PUBLISHABLE_KEY=' "$env_file" | head -n1 | cut -d'=' -f2- | tr -d '"' || true)"
    fi
    if [ -z "$calls_ws_urls" ]; then
      calls_ws_urls="$(grep -E '^VITE_CALLS_V2_WS_URLS=' "$env_file" | head -n1 | cut -d'=' -f2- | tr -d '"' || true)"
    fi
  fi

  if [ -z "$supabase_url" ] || [ -z "$supabase_key" ]; then
    echo "Missing Supabase frontend env. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in deploy environment."
    exit 1
  fi

  if [ -z "$calls_ws_urls" ]; then
    calls_ws_urls="wss://sfu-ru.mansoni.ru/ws"
  fi

  touch "$env_file"

  upsert_env() {
    local key="$1"
    local value="$2"
    if grep -qE "^${key}=" "$env_file"; then
      sed -i "s#^${key}=.*#${key}=\"${value}\"#" "$env_file"
    else
      printf '%s="%s"\n' "$key" "$value" >> "$env_file"
    fi
  }

  upsert_env "VITE_SUPABASE_URL" "$supabase_url"
  upsert_env "VITE_SUPABASE_PUBLISHABLE_KEY" "$supabase_key"
  upsert_env "VITE_CALLS_V2_WS_URLS" "$calls_ws_urls"
}

if [ ! -d "$APP_DIR/.git" ]; then
  echo "APP_DIR is not a git repo: $APP_DIR"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed on AdminVPS."
  exit 1
fi

cd "$APP_DIR"

if [ -n "$(git status --porcelain)" ]; then
  stamp="$(date +%Y%m%d-%H%M%S)"
  stash_msg="auto-deploy-stash-$stamp"
  echo "Working tree is dirty. Creating stash: $stash_msg"
  git stash push -u -m "$stash_msg" >/dev/null
fi

if [ "$DRY_RUN" = "true" ]; then
  echo "Dry run enabled. Skipping deploy steps."
  exit 0
fi

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

ensure_frontend_env

npm ci
npm run build

# Ensure nginx symlink current → dist exists after every build
ln -sfn "$APP_DIR/dist" "$APP_DIR/current"
echo "Symlink updated: $APP_DIR/current -> $APP_DIR/dist"

if [ -n "$SYSTEMD_SERVICES" ]; then
  for svc in $SYSTEMD_SERVICES; do
    sudo systemctl restart "$svc"
  done
fi

echo "AdminVPS deploy completed."
