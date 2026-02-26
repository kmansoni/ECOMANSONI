# Подробная инструкция по миграции БД в Timeweb Cloud

## 📋 Общая информация

**Сервер VPS:**
- IP: `5.42.99.76`
- Пользователь: `ubuntu`
- ОС: Ubuntu 24.04
- Регион: Москва

**База данных:**
- СУБД: PostgreSQL 15
- Название БД: `mansoni`
- Пользователь БД: `mansoni_app`
- Количество миграций: 198 файлов

---

## 🚀 Шаг 1: Экспорт миграций (ЛОКАЛЬНО)

Выполни на своем компьютере:

```powershell
# Перейди в папку проекта
cd "C:\Users\manso\Desktop\разработка\your-ai-companion-main"

# Экспортируй все миграции в один файл
pwsh .\scripts\export-migrations.ps1

# Результат будет в файле: supabase\.temp\all-migrations.sql
```

---

## 🔧 Шаг 2: Подключение к серверу и установка PostgreSQL

### 2.1 Подключись к серверу

```bash
ssh ubuntu@5.42.99.76
```

Введи пароль: `jWYTEVVE@b1c-_`

### 2.2 Обновление системы

```bash
sudo apt update
sudo apt upgrade -y
```

### 2.3 Установка PostgreSQL 15

```bash
# Установка PostgreSQL
sudo apt install -y postgresql-15 postgresql-contrib-15

# Проверка статуса
sudo systemctl status postgresql

# Если не запущен, запусти:
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2.4 Установка дополнительных расширений

```bash
# Для работы с UUID, JSON, полнотекстовым поиском и другими функциями Supabase
sudo apt install -y postgresql-15-pgvector postgresql-15-pg-stat-monitor
```

---

## 🗄️ Шаг 3: Создание базы данных и пользователя

### 3.1 Подключение к PostgreSQL как суперпользователь

```bash
sudo -u postgres psql
```

### 3.2 Создание пользователя и базы данных

Выполни в psql консоли (появится приглашение `postgres=#`):

```sql
-- Создай пользователя с паролем
CREATE USER mansoni_app WITH PASSWORD 'ваш_надежный_пароль_здесь';

-- Создай базу данных
CREATE DATABASE mansoni OWNER mansoni_app;

-- Подключись к созданной БД
\c mansoni

-- Установи необходимые расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Дай права пользователю
GRANT ALL PRIVILEGES ON DATABASE mansoni TO mansoni_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mansoni_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mansoni_app;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO mansoni_app;

-- Установи права по умолчанию для новых объектов
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mansoni_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO mansoni_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO mansoni_app;

-- Выход из psql
\q
```

---

## 📤 Шаг 4: Загрузка SQL файла на сервер

### Вариант 1: Через SCP (ЛОКАЛЬНО)

```powershell
# На твоем компьютере в PowerShell
scp "C:\Users\manso\Desktop\разработка\your-ai-companion-main\supabase\.temp\all-migrations.sql" ubuntu@5.42.99.76:/tmp/
```

### Вариант 2: Через nano на сервере (если файл небольшой)

```bash
# На сервере
nano /tmp/all-migrations.sql
# Скопируй содержимое файла и вставь сюда
# Сохрани: Ctrl+O, Enter, Ctrl+X
```

### Вариант 3: Через буфер обмена (рекомендуется для больших файлов)

```powershell
# ЛОКАЛЬНО: раздели файл на части по 100KB
$content = Get-Content "supabase\.temp\all-migrations.sql" -Raw
$chunkSize = 100000
$chunks = [Math]::Ceiling($content.Length / $chunkSize)

for ($i = 0; $i -lt $chunks; $i++) {
    $start = $i * $chunkSize
    $end = [Math]::Min($start + $chunkSize, $content.Length)
    $chunk = $content.Substring($start, $end - $start)
    $chunk | Out-File "supabase\.temp\migration-part-$i.sql" -NoNewline
}

Write-Host "Создано $chunks частей"
```

