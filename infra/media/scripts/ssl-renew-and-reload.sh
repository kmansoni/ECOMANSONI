#!/usr/bin/env bash
# ============================================================
# ssl-renew-and-reload.sh — Renew Let's Encrypt cert + reload nginx
# ============================================================
# Intended for host cron (e.g. 2x/day).
#
# Behavior:
#   1. Runs certbot renew via docker-compose utility service
#   2. Reloads nginx so updated certificates are picked up
#
# Usage:
#   cd infra/media
#   bash scripts/ssl-renew-and-reload.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$COMPOSE_DIR"

# Ensure nginx is up before renewal/reload.
docker compose up -d nginx >/dev/null

# certbot renew is a no-op when cert is not near expiration.
docker compose run --rm certbot renew \
  --webroot \
  --webroot-path /var/www/certbot \
  --quiet

# Make nginx re-read certificates from /etc/letsencrypt.
docker compose exec -T nginx nginx -s reload

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] SSL renew check completed and nginx reloaded"
