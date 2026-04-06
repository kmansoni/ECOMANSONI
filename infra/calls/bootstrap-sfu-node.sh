#!/usr/bin/env bash
# bootstrap-sfu-node.sh — provision a fresh SFU node with calls-ws + sfu services
#
# Usage:
#   bash infra/calls/bootstrap-sfu-node.sh [APP_DIR] [REGION]
#
# APP_DIR  — where the repo lives (default: /opt/mansoni/app)
# REGION   — ru | tr | ae (used only for log labels; default: unknown)
#
# What this script does:
#   1. Creates system user 'mansoni' if missing
#   2. Installs Node.js 20 LTS via NodeSource if not present
#   3. Installs Redis if not present (used as calls-ws mailbox)
#   4. Clones the repo into APP_DIR if not present, or pulls latest
#   5. Runs npm ci (production deps)
#   6. Writes SFU_ANNOUNCED_IP into server/sfu/.env.production if not already set
#   7. Installs & starts the calls-ws + sfu systemd services
#   8. Sets up PM2 as a fallback if systemd is unavailable
#
# Requirements: Debian/Ubuntu. Run as root or with NOPASSWD sudo.
set -euo pipefail

APP_DIR="${1:-/opt/mansoni/app}"
REGION="${2:-unknown}"
SERVICE_WS="calls-ws"
SERVICE_SFU="sfu"
REPO_URL="https://github.com/kmansoni/ECOMANSONI.git"
LOG_DIR="/var/log/mansoni"
SYSTEMD_WS_SRC="$APP_DIR/infra/calls/calls-ws.service"
SYSTEMD_WS_DST="/etc/systemd/system/calls-ws.service"
SYSTEMD_SFU_SRC="$APP_DIR/infra/calls/sfu.service"
SYSTEMD_SFU_DST="/etc/systemd/system/sfu.service"
PM2_CONFIG="$APP_DIR/infra/calls/pm2.config.cjs"

log()  { echo "[bootstrap:$REGION] $*"; }
step() { echo ""; log "==> $*"; }

# ── 0. Require root / sudo ───────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  # Re-run under sudo
  exec sudo bash "$0" "$@"
fi

# ── 1. System user ───────────────────────────────────────────────────────────
step "Ensuring system user 'mansoni'"
if ! id mansoni &>/dev/null; then
  useradd -r -m -d /opt/mansoni -s /bin/bash mansoni
  log "User 'mansoni' created."
else
  log "User 'mansoni' already exists."
fi

mkdir -p "$LOG_DIR"
chown mansoni:mansoni "$LOG_DIR"

# ── 2. Node.js 20 LTS ────────────────────────────────────────────────────────
step "Checking Node.js"
if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
  log "Installing Node.js 20 via NodeSource..."
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates gnupg
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  log "Node.js $(node --version) already installed."
fi

# ── 3. Redis ─────────────────────────────────────────────────────────────────
step "Checking Redis"
if ! command -v redis-server &>/dev/null; then
  log "Installing Redis..."
  apt-get install -y redis-server
  systemctl enable redis-server
  systemctl start  redis-server
else
  log "Redis already installed ($(redis-server --version))."
  systemctl is-active --quiet redis-server || systemctl start redis-server
fi
# ── 3.1 Build tools (mediasoup native binaries) ──────────────────────────────────
step "Ensuring build tools for mediasoup native binaries"
if ! command -v python3 &>/dev/null || ! command -v make &>/dev/null || ! command -v g++ &>/dev/null; then
  log "Installing build-essential python3-minimal..."
  apt-get install -y --no-install-recommends build-essential python3-minimal
else
  log "Build tools already present."
fi

# ── 3.2 nginx (WSS reverse proxy for SFU) ──────────────────────────────────────
step "Ensuring nginx"
if ! command -v nginx &>/dev/null; then
  log "Installing nginx..."
  apt-get install -y --no-install-recommends nginx
  systemctl enable nginx
  systemctl start  nginx
else
  log "nginx $(nginx -v 2>&1 | head -1) already installed."
  systemctl is-active --quiet nginx || systemctl start nginx
