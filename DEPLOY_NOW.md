# 🚀 ВЫПОЛНИ ПРЯМО СЕЙЧАС

## Шаг 1: Открой консоль Timeweb

Зайди в Timeweb Cloud → **Облачные серверы** → твой сервер → **Консоль**.
Дальше все команды ниже выполняй прямо в этой веб-консоли.

---

## Шаг 2: Скопируй и вставь скрипт установки

Скопируй и вставь эту команду в веб-консоль (она создаст файл скрипта):

```bash
cat > /tmp/setup.sh << 'ENDOFSCRIPT'
#!/bin/bash
set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

DB_NAME="mansoni"
DB_USER="mansoni_app"
DB_PASSWORD=""
JWT_SECRET=$(openssl rand -base64 32)

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  УСТАНОВКА MANSONI API НА TIMEWEB CLOUD                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
read -sp "Придумай пароль для БД mansoni_app: " DB_PASSWORD
echo ""
read -sp "Повтори пароль: " DB_PASSWORD_CONFIRM
echo ""

if [ "$DB_PASSWORD" != "$DB_PASSWORD_CONFIRM" ]; then
    log_error "Пароли не совпадают!"
    exit 1
fi

log_info "Обновление системы..."
sudo apt update -qq
sudo apt upgrade -y -qq
log_success "Система обновлена"

log_info "Установка PostgreSQL 15..."
sudo apt install -y -qq postgresql-15 postgresql-contrib-15
sudo systemctl start postgresql
sudo systemctl enable postgresql
log_success "PostgreSQL установлен"

log_info "Создание БД и пользователя..."
sudo -u postgres psql <<EOF
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
\c $DB_NAME
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO $DB_USER;
EOF
log_success "База данных создана"

log_info "Настройка PostgreSQL..."
sudo tee -a /etc/postgresql/15/main/postgresql.conf > /dev/null <<EOF

# Mansoni Settings
listen_addresses = 'localhost'
max_connections = 200
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 10MB
EOF

sudo tee -a /etc/postgresql/15/main/pg_hba.conf > /dev/null <<EOF

# Mansoni Access
local   $DB_NAME   $DB_USER   scram-sha-256
host    $DB_NAME   $DB_USER   127.0.0.1/32   scram-sha-256
EOF

sudo systemctl restart postgresql
log_success "PostgreSQL настроен"

log_info "Установка PostgREST..."
cd /tmp
wget -q https://github.com/PostgREST/postgrest/releases/download/v12.0.2/postgrest-v12.0.2-linux-static-x64.tar.xz
tar xJf postgrest-v12.0.2-linux-static-x64.tar.xz
sudo mv postgrest /usr/local/bin/
sudo chmod +x /usr/local/bin/postgrest
rm postgrest-*.tar.xz
log_success "PostgREST установлен"

log_info "Настройка PostgREST..."
sudo mkdir -p /etc/postgrest
sudo tee /etc/postgrest/mansoni.conf > /dev/null <<EOF
db-uri = "postgres://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
db-schemas = "public"
db-anon-role = "$DB_USER"
db-pool = 10
server-host = "127.0.0.1"
server-port = 3000
jwt-secret = "$JWT_SECRET"
jwt-secret-is-base64 = false
max-rows = 1000
EOF

sudo tee /etc/systemd/system/postgrest-mansoni.service > /dev/null <<EOF
[Unit]
Description=PostgREST API for Mansoni
After=postgresql.service

[Service]
Type=simple
User=ubuntu
ExecStart=/usr/local/bin/postgrest /etc/postgrest/mansoni.conf
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl start postgrest-mansoni
sudo systemctl enable postgrest-mansoni
sleep 2
log_success "PostgREST запущен"

log_info "Установка Nginx..."
sudo apt install -y -qq nginx

sudo tee /etc/nginx/sites-available/mansoni-api > /dev/null <<'EOF'
upstream postgrest {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name _;

    client_max_body_size 10M;

    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Accept, apikey' always;

    if ($request_method = 'OPTIONS') { return 204; }

    location / {
        proxy_pass http://postgrest;
        proxy_set_header Host $host;
    }

    location /health { return 200 "OK\n"; }
}
EOF

sudo ln -sf /etc/nginx/sites-available/mansoni-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
log_success "Nginx установлен"

log_info "Настройка firewall..."
sudo apt install -y -qq ufw
sudo ufw --force disable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 5432/tcp
sudo ufw --force enable
log_success "Firewall настроен"

log_info "Настройка бэкапов..."
sudo mkdir -p /var/backups/mansoni
sudo tee /usr/local/bin/backup-mansoni.sh > /dev/null <<EOF
#!/bin/bash
BACKUP_DIR="/var/backups/mansoni"
DATE=\$(date +%Y%m%d_%H%M%S)
export PGPASSWORD="$DB_PASSWORD"
pg_dump -U $DB_USER -d $DB_NAME -F c -f \$BACKUP_DIR/mansoni_\$DATE.dump
find \$BACKUP_DIR -name "mansoni_*.dump" -mtime +7 -delete
EOF

sudo chmod +x /usr/local/bin/backup-mansoni.sh
(sudo crontab -l 2>/dev/null; echo "0 3 * * * /usr/local/bin/backup-mansoni.sh") | sudo crontab -
log_success "Бэкапы настроены"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  УСТАНОВКА ЗАВЕРШЕНА! ✅                                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📝 СОХРАНИ ЭТУ ИНФОРМАЦИЮ:"
echo ""
echo "  Пароль БД: $DB_PASSWORD"
echo "  JWT Secret: $JWT_SECRET"
echo ""
echo "🔄 СЛЕДУЮЩИЕ ШАГИ:"
echo ""
echo "  1. Загрузи SQL файл с миграциями:"
echo "     scp all-migrations.sql ubuntu@5.42.99.76:/tmp/"
echo ""
echo "  2. Примени миграции:"
echo "     PGPASSWORD='$DB_PASSWORD' psql -U $DB_USER -d $DB_NAME -f /tmp/all-migrations.sql"
echo ""
echo "  3. Проверь API:"
echo "     curl http://localhost:3000/"
echo ""
log_success "Готово! 🚀"
ENDOFSCRIPT
```

