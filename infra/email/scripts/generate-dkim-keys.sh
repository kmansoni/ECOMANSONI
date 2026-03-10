#!/usr/bin/env bash
# Генерация DKIM ключей для mansoni.ru
set -euo pipefail

DOMAIN="${1:-mansoni.ru}"
SELECTOR="${2:-mail}"
KEY_DIR="./infra/email/opendkim/keys/${DOMAIN}"

echo "🔑 Generating DKIM keys for ${DOMAIN} (selector: ${SELECTOR})"

mkdir -p "${KEY_DIR}"

# Генерация RSA 2048-bit ключа
opendkim-genkey \
  --domain="${DOMAIN}" \
  --selector="${SELECTOR}" \
  --directory="${KEY_DIR}" \
  --bits=2048 \
  --restrict

# Переименование
mv "${KEY_DIR}/${SELECTOR}.private" "${KEY_DIR}/${SELECTOR}.private"
mv "${KEY_DIR}/${SELECTOR}.txt" "${KEY_DIR}/${SELECTOR}.txt"

# Права
chmod 600 "${KEY_DIR}/${SELECTOR}.private"
chmod 644 "${KEY_DIR}/${SELECTOR}.txt"

echo "✅ Keys generated:"
echo "   Private: ${KEY_DIR}/${SELECTOR}.private"
echo "   DNS TXT: ${KEY_DIR}/${SELECTOR}.txt"
echo ""
echo "📋 Add this DNS TXT record:"
cat "${KEY_DIR}/${SELECTOR}.txt"
echo ""
echo "⚠️  Verify with: dig +short TXT ${SELECTOR}._domainkey.${DOMAIN}"
