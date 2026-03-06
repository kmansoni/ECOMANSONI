#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# setup-mail.sh — First-time setup script for Mansoni Mail Server
#
# Usage:
#   chmod +x setup-mail.sh
#   ./setup-mail.sh
#
# What this script does:
#   1. Checks prerequisites (Docker, Docker Compose, ports, .env)
#   2. Creates required directories
#   3. Obtains TLS certificate via Let's Encrypt (certbot standalone)
#   4. Downloads docker-mailserver setup helper
#   5. Creates mail accounts (asset@, noreply@, admin@)
#   6. Configures aliases (postmaster, abuse, dmarc, tls-rpt)
#   7. Generates DKIM keys
#   8. Starts the stack
#   9. Prints DKIM DNS record to add to your DNS panel
#
# Prerequisites:
#   - AdminVPS with Ubuntu 22.04+
#   - Docker + Docker Compose installed
#   - Domain mansoni.ru pointing to this server's IP (A record: mail.mansoni.ru)
#   - Port 80 open (for Let's Encrypt HTTP challenge)
#   - .env file created from .env.example
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*"; }
log_section() { echo -e "\n${BLUE}══════════════════════════════════════════${NC}"; echo -e "${BLUE}  $*${NC}"; echo -e "${BLUE}══════════════════════════════════════════${NC}"; }

# ─── Configuration ───────────────────────────────────────────────────────────
DOMAIN="mansoni.ru"
MAIL_HOSTNAME="mail.${DOMAIN}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP_SH="${SCRIPT_DIR}/dms-setup.sh"

# ─── Load .env ───────────────────────────────────────────────────────────────
if [[ ! -f "${SCRIPT_DIR}/.env" ]]; then
  log_error ".env file not found. Copy .env.example and fill in values:"
  log_error "  cp .env.example .env && nano .env"
  exit 1
fi

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/.env"

# Validate required vars
: "${SMTP_ASSET_USER:?SMTP_ASSET_USER not set in .env}"
: "${SMTP_ASSET_PASSWORD:?SMTP_ASSET_PASSWORD not set in .env}"
: "${EMAIL_ROUTER_API_KEY:?EMAIL_ROUTER_API_KEY not set in .env}"

# ─── Step 1: Prerequisites ───────────────────────────────────────────────────
log_section "Step 1: Checking prerequisites"

# Docker
if ! command -v docker &>/dev/null; then
  log_error "Docker not found. Install: https://docs.docker.com/engine/install/ubuntu/"
  exit 1
fi
log_ok "Docker: $(docker --version)"

# Docker Compose
if ! docker compose version &>/dev/null; then
  log_error "Docker Compose v2 not found. Install: https://docs.docker.com/compose/install/"
  exit 1
fi
log_ok "Docker Compose: $(docker compose version --short)"

# Check if running as root or with sudo
if [[ $EUID -ne 0 ]]; then
  log_warn "Not running as root. Some operations may require sudo."
fi

# Check port 25 is not blocked
log_info "Checking if port 25 is accessible..."
if timeout 5 bash -c "echo > /dev/tcp/smtp.gmail.com/25" 2>/dev/null; then
  log_ok "Port 25 outbound: accessible"
else
  log_warn "Port 25 outbound may be blocked by your VPS provider."
  log_warn "Contact AdminVPS support to unblock port 25 for outbound SMTP."
  log_warn "Without port 25, you cannot send mail to external recipients."
  read -rp "Continue anyway? [y/N] " confirm
  [[ "${confirm}" =~ ^[Yy]$ ]] || exit 1
fi

# Check PTR record
log_info "Checking PTR record for this server..."
SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "unknown")
if [[ "${SERVER_IP}" != "unknown" ]]; then
  PTR=$(dig -x "${SERVER_IP}" +short 2>/dev/null | head -1 | sed 's/\.$//')
  if [[ "${PTR}" == "${MAIL_HOSTNAME}" ]]; then
    log_ok "PTR record: ${SERVER_IP} → ${PTR}"
  else
    log_warn "PTR record mismatch: ${SERVER_IP} → '${PTR}' (expected '${MAIL_HOSTNAME}')"
    log_warn "Set PTR record in AdminVPS control panel: ${SERVER_IP} → ${MAIL_HOSTNAME}"
    log_warn "Without correct PTR, mail may be rejected as spam."
  fi
fi

# ─── Step 2: Create directories ──────────────────────────────────────────────
log_section "Step 2: Creating directories"

