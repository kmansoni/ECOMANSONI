# Supabase Proxy — обход блокировки в РФ

## Проблема
Supabase (supabase.co) заблокирован в России. Пользователи не могут подключиться к сервису без VPN.

## Решение
Reverse proxy на вашем VPS (mansoni.ru) маршрутизирует запросы к Supabase через ваш сервер.

## Быстрая настройка

### 1. Скопировать файлы на VPS
```bash
scp infra/supabase-proxy/* root@your-vps:/opt/mansoni/supabase-proxy/
```

### 2. Получить SSL-сертификат
```bash
# На VPS
certbot certonly --standalone -d supabase-proxy.mansoni.ru
# Или через Docker
docker run -it --rm --name certbot \
  -v "./certs:/etc/letsencrypt" \
  -v "/var/www/certbot:/var/www/certbot" \
  certbot/certbot certonly --webroot -w /var/www/certbot -d supabase-proxy.mansoni.ru
```

### 3. Запустить proxy
```bash
cd /opt/mansoni/supabase-proxy/
docker-compose up -d
```

### 4. Обновить переменные окружения
В `.env.production` заменить:
```diff
- VITE_SUPABASE_URL="https://lfkbgnbjxskspsownvjm.supabase.co"
+ VITE_SUPABASE_URL="https://supabase-proxy.mansoni.ru"
```

### 5. Пересобрать и задеплоить фронтенд
```bash
npm run build
# Залить на VPS
```

## Архитектура

```
Пользователь (РФ) → supabase-proxy.mansoni.ru → lfkbgnbjxskspsownvjm.supabase.co
```

## Маршруты

| Путь | Описание |
|------|----------|
| `/` | REST API (PostgREST) |
| `/rest/` | REST запросы |
| `/auth/v1/` | Auth endpoints |
| `/realtime/` | WebSocket Realtime |
| `/storage/v1/` | Supabase Storage |
| `/functions/v1/` | Edge Functions |

## Security

- CORS ограничен доменом mansoni.ru
- Поддержка WebSocket для Realtime
- SSL/TLS с A+ рейтингом

## Альтернативные варианты

### DEMO_MODE (офлайн, без backend)
```
VITE_DEMO_MODE=true
```
Работает без Supabase, но без реальных данных и авторизации.