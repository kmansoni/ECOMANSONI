#!/usr/bin/env bash
# ============================================================
# ssl-init.sh — First-time TLS certificate issuance
# ============================================================
# Run this ONCE on a fresh server BEFORE starting the full
# docker-compose stack for the first time.
#
# Usage:
#   cd infra/media
#   cp .env.example .env          # fill in LETSENCRYPT_EMAIL etc.
#   bash scripts/ssl-init.sh
#
# What it does:
#   1. Reads MEDIA_DOMAIN and LETSENCRYPT_EMAIL from .env
#   2. Stops nginx (if already running) to free port 80
#   3. Runs certbot/certbot in standalone mode → obtains cert
#   4. Starts the full stack
#
# After the first run, configure host cron with
# scripts/ssl-renew-and-reload.sh for automatic renewal.
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(dirname "$SCRIPT_DIR")"

# ---- Load .env -------------------------------------------------------
ENV_FILE="$COMPOSE_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found." >&2
  echo "       Copy .env.example → .env and fill in all values." >&2
  exit 1
fi
# shellcheck source=/dev/null
set -a; source "$ENV_FILE"; set +a

DOMAIN="${MEDIA_DOMAIN:-}"
EMAIL="${LETSENCRYPT_EMAIL:-}"

if [[ -z "$DOMAIN" ]]; then
  echo "ERROR: MEDIA_DOMAIN is not set in .env" >&2; exit 1
fi
if [[ -z "$EMAIL" ]]; then
  echo "ERROR: LETSENCRYPT_EMAIL is not set in .env" >&2; exit 1
fi

# ---- Check if cert already exists -----------------------------------
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
if docker compose run --rm certbot sh -c "test -f '$CERT_PATH'" 2>/dev/null; then
  echo "INFO: Certificate already exists at $CERT_PATH"
  echo "      To force re-issue add --force-renewal to the certbot call below."
  echo "      Skipping issuance. Starting stack..."
  cd "$COMPOSE_DIR"
  docker compose up -d
  exit 0
fi

# ---- Stop nginx to free port 80 -------------------------------------
echo "==> Stopping nginx (freeing port 80 for standalone challenge)..."
cd "$COMPOSE_DIR"
docker compose stop nginx 2>/dev/null || true

# ---- Obtain certificate (standalone mode) ---------------------------
echo "==> Requesting certificate for $DOMAIN from Let's Encrypt..."
docker compose run --rm \
  --publish 80:80 \
  certbot certonly \
    --standalone \
    --preferred-challenges http \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --domain "$DOMAIN"

echo ""
echo "==> Certificate obtained successfully:"
echo "    fullchain : /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "    privkey   : /etc/letsencrypt/live/$DOMAIN/privkey.pem"
echo ""

# ---- Start full stack -----------------------------------------------
echo "==> Starting full stack..."
docker compose up -d

echo ""
echo "==> Done! $DOMAIN is now serving HTTPS."
echo "    Next step: configure cron for scripts/ssl-renew-and-reload.sh"