fi
# ── 4. Clone / update repo ───────────────────────────────────────────────────
step "Ensuring repo at $APP_DIR"
if [[ ! -d "$APP_DIR/.git" ]]; then
  log "Cloning $REPO_URL → $APP_DIR"
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --depth=1 "$REPO_URL" "$APP_DIR"
  chown -R mansoni:mansoni "$APP_DIR"
else
  log "Repo exists — pulling latest"
  cd "$APP_DIR"
  # Allow git to operate even if directory is owned by different user
  git config --global --add safe.directory "$APP_DIR"
  # Remove stale lock files from previous interrupted operations
  rm -f .git/index.lock .git/MERGE_HEAD || true
  git fetch origin main
  git checkout main
  git reset --hard origin/main
  git clean -fd
  # Fix ownership in case previous install ran as root
  chown -R mansoni:mansoni "$APP_DIR"
fi

# ── 5. npm install ───────────────────────────────────────────────────────────
step "Installing npm dependencies (incl. optional mediasoup)"
cd "$APP_DIR"
# Ensure mansoni owns the directory before install
chown -R mansoni:mansoni "$APP_DIR"
# --ignore-scripts here, then rebuild mediasoup explicitly so root owns build env
if ! sudo -u mansoni npm ci --omit=dev --include=optional --ignore-scripts 2>&1; then
  log "npm ci as mansoni failed, retrying as root..."
  npm ci --omit=dev --include=optional --ignore-scripts
  chown -R mansoni:mansoni "$APP_DIR/node_modules" || true
fi
# Compile mediasoup native bindings (requires build-essential installed above)
if [[ -d "$APP_DIR/node_modules/mediasoup" ]]; then
  log "Rebuilding mediasoup native bindings..."
  cd "$APP_DIR"
  npm rebuild mediasoup || log "WARNING: mediasoup rebuild failed — SFU will run in fallback mode"
  chown -R mansoni:mansoni "$APP_DIR/node_modules/mediasoup" || true
else
  log "mediasoup not in node_modules — skipping rebuild"
fi

# ── 6. Systemd services ──────────────────────────────────────────────────────
step "Installing systemd unit for $SERVICE_WS"
if command -v systemctl &>/dev/null; then
  # calls-ws
  if [[ -f "$SYSTEMD_WS_SRC" ]]; then
    sed "s|/opt/mansoni/app|$APP_DIR|g" "$SYSTEMD_WS_SRC" > "$SYSTEMD_WS_DST"
    systemctl daemon-reload
    systemctl enable "$SERVICE_WS"
    systemctl restart "$SERVICE_WS"
    log "systemd service '$SERVICE_WS' enabled and started."
  else
    log "WARNING: $SYSTEMD_WS_SRC not found — skipping calls-ws systemd setup."
  fi

  # sfu — определяем публичный IP и пишем в .env.production если ещё не задан
  step "Configuring SFU announced IP"
  SFU_ENV="$APP_DIR/server/sfu/.env.production"
  if [[ ! -f "$SFU_ENV" ]] || ! grep -qE '^SFU_ANNOUNCED_IP=.+' "$SFU_ENV"; then
    PUBLIC_IP=$(curl -sf --max-time 5 ifconfig.me || curl -sf --max-time 5 api.ipify.org || echo "")
    if [[ -n "$PUBLIC_IP" ]]; then
      # Удаляем пустую строку SFU_ANNOUNCED_IP= если есть, добавляем с IP
      if [[ -f "$SFU_ENV" ]]; then
        sed -i '/^SFU_ANNOUNCED_IP=/d' "$SFU_ENV"
      fi
      echo "SFU_ANNOUNCED_IP=$PUBLIC_IP" >> "$SFU_ENV"
      log "SFU_ANNOUNCED_IP set to $PUBLIC_IP in $SFU_ENV"
    else
      log "WARNING: Could not detect public IP — set SFU_ANNOUNCED_IP manually in $SFU_ENV"
    fi
  else
    CURRENT_IP=$(grep -E '^SFU_ANNOUNCED_IP=' "$SFU_ENV" | cut -d= -f2)
    log "SFU_ANNOUNCED_IP already set to $CURRENT_IP — skipping."
  fi

  step "Installing systemd unit for $SERVICE_SFU"
  if [[ -f "$SYSTEMD_SFU_SRC" ]]; then
    sed "s|/opt/mansoni/app|$APP_DIR|g" "$SYSTEMD_SFU_SRC" > "$SYSTEMD_SFU_DST"
    systemctl daemon-reload
    systemctl enable "$SERVICE_SFU"
    systemctl restart "$SERVICE_SFU"
    log "systemd service '$SERVICE_SFU' enabled and started."
  else
    log "WARNING: $SYSTEMD_SFU_SRC not found — skipping sfu systemd setup."
  fi

  # ── 7. PM2 fallback ─────────────────────────────────────────────────────
