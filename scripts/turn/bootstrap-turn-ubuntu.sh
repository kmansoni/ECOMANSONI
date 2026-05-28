#!/usr/bin/env bash
set -euo pipefail

# Bootstraps a self-hosted coturn TURN server with TLS (turns) on Ubuntu.
#
# Requirements:
# - Run as root (or with sudo)
# - DNS A record already set: TURN_DOMAIN -> VPS public IP
# - Port 80 reachable for Let's Encrypt HTTP-01 (standalone)
# - Firewall open: 3478/udp, 3478/tcp, 5349/tcp+udp, 49152-65535/udp (full range)
#
# Usage:
#   sudo bash bootstrap-turn-ubuntu.sh \
#     --domain turn.example.com \
#     --email admin@example.com \
#     --public-ip 1.2.3.4

TURN_DOMAIN=""
LE_EMAIL=""
PUBLIC_IP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) TURN_DOMAIN="$2"; shift 2;;
    --email) LE_EMAIL="$2"; shift 2;;
    --public-ip) PUBLIC_IP="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 2;;
  esac
done

if [[ -z "$TURN_DOMAIN" || -z "$LE_EMAIL" || -z "$PUBLIC_IP" ]]; then
  echo "Missing required args. Example:" >&2
  echo "  sudo bash $0 --domain turn.example.com --email admin@example.com --public-ip 1.2.3.4" >&2
  exit 2
fi

echo "[TURN] Domain:     $TURN_DOMAIN"
echo "[TURN] Public IP:  $PUBLIC_IP"
echo "[TURN] LE email:   $LE_EMAIL"

apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release ufw certbot openssl

# Docker
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Firewall (UFW)
  ufw --force enable
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 3478/udp
  ufw allow 3478/tcp
  ufw allow 5349/udp
  ufw allow 5349/tcp
  ufw allow 49152:65535/udp comment "TURN relay range (full port range)"

mkdir -p /opt/turn

# Generate long random shared secret (REST auth)
TURN_SHARED_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
echo "[TURN] Generated TURN_SHARED_SECRET (save this for Supabase secrets):"
echo "$TURN_SHARED_SECRET"

# TLS cert (standalone)
echo "[TURN] Requesting Let's Encrypt certificate..."
certbot certonly --standalone \
   --non-interactive --agree-tos \
   -m "$LE_EMAIL" \
   -d "$TURN_DOMAIN"

cat > /opt/turn/turnserver.conf <<EOF
# coturn production config (self-hosted TURN, shared-secret REST auth, TLS)
listening-ip=0.0.0.0
listening-port=3478
tls-listening-port=5349

# Relay port range (keep narrow in dev)
# For better scalability, use: min-port=49152, max-port=65535
min-port=49152
max-port=65535

external-ip=${PUBLIC_IP}

realm=${TURN_DOMAIN}
server-name=${TURN_DOMAIN}

use-auth-secret
static-auth-secret=${TURN_SHARED_SECRET}

cert=/etc/letsencrypt/live/${TURN_DOMAIN}/fullchain.pem
pkey=/etc/letsencrypt/live/${TURN_DOMAIN}/privkey.pem

fingerprint
no-loopback-peers
no-multicast-peers
verbose
EOF

cat > /opt/turn/docker-compose.yml <<EOF
services:
  coturn:
    image: coturn/coturn:4.6.3
    restart: unless-stopped
    ports:
      - "3478:3478/udp"
      - "3478:3478/tcp"
      - "5349:5349/tcp"
      - "5349:5349/udp"
      - "49152-65535:49152-65535/udp"
    volumes:
      - ./turnserver.conf:/etc/coturn/turnserver.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    command: ["-c", "/etc/coturn/turnserver.conf", "-n", "--log-file=stdout"]
EOF

echo "[TURN] Starting coturn..."
docker compose -f /opt/turn/docker-compose.yml up -d

# Auto-renewal for Let's Encrypt certificates (cron job)
cat > /etc/cron.d/turn-certbot <<'CRON'
0 3 * * * root certbot renew --quiet --post-hook "docker compose -f /opt/turn/docker-compose.yml restart"
CRON
chmod 644 /etc/cron.d/turn-certbot

echo "[TURN] Done. Next steps on your local machine:" 
echo "  - Set Supabase secrets: TURN_URLS + TURN_SHARED_SECRET + TURN_TTL_SECONDS"
echo "  - Re-test turn-credentials should return turn:/turns:"
