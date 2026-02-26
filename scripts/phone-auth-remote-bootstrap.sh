#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:-/opt/mansoni-phone-auth}"
DB_NAME="${2:-mansoni}"
DB_USER="${3:-mansoni_app}"
DB_PASSWORD="${4:-PmkvlEnBRrIdS4MCbV56}"
PORT="${5:-3001}"

if ! command -v npm >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y nodejs npm
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

if ! command -v psql >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y postgresql postgresql-contrib
fi

systemctl enable postgresql >/dev/null 2>&1 || true
systemctl start postgresql

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
fi

sudo -u postgres psql -d "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null

mkdir -p "${APP_PATH}"
cd "${APP_PATH}"

if [ ! -f .jwt_secret ]; then
  openssl rand -base64 32 > .jwt_secret
fi

JWT_SECRET_VALUE="$(cat .jwt_secret)"
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}"
export JWT_SECRET="${JWT_SECRET_VALUE}"
export PHONE_AUTH_PORT="${PORT}"
export NODE_ENV="production"

npm install --production

if pm2 describe phone-auth >/dev/null 2>&1; then
  pm2 restart phone-auth --update-env
else
  pm2 start index.mjs --name phone-auth --cwd "${APP_PATH}"
fi

pm2 save || true
sleep 2
curl -fsS "http://127.0.0.1:${PORT}/health"