else
  step "systemd not available — falling back to PM2"
  if ! command -v pm2 &>/dev/null; then
    log "Installing PM2 globally..."
    npm install -g pm2
  fi
  mkdir -p "$LOG_DIR"
  chown mansoni:mansoni "$LOG_DIR"

  # Patch APP_DIR path in PM2 config if needed
  if [[ "$APP_DIR" != "/opt/mansoni/app" ]]; then
    TMP_PM2=$(mktemp)
    sed "s|/opt/mansoni/app|$APP_DIR|g" "$PM2_CONFIG" > "$TMP_PM2"
    sudo -u mansoni pm2 start "$TMP_PM2" --env production || true
    rm -f "$TMP_PM2"
  else
    sudo -u mansoni pm2 start "$PM2_CONFIG" --env production || true
  fi

  sudo -u mansoni pm2 save
  # Enable pm2 startup on reboot
  pm2 startup | tail -1 | bash || true
  log "PM2 processes started."
fi

# ── Done ─────────────────────────────────────────────────────────────────────
step "Bootstrap complete for region=$REGION"
echo ""
echo "  Services: $SERVICE_WS, $SERVICE_SFU"
echo "  App dir : $APP_DIR"
echo "  Log dir : $LOG_DIR"
echo ""

for SVC in "$SERVICE_WS" "$SERVICE_SFU"; do
  if command -v systemctl &>/dev/null && systemctl is-active --quiet "$SVC" 2>/dev/null; then
    echo "  $SVC : RUNNING (systemd)"
  elif command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "$SVC"; then
    echo "  $SVC : RUNNING (pm2)"
  else
    echo "  $SVC : UNKNOWN — check manually"
  fi
done

echo ""
echo "Next steps:"
echo "  - Ensure /opt/mansoni/app/.env.production has:"
echo "      SUPABASE_URL=<your-url>"
echo "      SUPABASE_ANON_KEY=<anon-key>"
echo "      CALLS_WS_PORT=8787"
echo "  - Ensure /opt/mansoni/app/server/sfu/.env.production has:"
echo "      SFU_ANNOUNCED_IP=<public_ipv4>   ← автоматически задан выше"
echo "      SUPABASE_URL=<your-url>"
echo "      SUPABASE_ANON_KEY=<anon-key>"
echo "  - Открыть UDP порты 49160-49200 (mediasoup RTP relay) в firewall:"
echo "      ufw allow 49160:49200/udp"
echo "      ufw allow 4443/tcp"
echo "  - Добавить GitHub Secrets: SFU_RU_HOST, SFU_RU_USER, SFU_RU_SSH_KEY"  echo ""
  echo "nginx WSS setup:"
  NGINX_CONF="/etc/nginx/sites-available/sfu-${REGION}.mansoni.ru"
  NGINX_SRC="$APP_DIR/infra/calls/nginx-sfu-ru.conf"
  if [[ -f "$NGINX_SRC" ]] && [[ ! -f "$NGINX_CONF" ]]; then
    cp "$NGINX_SRC" "$NGINX_CONF"
    ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/sfu-${REGION}.mansoni.ru" 2>/dev/null || true
    nginx -t 2>/dev/null && systemctl reload nginx && log "nginx config installed: $NGINX_CONF"
  elif [[ -f "$NGINX_CONF" ]]; then
    log "nginx config already exists: $NGINX_CONF"
  fi
  echo "  - Obtain TLS cert (once DNS points to this server):"
  echo "      certbot --nginx -d sfu-${REGION}.mansoni.ru"
  echo "  - After cert: uncomment ssl_certificate lines in $NGINX_CONF"