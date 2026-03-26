# ARIA AI Server — Деплой на mansoni.ru

## Быстрый старт (локально)

```bash
# Установить зависимости
pip install -r ai_engine/server/requirements.txt

# Запустить сервер
ARIA_API_KEY=<SET_STRONG_RANDOM_KEY> python -m uvicorn ai_engine.server.main:app --host 0.0.0.0 --port 8000

# Проверить
curl http://localhost:8000/health
```

## Деплой на Timeweb (mansoni.ru)

### 1. Подключиться к серверу
```bash
ssh root@mansoni.ru
```

### 2. Установить Python и зависимости
```bash
apt update && apt install -y python3.11 python3-pip nginx certbot python3-certbot-nginx
pip3 install fastapi uvicorn[standard] pydantic numpy python-jose[cryptography]
```

### 3. Загрузить код
```bash
cd /opt
git clone https://github.com/kmansoni/ECOMANSONI.git mansoni
cd mansoni
```

### 4. Создать systemd сервис
```bash
cat > /etc/systemd/system/aria-ai.service << 'EOF'
[Unit]
Description=ARIA AI Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/mansoni
Environment=PYTHONPATH=/opt/mansoni
Environment=ARIA_API_KEY=<SET_STRONG_RANDOM_KEY>
Environment=PORT=8000
ExecStart=/usr/bin/python3 -m uvicorn ai_engine.server.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable aria-ai
systemctl start aria-ai
```

### 5. Настроить Nginx + SSL для api.mansoni.ru
```nginx
# /etc/nginx/sites-available/api.mansoni.ru
server {
    listen 80;
    server_name api.mansoni.ru;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name api.mansoni.ru;

    ssl_certificate /etc/letsencrypt/live/api.mansoni.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.mansoni.ru/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
        
        # SSE streaming support
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        chunked_transfer_encoding on;
    }
}
```

```bash
# Активировать конфиг
ln -s /etc/nginx/sites-available/api.mansoni.ru /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Получить SSL сертификат
certbot --nginx -d api.mansoni.ru
```

### 6. Проверить
```bash
curl https://api.mansoni.ru/health
# {"status":"ok","service":"aria-ai","version":"1.0.0"}

curl -X POST https://api.mansoni.ru/v1/chat/completions \
  -H "Authorization: Bearer <SET_STRONG_RANDOM_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Привет!"}],"stream":false}'
```

## Docker деплой (альтернатива)

```bash
# Собрать образ
docker build -f ai_engine/server/Dockerfile -t aria-ai .

# Запустить
docker run -d \
  --name aria-ai \
  -p 8000:8000 \
  -e ARIA_API_KEY=<SET_STRONG_RANDOM_KEY> \
  --restart unless-stopped \
  aria-ai
```

## Переменные окружения

| Переменная | Описание | По умолчанию |
|---|---|---|
| `ARIA_API_KEY` | API ключ для авторизации | `<REQUIRED_STRONG_RANDOM_KEY>` |
| `PORT` | Порт сервера | `8000` |
| `PYTHONPATH` | Путь к коду | `/app` |
