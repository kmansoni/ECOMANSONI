#!/usr/bin/env pwsh
# Настройка SSL и Nginx после активации DNS

param(
    [string]$Domain = "mansoni.ru",
    [string]$Server = "5.42.99.76",
    [string]$Email = "admin@mansoni.ru"
)

Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║      Настройка SSL и Nginx для $Domain        ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Проверяем DNS
Write-Host "→ Проверяю DNS..." -ForegroundColor Yellow
try {
    $dnsResult = Resolve-DnsName -Name $Domain -ErrorAction SilentlyContinue
    if ($dnsResult -and $dnsResult.IPAddress -eq $Server) {
        Write-Host "✓ DNS активна и указывает на $Server" -ForegroundColor Green
    } else {
        Write-Host "✗ DNS не активна или указывает на неправильный IP" -ForegroundColor Red
        Write-Host "  Обнови DNS запись и попробуй снова через 15-30 минут" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "⚠ Не удалось проверить DNS, но продолжаем..." -ForegroundColor Yellow
}

# Создаем скрипт для выполнения на сервере
Write-Host "`n→ Подготавливаю скрипт для сервера..." -ForegroundColor Yellow

$serverScript = @'
#!/bin/bash
set -e

DOMAIN="__DOMAIN__"
EMAIL="__EMAIL__"

echo "╔════════════════════════════════════════════════════╗"
echo "║ Настройка SSL и Nginx для $DOMAIN               ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# ШАГ 1: Установка Certbot
echo "→ Установка Certbot..."
apt update
apt install -y certbot python3-certbot-nginx
echo "✓ Certbot установлен"

# ШАГ 2: Получение SSL сертификата
echo "→ Получение SSL сертификата от Let's Encrypt..."
certbot certonly --standalone -d $DOMAIN -d www.$DOMAIN \
  --email $EMAIL \
  --agree-tos \
  --non-interactive \
  --http-01-port 80
echo "✓ SSL сертификат получен"

# ШАГ 3: Обновление Nginx конфигурации
echo "→ Обновление Nginx конфигурации..."

tee /etc/nginx/sites-available/mansoni-api > /dev/null <<'EOFNGINX'
# HTTP на HTTPS редирект
server {
    listen 80;
    server_name __DOMAIN__ www.__DOMAIN__;
    return 301 https://$server_name$request_uri;
}

# HTTPS сервер
upstream postgrest {
    server 127.0.0.1:3000;
    keepalive 64;
}

upstream turn_api {
    server 127.0.0.1:3001;
    keepalive 8;
}

server {
    listen 443 ssl http2;
    server_name __DOMAIN__ www.__DOMAIN__;

    ssl_certificate /etc/letsencrypt/live/__DOMAIN__/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/__DOMAIN__/privkey.pem;

    # SSL конфигурация
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    access_log /var/log/nginx/mansoni-api-access.log;
    error_log /var/log/nginx/mansoni-api-error.log;

    client_max_body_size 10M;

    # CORS заголовки
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Accept, apikey, x-client-info' always;
    add_header 'Access-Control-Max-Age' '3600' always;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    # OPTIONS запросы
    if ($request_method = 'OPTIONS') {
        return 204;
    }

    # TURN credentials endpoint
    location /turn-credentials {
        proxy_pass http://turn_api/turn-credentials;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # PostgREST API
    location / {
        proxy_pass http://postgrest;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check
    location /health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }
}
EOFNGINX

nginx -t
systemctl restart nginx
echo "✓ Nginx обновлен и перезагружен"

# ШАГ 4: Настройка автоматического обновления сертификата
echo "→ Настройка автоматического обновления сертификата..."
(crontab -l 2>/dev/null || true; echo "0 3 * * * certbot renew --quiet") | crontab -
echo "✓ Cron задание создано"

echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║    SSL И NGINX УСПЕШНО НАСТРОЕНЫ! ✓               ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""
echo "API доступен по адресу:"
echo "  https://$DOMAIN"
echo ""
echo "TURN credentials:"
echo "  https://$DOMAIN/turn-credentials"
echo ""
echo "Health check:"
echo "  https://$DOMAIN/health"
echo ""
'@

$serverScript = $serverScript -replace '__DOMAIN__', $Domain -replace '__EMAIL__', $Email

# Сохраняем скрипт временно
$tempScript = [System.IO.Path]::GetTempFileName() + ".sh"
Set-Content -Path $tempScript -Value $serverScript -Encoding ASCII

Write-Host ("✓ Скрипт подготовлен ({0} KB)" -f [math]::Round((Get-Item $tempScript).Length / 1KB, 2)) -ForegroundColor Green

# Выводим инструкции
Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║    ВЫПОЛНИ НА СЕРВЕРЕ ЧЕРЕЗ SSH                          ║" -ForegroundColor Yellow
Write-Host "╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

Write-Host "ssh root@$Server" -ForegroundColor Cyan
Write-Host "bash /root/setup-ssl.sh" -ForegroundColor Cyan
Write-Host ""

Write-Host "📝 Полный скрипт:" -ForegroundColor Yellow
Write-Host "═" * 60 -ForegroundColor Gray
Write-Host $serverScript -ForegroundColor Gray
Write-Host "═" * 60 -ForegroundColor Gray

Write-Host "`n💡 Попроще - скопируй этот скрипт через веб-консоль Timeweb" -ForegroundColor Cyan

# Очищаем
Remove-Item $tempScript -ErrorAction SilentlyContinue
