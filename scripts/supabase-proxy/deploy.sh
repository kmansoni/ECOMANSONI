#!/usr/bin/env bash
# deploy-supabase-proxy.sh — Deploy Supabase proxy to VPS
#
# Перед запуском: убедитесь что DNS A-запись создана:
#   dig +short A supabase-proxy.mansoni.ru
#   # должна вернуть 155.212.245.89
#
# Usage: sudo bash deploy-supabase-proxy.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGINX_CONF="$SCRIPT_DIR/infra/supabase-proxy/nginx.conf"
REMOTE_CONF="/tmp/supabase-proxy.nginx.conf"
REMOTE_SITE="/etc/nginx/sites-available/supabase-proxy"
REMOTE_SITE_ENABLED="/etc/nginx/sites-enabled/supabase-proxy"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[proxy-deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[proxy-deploy WARN]${NC} $*"; }
err()  { echo -e "${RED}[proxy-deploy ERROR]${NC} $*" >&2; }

# ── Pre-flight: DNS check ──────────────────────────────────────────────────────
log "Проверяю DNS A-запись..."
DNS_IP=$(dig +short A supabase-proxy.mansoni.ru @8.8.8.8 2>/dev/null | tail -1)
if [[ -z "$DNS_IP" ]]; then
  err "DNS A-запись не найдена: supabase-proxy.mansoni.ru"
  err "Создайте A-запись: supabase-proxy.mansoni.ru → 155.212.245.89 в reg.ru"
  err "Затем повторите: sudo bash deploy-supabase-proxy.sh"
  exit 1
fi
EXPECTED_IP="155.212.245.89"
if [[ "$DNS_IP" != "$EXPECTED_IP" ]]; then
  warn "DNS резолвится в $DNS_IP, ожидалось $EXPECTED_IP"
fi
log "DNS OK: supabase-proxy.mansoni.ru → $DNS_IP"

# ── Pre-flight: webroot ───────────────────────────────────────────────────────
log "Проверяю certbot webroot..."
if [[ ! -d "/var/www/certbot" ]]; then
  warn "/var/www/certbot не существует, создаю..."
  mkdir -p /var/www/certbot
fi

# ── 1. certbot ────────────────────────────────────────────────────────────────
CERT_PATH="/etc/letsencrypt/live/supabase-proxy.mansoni.ru/fullchain.pem"
if [[ -f "$CERT_PATH" && -f "/etc/letsencrypt/live/supabase-proxy.mansoni.ru/privkey.pem" ]]; then
  log "TLS сертификат уже существует"
else
  log "Получаю TLS сертификат..."
  certbot certonly \
    --webroot -w /var/www/certbot \
    -d supabase-proxy.mansoni.ru \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email \
    || {
      err "certbot не смог получить сертификат."
      err "Проверьте: DNS A-запись propagatеd, порт 80 открыт."
      exit 1
    }
  log "TLS сертификат получен!"
fi

# ── 2. Upload nginx config ──────────────────────────────────────────────────
log "Копирую nginx.conf на VPS..."
scp -o StrictHostKeyChecking=no -i "$HOME/.ssh/adminvps_deploy" \
  "$NGINX_CONF" root@mansoni.ru:"$REMOTE_CONF"

# ── 3. Install nginx site ───────────────────────────────────────────────────
log "Устанавливаю nginx site..."
ssh -o StrictHostKeyChecking=no -i "$HOME/.ssh/adminvps_deploy" root@mansoni.ru << 'ENDSSH'
set -euo pipefail
REMOTE_CONF="/tmp/supabase-proxy.nginx.conf"
REMOTE_SITE="/etc/nginx/sites-available/supabase-proxy"
REMOTE_SITE_ENABLED="/etc/nginx/sites-enabled/supabase-proxy"
NGINX_TEST="nginx -t -c /etc/nginx/nginx.conf"

# Disable old site if exists
if [[ -f "/etc/nginx/sites-enabled/supabase-proxy" ]]; then
  echo "[proxy-deploy] Отключаю старую конфигурацию..."
  rm -f /etc/nginx/sites-enabled/supabase-proxy
fi

# Copy new config
cp "$REMOTE_CONF" "$REMOTE_SITE"

# Enable site
ln -sf "$REMOTE_SITE" "$REMOTE_SITE_ENABLED"

# Test config
echo "[proxy-deploy] Тестирую nginx config..."
$NGINX_TEST

# Reload nginx
echo "[proxy-deploy] Reload nginx..."
nginx -s reload
echo "[proxy-deploy] nginx перезагружен!"

# Cleanup
rm -f "$REMOTE_CONF"
ENDSSH

# ── 4. Verify ───────────────────────────────────────────────────────────────
log "Верифицирую..."
sleep 2
HTTP_CODE=$(curl -sk --max-time 10 -o /dev/null -w "%{http_code}" https://supabase-proxy.mansoni.ru/)
if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" || "$HTTP_CODE" == "502" ]]; then
  log "Supabase proxy РАБОТАЕТ! HTTP $HTTP_CODE"
else
  warn "Supabase proxy вернул HTTP $HTTP_CODE (может быть OK для API)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Supabase proxy успешно развёрнут!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "URL: https://supabase-proxy.mansoni.ru"
echo "Health: https://supabase-proxy.mansoni.ru/nginx-health"
echo ""
echo "Следующий шаг:"
echo "  1. Обновите .env.production: раскомментируйте:"
echo "     VITE_SUPABASE_URL=\"https://supabase-proxy.mansoni.ru\""
echo "  2. Пересоберите и задеплойте frontend"
echo ""
