#!/usr/bin/env bash
# bootstrap-coturn.sh — полная настройка coturn TURN-сервера на VPS
#
# Что делает:
#   1. Определяет публичный IPv4 и подставляет в external-ip
#   2. Генерирует shared secret (если не задан) и обновляет turnserver.prod.conf
#   3. Получает TLS-сертификат через certbot (Let's Encrypt)
#   4. Выводит готовые значения для Supabase secrets (TURN_URLS, TURN_SHARED_SECRET)
#
# Использование:
#   sudo bash infra/calls/coturn/bootstrap-coturn.sh [DOMAIN]
#
# DOMAIN — домен TURN-сервера (default: turn.mansoni.ru)
#
# Требования: Debian/Ubuntu, root или NOPASSWD sudo, открытые порты 80 (certbot), 3478, 5349.
set -euo pipefail

DOMAIN="${1:-turn.mansoni.ru}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONF_FILE="$SCRIPT_DIR/turnserver.prod.conf"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[coturn-bootstrap]${NC} $*"; }
warn() { echo -e "${YELLOW}[coturn-bootstrap] WARN:${NC} $*"; }
err()  { echo -e "${RED}[coturn-bootstrap] ERROR:${NC} $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  exec sudo bash "$0" "$@"
fi

if [[ ! -f "$CONF_FILE" ]]; then
  err "turnserver.prod.conf не найден: $CONF_FILE"
  exit 1
fi

# ── 1. Определение публичного IP ─────────────────────────────────────────────
log "Определяю публичный IPv4..."
PUBLIC_IP=""
for svc in "https://ifconfig.me" "https://api.ipify.org" "https://ipinfo.io/ip" "https://checkip.amazonaws.com"; do
  PUBLIC_IP=$(curl -sf --max-time 5 "$svc" 2>/dev/null | tr -d '[:space:]') && break
done

if [[ -z "$PUBLIC_IP" ]]; then
  err "Не удалось определить публичный IP. Задайте вручную:"
  err "  sed -i 's/external-ip=.*/external-ip=YOUR_IP/' $CONF_FILE"
  exit 1
fi

# Валидация IPv4
if ! [[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  err "Полученный IP не похож на IPv4: $PUBLIC_IP"
  exit 1
fi

log "Публичный IP: $PUBLIC_IP"

CURRENT_EIP=$(grep -E '^external-ip=' "$CONF_FILE" | head -1 | cut -d= -f2-)
if [[ "$CURRENT_EIP" == "REPLACE_WITH_PUBLIC_IP" || -z "$CURRENT_EIP" ]]; then
  sed -i "s/^external-ip=.*/external-ip=$PUBLIC_IP/" "$CONF_FILE"
  log "external-ip обновлён → $PUBLIC_IP"
else
  log "external-ip уже задан: $CURRENT_EIP (пропускаю)"
fi

# ── 2. Shared secret ────────────────────────────────────────────────────────
log "Проверяю shared secret..."
CURRENT_SECRET=$(grep -E '^static-auth-secret=' "$CONF_FILE" | head -1 | cut -d= -f2-)

if [[ "$CURRENT_SECRET" == "CHANGE_ME_USE_OPENSSL_RAND_HEX_32" || -z "$CURRENT_SECRET" ]]; then
  NEW_SECRET=$(openssl rand -hex 32)
  sed -i "s/^static-auth-secret=.*/static-auth-secret=$NEW_SECRET/" "$CONF_FILE"
  log "Сгенерирован новый shared secret"
  CURRENT_SECRET="$NEW_SECRET"
else
  log "Shared secret уже задан (пропускаю)"
fi

# ── 3. TLS-сертификат (Let's Encrypt) ───────────────────────────────────────
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
KEY_PATH="/etc/letsencrypt/live/$DOMAIN/privkey.pem"

if [[ -f "$CERT_PATH" && -f "$KEY_PATH" ]]; then
  log "TLS-сертификат уже существует: $CERT_PATH"
else
  log "Получаю TLS-сертификат для $DOMAIN..."

  if ! command -v certbot &>/dev/null; then
    log "Устанавливаю certbot..."
    apt-get update -qq
    apt-get install -y -qq certbot
  fi

  # Проверяем DNS
  RESOLVED_IP=$(dig +short "$DOMAIN" A 2>/dev/null | head -1)
  if [[ "$RESOLVED_IP" != "$PUBLIC_IP" ]]; then
    warn "DNS $DOMAIN → $RESOLVED_IP, ожидался $PUBLIC_IP"
    warn "Убедитесь, что A-запись указывает на этот сервер"
  fi

  # Останавливаем coturn если занимает порт 443 или 80
  if systemctl is-active --quiet coturn 2>/dev/null; then
    systemctl stop coturn || true
  fi

  certbot certonly \
    --standalone \
    --preferred-challenges http \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email \
    || {
      err "certbot не смог получить сертификат."
      err "Проверьте: DNS A-запись $DOMAIN → $PUBLIC_IP, порт 80 открыт."
      exit 1
    }

  # Права для coturn (Docker volume mount — read-only, но на хосте нужно видеть)
  if id turnserver &>/dev/null; then
    chown -R turnserver:turnserver "/etc/letsencrypt/live/$DOMAIN/" 2>/dev/null || true
    chown -R turnserver:turnserver "/etc/letsencrypt/archive/$DOMAIN/" 2>/dev/null || true
  fi

  log "TLS-сертификат получен: $CERT_PATH"
fi

# Обновляем пути в конфиге если домен отличается
sed -i "s|^cert=.*|cert=/etc/letsencrypt/live/$DOMAIN/fullchain.pem|" "$CONF_FILE"
sed -i "s|^pkey=.*|pkey=/etc/letsencrypt/live/$DOMAIN/privkey.pem|" "$CONF_FILE"

# Обновляем realm и server-name
sed -i "s/^realm=.*/realm=${DOMAIN#turn.}/" "$CONF_FILE"
sed -i "s/^server-name=.*/server-name=$DOMAIN/" "$CONF_FILE"

# ── 4. Certbot auto-renew hook ──────────────────────────────────────────────
RENEW_HOOK="/etc/letsencrypt/renewal-hooks/deploy/coturn-restart.sh"
if [[ ! -f "$RENEW_HOOK" ]]; then
  mkdir -p "$(dirname "$RENEW_HOOK")"
  cat > "$RENEW_HOOK" << 'HOOK'
#!/bin/bash
# Перезапуск coturn после обновления сертификата
docker restart coturn 2>/dev/null || systemctl restart coturn 2>/dev/null || true
HOOK
  chmod +x "$RENEW_HOOK"
  log "Certbot renewal hook установлен"
fi

# ── 5. Firewall (ufw) ───────────────────────────────────────────────────────
if command -v ufw &>/dev/null && ufw status | grep -q "active"; then
  log "Открываю порты в ufw..."
  ufw allow 3478/udp comment "STUN/TURN UDP"
  ufw allow 3478/tcp comment "TURN TCP"
  ufw allow 5349/tcp comment "TURNS TLS"
  ufw allow 49160:49200/udp comment "TURN relay range"
  log "Порты открыты"
fi

# ── 6. Итоговый вывод ───────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}coturn настроен!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Конфиг:       $CONF_FILE"
echo "Public IP:    $PUBLIC_IP"
echo "Domain:       $DOMAIN"
echo "TLS cert:     $CERT_PATH"
echo ""
echo "─── Следующие шаги ───"
echo ""
echo "1. Запустить coturn:"
echo "   docker compose -f infra/calls/docker-compose.prod.yml up -d coturn"
echo ""
echo "2. Задать Supabase Edge Function secrets:"
echo ""
echo "   supabase secrets set TURN_SHARED_SECRET=\"$CURRENT_SECRET\""
echo ""
echo "   supabase secrets set TURN_URLS=\"turn:$DOMAIN:3478?transport=udp,turn:$DOMAIN:3478?transport=tcp,turns:$DOMAIN:5349?transport=tcp\""
echo ""
echo "   supabase secrets set TURN_TTL_SECONDS=\"3600\""
echo ""
echo "3. Проверить TURN:"
echo "   # Из браузера: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/"
echo "   # STUN/TURN URI: turn:$DOMAIN:3478"
echo "   # Username: любой (для shared secret — через Edge Function)"
echo ""
echo "4. Задать .env.local (для локальной разработки с prod TURN):"
echo "   TURN_SHARED_SECRET=\"$CURRENT_SECRET\""
echo "   TURN_URLS=\"turn:$DOMAIN:3478?transport=udp,turn:$DOMAIN:3478?transport=tcp,turns:$DOMAIN:5349?transport=tcp\""
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