Нажми **Enter** после вставки.

---

## Шаг 3: Запусти скрипт

```bash
chmod +x /tmp/setup.sh
bash /tmp/setup.sh
```

Скрипт попросит придумать **пароль для БД** - придумай и запомни его!

**⏱️ Время выполнения:** ~5 минут

**📝 ВАЖНО:** В конце скрипт покажет **JWT Secret** - скопируй и сохрани его!

---

## Шаг 4: Загрузи миграции (ПОСЛЕ завершения установки)

### 4.1 На твоем Windows компьютере (новое окно PowerShell):

```powershell
scp "C:\Users\manso\Desktop\разработка\your-ai-companion-main\supabase\.temp\all-migrations.sql" ubuntu@5.42.99.76:/tmp/
```

Введи пароль: `jWYTEVVE@b1c-_`

### 4.2 Вернись на сервер и примени миграции:

```bash
PGPASSWORD='твой_пароль_БД' psql -U mansoni_app -d mansoni -f /tmp/all-migrations.sql
```

Замени `твой_пароль_БД` на пароль, который придумал в шаге 3.

---

## ✅ Проверка

```bash
# Должны быть 50+ таблиц
PGPASSWORD='твой_пароль' psql -U mansoni_app -d mansoni -c "\dt"

# API должен отвечать
curl http://localhost:3000/

# Проверь снаружи (на Windows):
curl http://5.42.99.76/
```

---

## 🎉 Готово!

После этого обнови `.env.production`:

```
VITE_API_URL=http://5.42.99.76
VITE_API_KEY=<JWT_SECRET из шага 3>
```

И добавь эти значения в **GitHub Secrets** для автоматического деплоя.
