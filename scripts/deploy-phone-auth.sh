#!/bin/bash
set -euo pipefail

umask 077

APP_DIR="/var/app/server/phone-auth"
ENV_FILE="/etc/phone-auth.env"
NGINX_SNIPPET="/etc/nginx/snippets/phone-auth.conf"
NGINX_SITE="/etc/nginx/sites-available/mansoni-api" # существующий сайт
PORT="3001"

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1"; exit 1; }; }

need_cmd node
need_cmd npm
need_cmd nginx
need_cmd curl
need_cmd pm2

# --- Secrets: allow non-interactive via env, otherwise prompt if TTY ---
if [[ -z "${DB_PASS:-}" ]]; then
  if [[ -t 0 ]]; then
    read -s -p "DB Password: " DB_PASS; echo
  else
    echo "DB_PASS is not set and no TTY available."
    exit 1
  fi
fi

if [[ -z "${SMS_KEY:-}" ]]; then
  if [[ -t 0 ]]; then
    read -s -p "Timeweb SMS API Key: " SMS_KEY; echo
  else
    echo "SMS_KEY is not set and no TTY available."
    exit 1
  fi
fi

# --- Stable JWT secret: create once, never rotate silently ---
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Creating $ENV_FILE (one-time secrets)..."
  JWT_SECRET="$(openssl rand -base64 48)"
  cat > "$ENV_FILE" <<EOF
JWT_SECRET=${JWT_SECRET}
TIMEWEB_SMS_API_KEY=${SMS_KEY}
EOF
  chmod 600 "$ENV_FILE"
else
  echo "$ENV_FILE exists: keeping existing JWT_SECRET (no silent rotation)."
  # update sms key only if provided (optional)
  if grep -q '^TIMEWEB_SMS_API_KEY=' "$ENV_FILE"; then
    sed -i "s|^TIMEWEB_SMS_API_KEY=.*|TIMEWEB_SMS_API_KEY=${SMS_KEY}|" "$ENV_FILE"
  else
    echo "TIMEWEB_SMS_API_KEY=${SMS_KEY}" >> "$ENV_FILE"
  fi
fi

# --- App env file (non-secret values) ---
cat > "${APP_DIR}/.env.local" <<EOF
DATABASE_URL=postgresql://mansoni_user:${DB_PASS}@localhost:5432/mansoni
SMS_PROVIDER=timeweb
CORS_ALLOWED_ORIGINS=["https://mansoni.ru","https://www.mansoni.ru","https://api.mansoni.ru"]
NODE_ENV=production
PHONE_AUTH_PORT=${PORT}
EOF
chmod 600 "${APP_DIR}/.env.local"

# --- Deterministic deps ---
cd "$APP_DIR"
npm ci --omit=dev

# --- Migration ---
bash migration.sh

# Optional: validate tables exist (adjust DB name/schema as needed)
# psql "postgresql://mansoni_user:${DB_PASS}@localhost:5432/mansoni" -c "\dt" | grep -E "users|otp_audit_log|revoked_tokens"

# --- PM2 (no brittle fallbacks) ---
# Prefer ecosystem file in prod, but minimal safe approach here:
pm2 describe phone-auth >/dev/null 2>&1 && pm2 restart phone-auth || pm2 start index.mjs --name phone-auth
pm2 save

# Ensure PM2 autostart is configured (do not eval stdout)
# Recommended: run once manually:
#   pm2 startup systemd -u root --hp /root
# Here: attempt idempotent setup:
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
systemctl enable pm2-root >/dev/null 2>&1 || true
systemctl start pm2-root >/dev/null 2>&1 || true

# --- Nginx snippet (do not overwrite existing site) ---
cat > "$NGINX_SNIPPET" <<'NGINXCONF'
# Phone Auth reverse proxy
upstream phone_auth_backend {
  server 127.0.0.1:3001;
  keepalive 32;
}

location /auth/phone/ {
  proxy_pass http://phone_auth_backend/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 30s;
  proxy_connect_timeout 30s;
}

location /health {
  proxy_pass http://phone_auth_backend/health;
}
NGINXCONF

# Ensure site includes snippet (idempotent)
if ! grep -q "snippets/phone-auth.conf" "$NGINX_SITE"; then
  echo "Injecting nginx include into $NGINX_SITE"
  # naive but safe-ish injection after 'server {' first occurrence
  sed -i '0,/server\s*{/s//server {\n  include \/etc\/nginx\/snippets\/phone-auth.conf;/' "$NGINX_SITE"
fi

nginx -t
systemctl reload nginx

# --- Post-deploy checks: local first, then public ---
echo "Local health:"
curl -fsS "http://127.0.0.1:${PORT}/health" | head -c 200 || true
echo

echo "Public health:"
curl -fsS "https://api.mansoni.ru/health" | head -c 200 || true
echo

echo "OTP request (public):"
curl -fsS -X POST "https://api.mansoni.ru/auth/phone/request-otp" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79991234567"}' | head -c 400 || true
echo

pm2 status
tail -n 200 /var/log/nginx/error.log || true
pm2 logs phone-auth --lines 200 || true

echo "✅ Phone Auth deploy completed."
