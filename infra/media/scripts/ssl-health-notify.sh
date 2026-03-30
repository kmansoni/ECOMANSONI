#!/usr/bin/env bash
# ============================================================
# ssl-health-notify.sh — Run TLS health check and notify Telegram
# ============================================================
# Sends Telegram alert only when ssl-cert-health.sh returns:
#   1 (warning) or 2 (critical)
#
# Required env vars in .env:
#   TELEGRAM_BOT_TOKEN
#   TELEGRAM_CHAT_ID
#
# Optional env vars:
#   TLS_NOTIFY_COOLDOWN_HOURS (default: 24)
#   TLS_NOTIFY_CRITICAL_REPEAT_HOURS (default: 6)
#   TLS_NOTIFY_STATE_FILE (default: /tmp/media-ssl-alert-state.env)
#
# Usage:
#   cd infra/media
#   bash scripts/ssl-health-notify.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$COMPOSE_DIR/.env"
CHECK_SCRIPT="$SCRIPT_DIR/ssl-cert-health.sh"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "CRITICAL: $ENV_FILE not found" >&2
  exit 2
fi
if [[ ! -f "$CHECK_SCRIPT" ]]; then
  echo "CRITICAL: $CHECK_SCRIPT not found" >&2
  exit 2
fi

# shellcheck source=/dev/null
set -a; source "$ENV_FILE"; set +a

BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_CHAT_ID:-}"
DOMAIN="${MEDIA_DOMAIN:-unknown-domain}"
HOSTNAME_VALUE="$(hostname 2>/dev/null || echo unknown-host)"
COOLDOWN_HOURS="${TLS_NOTIFY_COOLDOWN_HOURS:-24}"
CRITICAL_REPEAT_HOURS="${TLS_NOTIFY_CRITICAL_REPEAT_HOURS:-6}"
STATE_FILE="${TLS_NOTIFY_STATE_FILE:-/tmp/media-ssl-alert-state.env}"

if [[ -z "$BOT_TOKEN" || -z "$CHAT_ID" ]]; then
  echo "CRITICAL: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in .env" >&2
  exit 2
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "CRITICAL: curl not found on host" >&2
  exit 2
fi
if ! command -v sha256sum >/dev/null 2>&1; then
  echo "CRITICAL: sha256sum not found on host" >&2
  exit 2
fi

set +e
CHECK_OUTPUT="$(bash "$CHECK_SCRIPT" 2>&1)"
CHECK_EXIT=$?
set -e

if [[ $CHECK_EXIT -eq 0 ]]; then
  echo "$CHECK_OUTPUT"
  exit 0
fi

SEVERITY="WARNING"
if [[ $CHECK_EXIT -eq 2 ]]; then
  SEVERITY="CRITICAL"
fi

ALERT_KEY_INPUT="${SEVERITY}|${DOMAIN}|${CHECK_OUTPUT}"
ALERT_HASH="$(printf '%s' "$ALERT_KEY_INPUT" | sha256sum | awk '{print $1}')"
NOW_EPOCH="$(date -u +%s)"
COOLDOWN_SECONDS=$((COOLDOWN_HOURS * 3600))
CRITICAL_REPEAT_SECONDS=$((CRITICAL_REPEAT_HOURS * 3600))

LAST_HASH=""
LAST_SENT_EPOCH="0"
if [[ -f "$STATE_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$STATE_FILE" || true
  LAST_HASH="${LAST_HASH:-}"
  LAST_SENT_EPOCH="${LAST_SENT_EPOCH:-0}"
fi

if [[ "$ALERT_HASH" == "$LAST_HASH" ]]; then
  AGE_SECONDS=$((NOW_EPOCH - LAST_SENT_EPOCH))

  # Escalation policy:
  # - WARNING: respect normal cooldown.
  # - CRITICAL: resend periodically even if fingerprint is unchanged.
  if [[ "$SEVERITY" == "CRITICAL" ]]; then
    if ((AGE_SECONDS < CRITICAL_REPEAT_SECONDS)); then
      echo "ALERT_SKIPPED: duplicate CRITICAL within repeat interval (hours=$CRITICAL_REPEAT_HOURS, domain=$DOMAIN)"
      exit $CHECK_EXIT
    fi
  else
    if ((AGE_SECONDS < COOLDOWN_SECONDS)); then
      echo "ALERT_SKIPPED: duplicate within cooldown (hours=$COOLDOWN_HOURS, domain=$DOMAIN, severity=$SEVERITY)"
      exit $CHECK_EXIT
    fi
  fi
fi

MESSAGE="[$SEVERITY] TLS health alert\n"
MESSAGE+="host=$HOSTNAME_VALUE\n"
MESSAGE+="domain=$DOMAIN\n"
MESSAGE+="time=$(date -u +'%Y-%m-%dT%H:%M:%SZ')\n\n"
MESSAGE+="$CHECK_OUTPUT"

curl -fsS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT_ID}" \
  --data-urlencode "text=${MESSAGE}" >/dev/null

cat > "$STATE_FILE" <<EOF
LAST_HASH="$ALERT_HASH"
LAST_SENT_EPOCH="$NOW_EPOCH"
EOF

echo "ALERT_SENT: $SEVERITY for $DOMAIN"
exit $CHECK_EXIT
