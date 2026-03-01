#!/bin/bash
set -euo pipefail

# Timeweb autonomous deployment script
# This script deploys the application to Timeweb server

SERVER_HOST="${SERVER_HOST:-}"
APP_DIR="/var/app/timeweb"

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1"; exit 1; }; }

need_cmd ssh
need_cmd scp
need_cmd psql

# Check SERVER_HOST
if [[ -z "${SERVER_HOST:-}" ]]; then
  read -p "Server Host: " SERVER_HOST
fi

# --- DB Password: allow non-interactive via env, otherwise prompt ---
if [[ -z "${DB_PASS:-}" ]]; then
  read -s -p "DB Password: " DB_PASS; echo
fi

# --- Transfer migrations ---
echo "Transferring migrations to server..."
scp supabase/migrations/*.sql user@"$SERVER_HOST":/tmp/

# --- Run migrations on server ---
echo "Running migrations..."
ssh user@"$SERVER_HOST" "export PGPASSWORD='$DB_PASS'; psql -U mansoni_app -d mansoni -f /tmp/all-migrations.sql"

# --- Deploy application ---
echo "Deploying application..."
ssh user@"$SERVER_HOST" "cd $APP_DIR && git pull origin main && npm ci --omit=dev && pm2 restart all"

echo "✅ Timeweb deployment completed."
