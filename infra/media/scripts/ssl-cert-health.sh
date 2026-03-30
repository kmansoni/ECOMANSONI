#!/usr/bin/env bash
# ============================================================
# ssl-cert-health.sh — TLS certificate expiry health check
# ============================================================
# Checks the remote certificate for MEDIA_DOMAIN:443 and exits:
#   0 = healthy (days left > warning threshold)
#   1 = warning (days left <= warning threshold)
#   2 = expired / invalid / cannot read certificate
#
# Usage:
#   cd infra/media
#   bash scripts/ssl-cert-health.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$COMPOSE_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "CRITICAL: $ENV_FILE not found" >&2
  exit 2
fi

# shellcheck source=/dev/null
set -a; source "$ENV_FILE"; set +a

DOMAIN="${MEDIA_DOMAIN:-}"
WARNING_DAYS="${TLS_EXPIRY_WARNING_DAYS:-21}"

if [[ -z "$DOMAIN" ]]; then
  echo "CRITICAL: MEDIA_DOMAIN is not set in .env" >&2
  exit 2
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "CRITICAL: openssl not found on host" >&2
  exit 2
fi

if ! command -v date >/dev/null 2>&1; then
  echo "CRITICAL: date command not found on host" >&2
  exit 2
fi

CERT_END_RAW="$(
  echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null \
    | sed 's/^notAfter=//'
)"

if [[ -z "$CERT_END_RAW" ]]; then
  echo "CRITICAL: could not read certificate from $DOMAIN:443" >&2
  exit 2
fi

EXPIRY_EPOCH="$(date -d "$CERT_END_RAW" +%s 2>/dev/null || true)"
NOW_EPOCH="$(date -u +%s)"

if [[ -z "$EXPIRY_EPOCH" ]]; then
  echo "CRITICAL: failed to parse certificate date: $CERT_END_RAW" >&2
  exit 2
fi

SECONDS_LEFT=$((EXPIRY_EPOCH - NOW_EPOCH))
DAYS_LEFT=$((SECONDS_LEFT / 86400))

UTC_EXPIRY="$(date -u -d "@$EXPIRY_EPOCH" +"%Y-%m-%dT%H:%M:%SZ")"

if ((SECONDS_LEFT <= 0)); then
  echo "CRITICAL: TLS certificate for $DOMAIN is expired (expired_at=$UTC_EXPIRY)" >&2
  exit 2
fi

if ((DAYS_LEFT <= WARNING_DAYS)); then
  echo "WARNING: TLS certificate for $DOMAIN expires soon (days_left=$DAYS_LEFT, expires_at=$UTC_EXPIRY, warning_days=$WARNING_DAYS)"
  exit 1
fi

echo "OK: TLS certificate for $DOMAIN is valid (days_left=$DAYS_LEFT, expires_at=$UTC_EXPIRY, warning_days=$WARNING_DAYS)"
