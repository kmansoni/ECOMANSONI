#!/bin/bash
# Запускать ОДИН РАЗ на сервере перед первым docker compose up
# Требования: DNS mansoni.ru → IP сервера, порты 80/443 открыты

DOMAIN="mansoni.ru"
EMAIL="admin@mansoni.ru"  # замени на свой email
STAGING=0  # 1 = тест без лимитов Let's Encrypt, 0 = боевой сертификат

if [ ! -x "$(command -v docker)" ]; then
  echo "Docker не установлен" && exit 1
fi

# Создаём временные self-signed сертификаты чтобы nginx стартовал
mkdir -p ./data/certbot/conf/live/$DOMAIN
docker run --rm \
  -v "$(pwd)/data/certbot/conf:/etc/letsencrypt" \
  --entrypoint openssl \
  certbot/certbot \
  req -x509 -nodes -newkey rsa:4096 -days 1 \
  -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
  -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
  -subj "/CN=localhost" 2>/dev/null

# Стартуем nginx с временным сертификатом
docker compose up -d nginx

# Удаляем временные сертификаты
docker run --rm \
  -v "$(pwd)/data/certbot/conf:/etc/letsencrypt" \
  --entrypoint rm \
  certbot/certbot \
  -rf /etc/letsencrypt/live/$DOMAIN

# Получаем настоящий сертификат
STAGING_FLAG=""
[ $STAGING -eq 1 ] && STAGING_FLAG="--staging"

docker run --rm \
  -v "$(pwd)/data/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/data/certbot/www:/var/www/certbot" \
  certbot/certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  $STAGING_FLAG \
  --email $EMAIL \
  --agree-tos \
  --no-eff-email \
  -d $DOMAIN \
  -d www.$DOMAIN

# Перезагружаем nginx с реальным сертификатом
docker compose exec nginx nginx -s reload

echo ""
echo "Готово! Сертификат получен для $DOMAIN"
echo "Автообновление работает через контейнер certbot (каждые 12 часов)"
