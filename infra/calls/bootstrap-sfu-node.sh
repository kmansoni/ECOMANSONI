#!/usr/bin/env bash
# bootstrap-sfu-node.sh — provision a fresh SFU node with calls-ws service
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
#   6. Installs & starts the calls-ws systemd service
#   7. Sets up PM2 as a fallback if systemd is unavailable
#
# Requirements: Debian/Ubuntu. Run as root or with NOPASSWD sudo.
set -euo pipefail

APP_DIR="${1:-/opt/mansoni/app}"
REGION="${2:-unknown}"
SERVICE="calls-ws"
REPO_URL="https://github.com/kmansoni/ECOMANSONI.git"
LOG_DIR="/var/log/mansoni"
SYSTEMD_UNIT_SRC="$APP_DIR/infra/calls/calls-ws.service"
SYSTEMD_UNIT_DST="/etc/systemd/system/calls-ws.service"
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
  git fetch origin main
  git checkout main
  git reset --hard origin/main
  git clean -fd
  # Fix ownership in case previous install ran as root
  chown -R mansoni:mansoni "$APP_DIR"
fi

# ── 5. npm install ───────────────────────────────────────────────────────────
step "Installing npm dependencies"
cd "$APP_DIR"
# Ensure mansoni owns the directory before install
chown -R mansoni:mansoni "$APP_DIR"
# Try as mansoni first; fall back to root if permissions still fail
if ! sudo -u mansoni npm ci --omit=dev --ignore-scripts 2>&1; then
  log "npm ci as mansoni failed, retrying as root..."
  npm ci --omit=dev --ignore-scripts
  chown -R mansoni:mansoni "$APP_DIR/node_modules" || true
fi

# ── 6. Systemd service ───────────────────────────────────────────────────────
step "Installing systemd unit for $SERVICE"
if command -v systemctl &>/dev/null; then
  if [[ -f "$SYSTEMD_UNIT_SRC" ]]; then
    # Patch WorkingDirectory and user paths to match APP_DIR
    sed "s|/opt/mansoni/app|$APP_DIR|g" "$SYSTEMD_UNIT_SRC" > "$SYSTEMD_UNIT_DST"
    systemctl daemon-reload
    systemctl enable "$SERVICE"
    systemctl restart "$SERVICE"
    log "systemd service '$SERVICE' enabled and started."
  else
    log "WARNING: $SYSTEMD_UNIT_SRC not found — skipping systemd setup."
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
  log "PM2 process '$SERVICE' started."
fi

# ── Done ─────────────────────────────────────────────────────────────────────
step "Bootstrap complete for region=$REGION"
echo ""
echo "  Service : $SERVICE"
echo "  App dir : $APP_DIR"
echo "  Log dir : $LOG_DIR"
echo ""

if command -v systemctl &>/dev/null && systemctl is-active --quiet "$SERVICE" 2>/dev/null; then
  echo "  Status  : RUNNING (systemd)"
elif command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "$SERVICE"; then
  echo "  Status  : RUNNING (pm2)"
else
  echo "  Status  : UNKNOWN — check manually"
fi

echo ""
echo "Next steps:"
echo "  - Ensure .env.production exists at $APP_DIR with:"
echo "      SUPABASE_URL=<your-url>"
echo "      SUPABASE_ANON_KEY=<anon-key>"
echo "      CALLS_WS_PORT=8787"
echo "  - Add SFU_RU/TR/AE_HOST, SFU_RU/TR/AE_USER, SFU_RU/TR/AE_SSH_KEY"
echo "    GitHub Secrets for automated deploys."
