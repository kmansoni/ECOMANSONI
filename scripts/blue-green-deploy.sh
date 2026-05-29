#!/bin/bash
# Deployment для mansoni.ru — копирует dist и переключает symlink current → dist

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/mansoni/app}"
CURRENT_LINK="$APP_DIR/current"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

[ -d "$APP_DIR/dist" ] || { log "ERROR: $APP_DIR/dist not found"; exit 1; }
[ -f "$APP_DIR/dist/index.html" ] || { log "ERROR: index.html missing in dist"; exit 1; }

log "Pointing current → dist"
ln -sfn "$APP_DIR/dist" "$CURRENT_LINK"

# Reload nginx if config references APP_DIR
NGINX_CONF=""
for dir in /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d; do
  [ -d "$dir" ] || continue
  for f in "$dir"/*; do
    [ -f "$f" ] || continue
    if grep -q "$APP_DIR" "$f" 2>/dev/null; then NGINX_CONF="$f"; break 2; fi
  done
done

if [ -n "$NGINX_CONF" ] && sudo nginx -t 2>/dev/null; then
  sudo systemctl reload nginx
  log "Nginx reloaded"
fi

log "Deployment successful — current → $(readlink -f "$CURRENT_LINK")"
