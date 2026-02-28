#!/usr/bin/env bash
set -euo pipefail

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

  supabase_url="$(resolve_env_value "${VITE_SUPABASE_URL:-}" "${SUPABASE_URL:-}")"
  supabase_key="$(resolve_env_value "${VITE_SUPABASE_PUBLISHABLE_KEY:-}" "${VITE_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}")"

  if [ -f "$env_file" ]; then
    if [ -z "$supabase_url" ]; then
      supabase_url="$(grep -E '^VITE_SUPABASE_URL=' "$env_file" | head -n1 | cut -d'=' -f2- | tr -d '"' || true)"
    fi
    if [ -z "$supabase_key" ]; then
      supabase_key="$(grep -E '^VITE_SUPABASE_PUBLISHABLE_KEY=' "$env_file" | head -n1 | cut -d'=' -f2- | tr -d '"' || true)"
    fi
  fi

  if [ -z "$supabase_url" ] || [ -z "$supabase_key" ]; then
    echo "Missing Supabase frontend env. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in deploy environment."
    exit 1
  fi

  cat > "$env_file" <<EOF
VITE_SUPABASE_URL="$supabase_url"
VITE_SUPABASE_PUBLISHABLE_KEY="$supabase_key"
EOF
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

if [ -n "$SYSTEMD_SERVICES" ]; then
  for svc in $SYSTEMD_SERVICES; do
    sudo systemctl restart "$svc"
  done
fi

echo "AdminVPS deploy completed."