mkdir -p \
  "${SCRIPT_DIR}/data/mail-data" \
  "${SCRIPT_DIR}/data/mail-state" \
  "${SCRIPT_DIR}/data/mail-logs" \
  "${SCRIPT_DIR}/config" \
  "${SCRIPT_DIR}/certs" \
  "${SCRIPT_DIR}/certbot-www"

log_ok "Directories created"

# ─── Step 3: TLS Certificate ─────────────────────────────────────────────────
log_section "Step 3: Obtaining TLS certificate"

if [[ -d "${SCRIPT_DIR}/certs/live/${MAIL_HOSTNAME}" ]]; then
  log_ok "Certificate already exists: ${SCRIPT_DIR}/certs/live/${MAIL_HOSTNAME}"
else
  log_info "Requesting Let's Encrypt certificate for ${MAIL_HOSTNAME}..."
  log_info "Port 80 must be open and ${MAIL_HOSTNAME} must point to this server."

  # Stop any service using port 80 temporarily
  if command -v certbot &>/dev/null; then
    certbot certonly \
      --standalone \
      --non-interactive \
      --agree-tos \
      --email "admin@${DOMAIN}" \
      -d "${MAIL_HOSTNAME}" \
      --cert-path "${SCRIPT_DIR}/certs"

    # Copy to our certs directory
    cp -rL /etc/letsencrypt/ "${SCRIPT_DIR}/certs/"
    log_ok "Certificate obtained and copied to ${SCRIPT_DIR}/certs/"
  else
    log_info "certbot not installed. Installing..."
    apt-get install -y certbot 2>/dev/null || true

    certbot certonly \
      --standalone \
      --non-interactive \
      --agree-tos \
      --email "admin@${DOMAIN}" \
      -d "${MAIL_HOSTNAME}"

    cp -rL /etc/letsencrypt/ "${SCRIPT_DIR}/certs/"
    log_ok "Certificate obtained"
  fi
fi

# ─── Step 4: Download docker-mailserver setup helper ─────────────────────────
log_section "Step 4: Downloading docker-mailserver setup helper"

if [[ ! -f "${SETUP_SH}" ]]; then
  log_info "Downloading setup.sh from docker-mailserver..."
  curl -fsSL \
    "https://raw.githubusercontent.com/docker-mailserver/docker-mailserver/master/setup.sh" \
    -o "${SETUP_SH}"
  chmod +x "${SETUP_SH}"
  log_ok "setup.sh downloaded"
else
  log_ok "setup.sh already present"
fi

# ─── Step 5: Create mail accounts ────────────────────────────────────────────
log_section "Step 5: Creating mail accounts"

# Helper: add account only if not exists
add_account() {
  local email="$1"
  local password="$2"
  if grep -q "^${email}|" "${SCRIPT_DIR}/config/postfix-accounts.cf" 2>/dev/null; then
    log_ok "Account already exists: ${email}"
  else
    "${SETUP_SH}" email add "${email}" "${password}"
    log_ok "Account created: ${email}"
  fi
}

# Service account — used by email-router for sending
add_account "${SMTP_ASSET_USER}" "${SMTP_ASSET_PASSWORD}"

# System accounts
log_info "Enter password for noreply@${DOMAIN} (or press Enter to skip):"
read -rs NOREPLY_PASS
if [[ -n "${NOREPLY_PASS}" ]]; then
  add_account "noreply@${DOMAIN}" "${NOREPLY_PASS}"
fi

log_info "Enter password for admin@${DOMAIN} (or press Enter to skip):"
read -rs ADMIN_PASS
if [[ -n "${ADMIN_PASS}" ]]; then
  add_account "admin@${DOMAIN}" "${ADMIN_PASS}"
fi

# ─── Step 6: Configure aliases ───────────────────────────────────────────────
log_section "Step 6: Configuring aliases"

add_alias() {
  local from="$1"
  local to="$2"
  if grep -q "^${from} " "${SCRIPT_DIR}/config/postfix-virtual.cf" 2>/dev/null; then
    log_ok "Alias already exists: ${from} → ${to}"
  else
    "${SETUP_SH}" alias add "${from}" "${to}"
    log_ok "Alias created: ${from} → ${to}"
  fi
}

