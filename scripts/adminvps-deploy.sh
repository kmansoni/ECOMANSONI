#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/mansoni/app}"
BRANCH="${DEPLOY_BRANCH:-main}"
SYSTEMD_SERVICES="${SYSTEMD_SERVICES:-}"
DRY_RUN="${DRY_RUN:-false}"

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
  echo "Working tree is dirty. Aborting."
  exit 1
fi

if [ "$DRY_RUN" = "true" ]; then
  echo "Dry run enabled. Skipping deploy steps."
  exit 0
fi

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

npm ci
npm run build

if [ -n "$SYSTEMD_SERVICES" ]; then
  for svc in $SYSTEMD_SERVICES; do
    sudo systemctl restart "$svc"
  done
fi

echo "AdminVPS deploy completed."
