#!/bin/bash
# Blue-green deployment для mansoni.ru

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/mansoni/app}"
CURRENT_LINK="$APP_DIR/current"
BLUE_DIR="$APP_DIR/releases/blue"
GREEN_DIR="$APP_DIR/releases/green"
TARGET_ROOT="$CURRENT_LINK"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# Ищем nginx конфиг с root директивой на наш APP_DIR
find_nginx_conf() {
  # Сначала ищем в sites-enabled/sites-available
  for dir in /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d; do
    if [ -d "$dir" ]; then
      for f in "$dir"/*; do
        [ -f "$f" ] || continue
        if grep -q "$APP_DIR" "$f" 2>/dev/null; then
          echo "$f"; return 0
        fi
      done
    fi
  done
  # Fallback: главный конфиг
  [ -f /etc/nginx/nginx.conf ] && echo "/etc/nginx/nginx.conf" && return 0
  echo ""
}

NGINX_CONF=$(find_nginx_conf)
log "Nginx conf: ${NGINX_CONF:-not found}"

# Определяем активный слот
get_active_slot() {
  if [ -L "$CURRENT_LINK" ]; then
    local target
    target=$(readlink "$CURRENT_LINK")
    if [[ "$target" == *"blue"* ]]; then echo "blue"; else echo "green"; fi
  else
    echo "blue"
  fi
}

get_inactive_slot() {
  local active; active=$(get_active_slot)
  if [ "$active" = "blue" ]; then echo "green"; else echo "blue"; fi
}

mkdir -p "$BLUE_DIR" "$GREEN_DIR"

ACTIVE=$(get_active_slot)
INACTIVE=$(get_inactive_slot)
INACTIVE_DIR="$APP_DIR/releases/$INACTIVE"

log "Active slot: $ACTIVE → deploying to: $INACTIVE"

# Копируем dist
if [ -d "$APP_DIR/dist" ]; then
  log "Copying dist → $INACTIVE_DIR"
  rsync -a --delete "$APP_DIR/dist/" "$INACTIVE_DIR/"
else
  log "ERROR: $APP_DIR/dist not found"; exit 1
fi

[ -f "$INACTIVE_DIR/index.html" ] || { log "ERROR: index.html missing"; exit 1; }

log "Smoke test passed — switching nginx to $INACTIVE slot"

# Переключаем symlink
ln -sfn "$INACTIVE_DIR" "$CURRENT_LINK"

# Обновляем nginx root
if [ -n "$NGINX_CONF" ]; then
  if grep -Eq "root[[:space:]]+$APP_DIR/(dist|current|releases/blue|releases/green)" "$NGINX_CONF"; then
    sudo sed -Ei "s|root[[:space:]]+$APP_DIR/(dist|current|releases/blue|releases/green)|root $TARGET_ROOT|g" "$NGINX_CONF"
  else
    log "WARNING: root directive for $APP_DIR not found in $NGINX_CONF"
  fi
  if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx
    log "Nginx reloaded → $TARGET_ROOT ($(readlink -f "$CURRENT_LINK" || echo "unknown"))"
  else
    log "WARNING: nginx -t failed, skipping reload"
  fi
else
  log "WARNING: nginx config not found"
fi

log "Deployment successful — current points to $(readlink -f "$CURRENT_LINK" || echo "unknown")"