ADMIN_EMAIL="admin@${DOMAIN}"
add_alias "postmaster@${DOMAIN}" "${ADMIN_EMAIL}"
add_alias "abuse@${DOMAIN}"      "${ADMIN_EMAIL}"
add_alias "dmarc@${DOMAIN}"      "${ADMIN_EMAIL}"
add_alias "dmarc-rua@${DOMAIN}"  "${ADMIN_EMAIL}"
add_alias "dmarc-ruf@${DOMAIN}"  "${ADMIN_EMAIL}"
add_alias "tls-rpt@${DOMAIN}"    "${ADMIN_EMAIL}"

# ─── Step 7: Generate DKIM keys ──────────────────────────────────────────────
log_section "Step 7: Generating DKIM keys"

DKIM_KEY_FILE="${SCRIPT_DIR}/config/opendkim/keys/${DOMAIN}/mail.txt"

if [[ -f "${DKIM_KEY_FILE}" ]]; then
  log_ok "DKIM keys already exist"
else
  log_info "Generating DKIM keys (2048-bit RSA)..."
  "${SETUP_SH}" config dkim keysize 2048 selector mail
  log_ok "DKIM keys generated"
fi

# ─── Step 8: Start the stack ─────────────────────────────────────────────────
log_section "Step 8: Starting Docker Compose stack"

cd "${SCRIPT_DIR}"
docker compose up -d

log_info "Waiting for mailserver to be healthy (up to 90 seconds)..."
for i in $(seq 1 18); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' mailserver 2>/dev/null || echo "starting")
  if [[ "${STATUS}" == "healthy" ]]; then
    log_ok "mailserver is healthy"
    break
  fi
  echo -n "."
  sleep 5
done
echo ""

# ─── Step 9: Print DKIM DNS record ───────────────────────────────────────────
log_section "Step 9: DNS records to add"

echo ""
echo -e "${YELLOW}══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  ADD THESE DNS RECORDS TO YOUR DOMAIN REGISTRAR (mansoni.ru)${NC}"
echo -e "${YELLOW}══════════════════════════════════════════════════════════════${NC}"
echo ""

SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "YOUR_VPS_IP")

echo -e "${GREEN}# A record${NC}"
echo "mail.mansoni.ru.    IN  A     ${SERVER_IP}"
echo ""

echo -e "${GREEN}# MX record${NC}"
echo "mansoni.ru.         IN  MX    10 mail.mansoni.ru."
echo ""

echo -e "${GREEN}# SPF record${NC}"
echo "mansoni.ru.         IN  TXT   \"v=spf1 mx a:mail.mansoni.ru ip4:${SERVER_IP} ~all\""
echo ""

echo -e "${GREEN}# DMARC record (start with p=none, tighten after 30 days)${NC}"
echo "_dmarc.mansoni.ru.  IN  TXT   \"v=DMARC1; p=none; rua=mailto:dmarc-rua@mansoni.ru; ruf=mailto:dmarc-ruf@mansoni.ru; sp=none; adkim=r; aspf=r; fo=1\""
echo ""

echo -e "${GREEN}# DKIM record (copy from file below):${NC}"
if [[ -f "${DKIM_KEY_FILE}" ]]; then
  echo "# File: ${DKIM_KEY_FILE}"
  echo ""
  cat "${DKIM_KEY_FILE}"
else
  echo "# DKIM key file not found yet. Run after mailserver starts:"
  echo "# cat ${DKIM_KEY_FILE}"
fi

echo ""
echo -e "${YELLOW}══════════════════════════════════════════════════════════════${NC}"
echo ""

# ─── Step 10: Verification commands ─────────────────────────────────────────
log_section "Step 10: Verification commands"

echo ""
echo "# Check mailserver health:"
echo "docker compose logs -f mailserver"
echo ""
echo "# Check email-router health:"
echo "curl http://localhost:8090/health"
echo ""
echo "# Send test email via email-router:"
cat <<EOF
curl -X POST http://localhost:8090/send \\
  -H "X-API-Key: ${EMAIL_ROUTER_API_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "mansoni@list.ru",
    "from": "${SMTP_ASSET_USER}",
    "template": "verification",
    "templateData": {
      "name": "Mansoni",
      "code": "123456",
      "link": "https://mansoni.ru/verify?code=123456"
    }
  }'
EOF
echo ""
echo "# Check spam score (send to this address, get report back):"
echo "# Send a test email to: check-auth@verifier.port25.com"
echo ""
echo "# Online spam score test:"
echo "# https://www.mail-tester.com/"
echo ""

log_ok "Setup complete!"
log_info "After adding DNS records, wait 15-60 minutes for propagation."
log_info "Then verify with: dig MX mansoni.ru +short"
