#!/bin/bash
# Generate secrets for coturn server
# Usage: ./generate-secrets.sh

set -e

echo "=== Coturn Secrets Generator ==="
echo ""

# Generate static auth secret (for TURN REST API)
STATIC_AUTH_SECRET=$(openssl rand -base64 32)
echo "Static auth secret (TURN REST API):"
echo "$STATIC_AUTH_SECRET"
echo ""
echo "Add this to your environment:"
echo "export COTURN_STATIC_AUTH_SECRET='$STATIC_AUTH_SECRET'"
echo ""

# Generate database password
DB_PASSWORD=$(openssl rand -base64 24)
echo "Database password:"
echo "$DB_PASSWORD"
echo ""
echo "Add this to your environment:"
echo "export COTURN_DB_PASSWORD='$DB_PASSWORD'"
echo ""

# Generate user credentials (example)
echo "Example user credentials (add to coturn config or database):"
echo "Username: turnuser"
TURN_PASSWORD=$(openssl rand -base64 16)
echo "Password: $TURN_PASSWORD"
echo ""

# Save to .env file
cat > .env.coturn << EOF
# Coturn Configuration
COTURN_STATIC_AUTH_SECRET=$STATIC_AUTH_SECRET
COTURN_DB_PASSWORD=$DB_PASSWORD
COTURN_EXTERNAL_IP=YOUR_PUBLIC_IP_HERE
EOF

echo "Secrets saved to .env.coturn"
echo "IMPORTANT: Add this file to .gitignore and never commit it!"