Затем копируй каждую часть отдельно через SCP.

---

## 🔄 Шаг 5: Применение миграций

### 5.1 Проверка файла на сервере

```bash
# Проверь размер файла
ls -lh /tmp/all-migrations.sql

# Посмотри первые строки
head -n 20 /tmp/all-migrations.sql

# Посмотри последние строки
tail -n 20 /tmp/all-migrations.sql
```

### 5.2 Применение миграций

```bash
# Применяй миграции от имени пользователя mansoni_app
psql -U mansoni_app -d mansoni -f /tmp/all-migrations.sql

# Если появятся ошибки, можно логировать:
psql -U mansoni_app -d mansoni -f /tmp/all-migrations.sql 2>&1 | tee /tmp/migration.log
```

### 5.3 Проверка результата

```bash
# Подключись к БД
psql -U mansoni_app -d mansoni

# В psql выполни:
```

```sql
-- Посмотри список таблиц
\dt

-- Посмотри список расширений
\dx

-- Посмотри количество таблиц
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';

-- Посмотри структуру ключевых таблиц
\d profiles
\d reels
\d posts
\d messages

-- Выход
\q
```

---

## 🔐 Шаг 6: Настройка безопасности PostgreSQL

### 6.1 Редактирование postgresql.conf

```bash
sudo nano /etc/postgresql/15/main/postgresql.conf
```

Найди и измени:

```conf
# Слушай только на локальном интерфейсе (для безопасности)
listen_addresses = 'localhost,10.0.0.0/8'  # Внутренняя сеть Timeweb

# Установи лимиты подключений
max_connections = 200

# Настройка памяти (для 8GB RAM)
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
work_mem = 10MB
```

### 6.2 Редактирование pg_hba.conf

```bash
sudo nano /etc/postgresql/15/main/pg_hba.conf
```

Добавь в конец:

```conf
# Local connections
local   all             mansoni_app                             scram-sha-256
host    mansoni         mansoni_app     127.0.0.1/32            scram-sha-256
host    mansoni         mansoni_app     ::1/128                 scram-sha-256

# Внутренняя сеть Timeweb (если нужен доступ с других серверов)
host    mansoni         mansoni_app     10.0.0.0/8              scram-sha-256
```

### 6.3 Перезапуск PostgreSQL

```bash
sudo systemctl restart postgresql
sudo systemctl status postgresql
```

---

## 🌐 Шаг 7: Установка PostgREST (API для frontend)

### 7.1 Установка PostgREST

```bash
# Скачай последнюю версию
cd /tmp
wget https://github.com/PostgREST/postgrest/releases/download/v12.0.2/postgrest-v12.0.2-linux-static-x64.tar.xz

# Распакуй
tar xJf postgrest-v12.0.2-linux-static-x64.tar.xz

# Перемести в системную папку
sudo mv postgrest /usr/local/bin/
sudo chmod +x /usr/local/bin/postgrest

# Проверь версию
postgrest --version
```

### 7.2 Создание конфигурации PostgREST

```bash
sudo mkdir -p /etc/postgrest
sudo nano /etc/postgrest/mansoni.conf
```

Содержимое файла:

```conf
db-uri = "postgres://mansoni_app:ваш_пароль_здесь@localhost:5432/mansoni"
db-schemas = "public"
db-anon-role = "mansoni_app"
db-pool = 10
db-pool-timeout = 10

server-host = "127.0.0.1"
server-port = 3000

jwt-secret = "ваш_JWT_секрет_32_символа_минимум"
jwt-secret-is-base64 = false

max-rows = 1000
pre-request = "public.check_jwt"
```

### 7.3 Создание systemd сервиса

```bash
sudo nano /etc/systemd/system/postgrest-mansoni.service
```

Содержимое:

```ini
[Unit]
Description=PostgREST API for Mansoni
After=postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=ubuntu
ExecStart=/usr/local/bin/postgrest /etc/postgrest/mansoni.conf
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Запусти сервис:

```bash
sudo systemctl daemon-reload
sudo systemctl start postgrest-mansoni
sudo systemctl enable postgrest-mansoni
sudo systemctl status postgrest-mansoni
```

---

## 🔥 Шаг 8: Настройка Nginx (обратный прокси)

### 8.1 Установка Nginx

```bash
sudo apt install -y nginx
```

### 8.2 Создание конфигурации

```bash
sudo nano /etc/nginx/sites-available/mansoni-api
```

Содержимое:

```nginx
upstream postgrest {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name api.mansoni.ru;  # Измени на свой домен

    # Логи
    access_log /var/log/nginx/mansoni-api-access.log;
    error_log /var/log/nginx/mansoni-api-error.log;

    # Размеры
    client_max_body_size 10M;

    # CORS заголовки
    add_header 'Access-Control-Allow-Origin' 'https://mansoni.ru' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Accept, apikey, x-client-info' always;
    add_header 'Access-Control-Max-Age' '3600' always;

    # OPTIONS preflight
    if ($request_method = 'OPTIONS') {
        return 204;
    }

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
```

### 8.3 Активация конфигурации

```bash
# Создай символическую ссылку
sudo ln -s /etc/nginx/sites-available/mansoni-api /etc/nginx/sites-enabled/

# Проверь конфигурацию
sudo nginx -t

# Перезапусти Nginx
sudo systemctl restart nginx
sudo systemctl status nginx
```

### 8.4 Установка SSL сертификата (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx

# Получи сертификат (замени на свой домен)
sudo certbot --nginx -d api.mansoni.ru

# Автообновление
sudo certbot renew --dry-run
```

---

## 🔧 Шаг 9: Настройка firewall

```bash
# Установи UFW если не установлен
sudo apt install -y ufw

# Разрешенные порты
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS

# Запрети прямой доступ к PostgreSQL извне
sudo ufw deny 5432/tcp

# Включи firewall
sudo ufw --force enable

# Проверь статус
sudo ufw status verbose
```

---

## 💻 Шаг 10: Обновление frontend (ЛОКАЛЬНО)

### 10.1 Создание .env файла

```powershell
# В корне проекта
@"
# Old Supabase (оставь для Auth и Storage пока)
VITE_SUPABASE_URL=https://lfkbgnbjxskspsownvjm.supabase.co
VITE_SUPABASE_ANON_KEY=твой_анонимный_ключ

# New Timeweb API
VITE_API_URL=https://api.mansoni.ru
VITE_API_KEY=твой_JWT_токен_или_API_ключ
"@ | Out-File -FilePath .env -Encoding utf8
```

### 10.2 Обновление GitHub Pages deployment

Добавь в GitHub Secrets:
- `VITE_API_URL`: `https://api.mansoni.ru`
- `VITE_API_KEY`: твой API ключ

---

## ✅ Шаг 11: Тестирование

### 11.1 Тест подключения к API

```bash
# На сервере
curl http://localhost:3000/

# Ожидаемый ответ: список эндпоинтов
```

### 11.2 Тест через Nginx

```bash
curl http://api.mansoni.ru/profiles?limit=5
```

### 11.3 Локальный тест frontend

```powershell
# ЛОКАЛЬНО
npm run dev

# Открой http://localhost:5173 и проверь:
# - Вход работает (через Supabase Auth)
# - Профили загружаются (через Timeweb API)
# - Посты отображаются
```

---

## 📊 Шаг 12: Мониторинг

### 12.1 Логи PostgreSQL

```bash
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

### 12.2 Логи PostgREST

```bash
sudo journalctl -u postgrest-mansoni -f
```

### 12.3 Логи Nginx

```bash
sudo tail -f /var/log/nginx/mansoni-api-access.log
sudo tail -f /var/log/nginx/mansoni-api-error.log
```

### 12.4 Статистика БД

```sql
-- Подключись к БД
psql -U mansoni_app -d mansoni

-- Размер БД
SELECT pg_size_pretty(pg_database_size('mansoni'));

-- Топ таблиц по размеру
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- Активные подключения
SELECT count(*) FROM pg_stat_activity;
```

---

## 🔄 Шаг 13: Backup и восстановление

### 13.1 Создание backup

```bash
# Полный бэкап
pg_dump -U mansoni_app -d mansoni -F c -f /tmp/mansoni_backup_$(date +%Y%m%d_%H%M%S).dump

# Только схема
pg_dump -U mansoni_app -d mansoni -s -f /tmp/mansoni_schema_$(date +%Y%m%d_%H%M%S).sql

# Только данные
pg_dump -U mansoni_app -d mansoni -a -f /tmp/mansoni_data_$(date +%Y%m%d_%H%M%S).sql
```

### 13.2 Автоматический backup (cron)

```bash
# Создай скрипт
sudo nano /usr/local/bin/backup-mansoni.sh
```

Содержимое:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/mansoni"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Бэкап БД
pg_dump -U mansoni_app -d mansoni -F c -f $BACKUP_DIR/mansoni_$DATE.dump

# Удаление старых бэкапов (старше 7 дней)
find $BACKUP_DIR -name "mansoni_*.dump" -mtime +7 -delete

echo "Backup completed: $DATE"
```

Сделай исполняемым:

```bash
sudo chmod +x /usr/local/bin/backup-mansoni.sh
```

Добавь в cron:

```bash
sudo crontab -e

# Добавь строку (каждый день в 3 утра)
0 3 * * * /usr/local/bin/backup-mansoni.sh >> /var/log/mansoni-backup.log 2>&1
```

### 13.3 Восстановление из backup

```bash
# Из custom формата
pg_restore -U mansoni_app -d mansoni -c /tmp/mansoni_backup_YYYYMMDD_HHMMSS.dump

# Из SQL файла
psql -U mansoni_app -d mansoni -f /tmp/mansoni_schema_YYYYMMDD_HHMMSS.sql
```

---

## 🎯 Чек-лист финальной проверки

- [ ] PostgreSQL 15 установлен и запущен
- [ ] База `mansoni` создана
- [ ] Пользователь `mansoni_app` создан с правами
- [ ] Все 198 миграций применены без ошибок
- [ ] PostgREST установлен и запущен на порту 3000
- [ ] Nginx настроен как reverse proxy
- [ ] SSL сертификат установлен
- [ ] Firewall настроен (закрыт порт 5432)
- [ ] Frontend .env обновлен с новым API URL
- [ ] API отвечает на запросы
- [ ] Бэкапы настроены в cron
- [ ] Логи мониторятся

---

## 🆘 Troubleshooting

### Проблема: Миграции не применяются

```bash
# Проверь права
\du

# Дай права вручную
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mansoni_app;
```

### Проблема: PostgREST не запускается

```bash
# Проверь логи
sudo journalctl -u postgrest-mansoni -n 50

# Проверь подключение к БД
psql -U mansoni_app -d mansoni -h localhost
```

### Проблема: CORS ошибки

Проверь конфигурацию Nginx - заголовки CORS должны быть добавлены.

### Проблема: Slow queries

```sql
-- Включи логирование медленных запросов
ALTER DATABASE mansoni SET log_min_duration_statement = 1000; -- 1 секунда

-- Посмотри статистику
SELECT query, calls, mean_exec_time, max_exec_time 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

---

## 📝 Примечания

1. **Пароли**: Замени все `ваш_пароль_здесь` и `твой_JWT_секрет` на настоящие значения
2. **Домены**: Замени `api.mansoni.ru` на свой домен
3. **Суpabase Auth**: Пока оставь Supabase для аутентификации и файлового хранилища
4. **Миграция данных**: Если нужно перенести данные из Supabase, используй `pg_dump` с Supabase и `pg_restore` в Timeweb

---

Удачи! 🚀
