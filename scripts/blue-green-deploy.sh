#!/bin/bash
# Blue-green deployment для mansoni.ru
# Держит две копии dist: blue и green
# Переключает nginx между ними без даунтайма

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/mansoni/app}"
NGINX_CONF="/etc/nginx/sites-available/mansoni-api"
BLUE_DIR="$APP_DIR/releases/blue"
GREEN_DIR="$APP_DIR/releases/green"
CURRENT_LINK="$APP_DIR/current"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

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
  local active
  active=$(get_active_slot)
  if [ "$active" = "blue" ]; then echo "green"; else echo "blue"; fi
}

# Подготовка директорий
mkdir -p "$BLUE_DIR" "$GREEN_DIR"

ACTIVE=$(get_active_slot)
INACTIVE=$(get_inactive_slot)
INACTIVE_DIR="$APP_DIR/releases/$INACTIVE"

log "Active slot: $ACTIVE → deploying to: $INACTIVE"

# Копируем новый dist в неактивный слот
if [ -d "$APP_DIR/dist" ]; then
  log "Copying dist → $INACTIVE_DIR"
  rsync -a --delete "$APP_DIR/dist/" "$INACTIVE_DIR/"
else
  log "ERROR: $APP_DIR/dist not found"
  exit 1
fi

# Smoke test нового слота (проверяем что index.html есть)
if [ ! -f "$INACTIVE_DIR/index.html" ]; then
  log "ERROR: index.html missing in $INACTIVE_DIR — aborting"
  exit 1
fi

log "Smoke test passed — switching nginx to $INACTIVE slot"

# Переключаем symlink
ln -sfn "$INACTIVE_DIR" "$CURRENT_LINK"

# Обновляем nginx root на новый слот
sudo sed -i "s|root $APP_DIR/releases/$ACTIVE|root $INACTIVE_DIR|g" "$NGINX_CONF"

# Проверяем конфиг и перезагружаем nginx (graceful reload — без даунтайма)
sudo nginx -t
sudo systemctl reload nginx

log "Switched to $INACTIVE slot. Active: $INACTIVE"

# Финальная проверка
sleep 2
HTTP=$(curl -o /dev/null -s -w "%{http_code}" --max-time 10 http://localhost/health || echo "000")
if [ "$HTTP" != "200" ]; then
  log "ERROR: health check failed ($HTTP) — rolling back to $ACTIVE"
  ln -sfn "$APP_DIR/releases/$ACTIVE" "$CURRENT_LINK"
  sudo sed -i "s|root $INACTIVE_DIR|root $APP_DIR/releases/$ACTIVE|g" "$NGINX_CONF"
  sudo systemctl reload nginx
  log "Rollback complete — still on $ACTIVE"
  exit 1
fi

log "Deployment successful — serving from $INACTIVE slot"
