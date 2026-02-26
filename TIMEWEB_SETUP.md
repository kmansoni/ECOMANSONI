# Автоматическая установка на Timeweb Cloud

## Быстрый старт (3 команды)

### 1. Загрузи файлы на сервер

Из корня проекта выполни в PowerShell:

```powershell
# Загрузить скрипт установки
scp scripts/timeweb-full-setup.sh root@5.42.99.76:/root/

# Загрузить миграции БД
scp supabase/.temp/all-migrations.sql root@5.42.99.76:/root/
```

### 2. Запусти установку

```powershell
ssh root@5.42.99.76 "chmod +x /root/timeweb-full-setup.sh && /root/timeweb-full-setup.sh"
```

Скрипт спросит пароль для БД - придумай надежный пароль.

### 3. Обнови .env.local

После успешной установки скрипт выведет секреты. Скопируй их в `.env.local`:

```env
# Timeweb PostgreSQL API
VITE_TIMEWEB_API_URL="http://5.42.99.76"
VITE_TIMEWEB_API_KEY="<JWT_SECRET из вывода скрипта>"

# TURN credentials
VITE_TURN_CREDENTIALS_URL="http://5.42.99.76/turn-credentials"

# Supabase (остаются для Auth + Storage)
VITE_SUPABASE_URL="https://lfkbgnbjxskspsownvjm.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<твой anon key>"
```

## Что устанавливает скрипт

1. ✅ **PostgreSQL 15** - база данных
2. ✅ **PostgREST** - REST API для PostgreSQL
3. ✅ **Nginx** - reverse proxy
4. ✅ **coturn** - TURN сервер для WebRTC
5. ✅ **Node.js API** - endpoint для TURN credentials
6. ✅ **Миграции** - все 229 миграций из Supabase
7. ✅ **Firewall** - UFW с правильными портами
8. ✅ **Бэкапы** - ежедневные автоматические бэкапы БД

## Проверка работы

После установки проверь:

```bash
# 1. API работает
curl http://5.42.99.76/

# 2. TURN credentials работает
curl -X POST http://5.42.99.76/turn-credentials

# 3. Все сервисы запущены
ssh root@5.42.99.76 "systemctl status postgresql postgrest-mansoni coturn mansoni-turn-api nginx"
```

## Логи на сервере

```bash
# PostgREST
journalctl -u postgrest-mansoni -f

# TURN credentials API
journalctl -u mansoni-turn-api -f

# coturn
journalctl -u coturn -f

# PostgreSQL
tail -f /var/log/postgresql/postgresql-15-main.log

# Nginx
tail -f /var/log/nginx/mansoni-api-access.log
```

## Проблемы?

### SSH не подключается

Попробуй сбросить пароль в панели Timeweb:
1. Зайди в https://timeweb.cloud
2. Найди свой сервер (5.42.99.76)
3. Сбрось пароль root

### Миграции не применились

Если файл `all-migrations.sql` не был загружен, примени вручную:

```bash
# На локальной машине
scp supabase/.temp/all-migrations.sql root@5.42.99.76:/root/

# Подключись к серверу
ssh root@5.42.99.76

# Примени миграции (замени PASSWORD на пароль БД)
PGPASSWORD='PASSWORD' psql -U mansoni_app -d mansoni -f /root/all-migrations.sql
```

### Нужно переустановить

Удали БД и запусти скрипт заново:

```bash
ssh root@5.42.99.76

# Удалить старую БД
sudo -u postgres psql -c "DROP DATABASE IF EXISTS mansoni;"
sudo -u postgres psql -c "DROP USER IF EXISTS mansoni_app;"

# Запустить скрипт снова
/root/timeweb-full-setup.sh
```

## Дальнейшие шаги

### Настрой домен (опционально)

```bash
# Установи SSL сертификат
ssh root@5.42.99.76
apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.mansoni.ru

# Обнови .env.local
VITE_TIMEWEB_API_URL="https://api.mansoni.ru"
VITE_TURN_CREDENTIALS_URL="https://api.mansoni.ru/turn-credentials"
```

### Настрой CORS для production

По умолчанию CORS разрешен для всех (`*`). Для production ограничь:

```bash
ssh root@5.42.99.76
nano /etc/nginx/sites-available/mansoni-api

# Замени * на свой домен
add_header 'Access-Control-Allow-Origin' 'https://yourdomain.com' always;

# Перезапусти Nginx
systemctl restart nginx
```

## Архитектура

```
┌─────────────────┐
│  Твой Frontend  │
│  (React + Vite) │
└────────┬────────┘
         │
         ├──Auth/Storage──────────────► Supabase (supabase.co)
         │
         ├──Data (profiles, chats...)─┐
         │                            │
         └──TURN credentials──────────┤
                                      │
                                      ▼
                            ┌──────────────────┐
                            │  Timeweb Cloud   │
                            │  5.42.99.76      │
                            ├──────────────────┤
                            │ Nginx :80        │  ◄── HTTP запросы
                            │   ├─/turn-credentials → Node.js :3001
                            │   └─/* → PostgREST :3000
                            │                  │
                            │ PostgreSQL :5432 │  ◄── Данные
                            │ coturn :3478     │  ◄── WebRTC
                            └──────────────────┘
```

## Что дальше?

1. ✅ Запусти фронтенд: `npm run dev`
2. ✅ Проверь что данные идут через Timeweb (открой DevTools → Network)
3. ✅ Проверь что звонки работают (TURN credentials должны приходить с твоего сервера)
4. ✅ Если все ОК - задеплой на production
