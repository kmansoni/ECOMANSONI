#!/bin/bash
#
# Скрипт автоматической настройки PostgreSQL на Timeweb Cloud VPS
# Выполни на сервере: bash server-setup.sh
#

set -e  # Останавливаться при ошибках

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функции
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Параметры БД
DB_NAME="mansoni"
DB_USER="mansoni_app"
DB_PASSWORD=""  # Будет запрошен интерактивно
JWT_SECRET=""   # Будет сгенерирован автоматически

# Запрос пароля БД
read -sp "Введи пароль для пользователя БД mansoni_app: " DB_PASSWORD
echo
read -sp "Повтори пароль: " DB_PASSWORD_CONFIRM
echo

if [ "$DB_PASSWORD" != "$DB_PASSWORD_CONFIRM" ]; then
    log_error "Пароли не совпадают!"
    exit 1
fi

# Генерация JWT секрета (32 символа)
JWT_SECRET=$(openssl rand -base64 32)

log_info "==================================================="
log_info "  Установка PostgreSQL и настройка Mansoni API"
log_info "==================================================="
echo
log_info "База данных: $DB_NAME"
log_info "Пользователь: $DB_USER"
log_info "JWT Secret: сгенерирован автоматически"
echo
read -p "Продолжить? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "Установка отменена"
    exit 0
fi

#
# Шаг 1: Обновление системы
#
log_info "Шаг 1/11: Обновление системы..."
sudo apt update
sudo apt upgrade -y
log_success "Система обновлена"

#
# Шаг 2: Установка PostgreSQL 15
#
log_info "Шаг 2/11: Установка PostgreSQL 15..."
sudo apt install -y postgresql-15 postgresql-contrib-15
sudo systemctl start postgresql
sudo systemctl enable postgresql
log_success "PostgreSQL установлен и запущен"

#
# Шаг 3: Установка расширений PostgreSQL
#
log_info "Шаг 3/11: Установка расширений..."
# pgvector может отсутствовать в стандартных репозиториях
sudo apt install -y postgresql-15-pg-stat-monitor || log_warning "pg_stat_monitor не установлен"
log_success "Расширения установлены"

#
# Шаг 4: Создание БД и пользователя
#
log_info "Шаг 4/11: Создание базы данных и пользователя..."

sudo -u postgres psql <<EOF
-- Создание пользователя
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';

-- Создание БД
CREATE DATABASE $DB_NAME OWNER $DB_USER;

-- Подключение к БД
\c $DB_NAME

-- Установка расширений
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Права пользователю
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO $DB_USER;

-- Права по умолчанию
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO $DB_USER;
EOF

log_success "База данных создана"

#
# Шаг 5: Настройка PostgreSQL
#
log_info "Шаг 5/11: Настройка PostgreSQL..."

# Бэкап оригинальной конфигурации
sudo cp /etc/postgresql/15/main/postgresql.conf /etc/postgresql/15/main/postgresql.conf.backup
sudo cp /etc/postgresql/15/main/pg_hba.conf /etc/postgresql/15/main/pg_hba.conf.backup

# Настройка postgresql.conf
sudo tee -a /etc/postgresql/15/main/postgresql.conf > /dev/null <<EOF

# ====== Mansoni Custom Settings ======
listen_addresses = 'localhost'
max_connections = 200
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
work_mem = 10MB
random_page_cost = 1.1
effective_io_concurrency = 200
EOF

# Настройка pg_hba.conf
sudo tee -a /etc/postgresql/15/main/pg_hba.conf > /dev/null <<EOF

# ====== Mansoni Access Rules ======
local   $DB_NAME        $DB_USER                                scram-sha-256
host    $DB_NAME        $DB_USER        127.0.0.1/32            scram-sha-256
host    $DB_NAME        $DB_USER        ::1/128                 scram-sha-256
EOF

sudo systemctl restart postgresql
log_success "PostgreSQL настроен"

#
# Шаг 6: Установка PostgREST
#
log_info "Шаг 6/11: Установка PostgREST..."

cd /tmp
POSTGREST_VERSION="v12.0.2"
wget -q https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz
tar xJf postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz
sudo mv postgrest /usr/local/bin/
sudo chmod +x /usr/local/bin/postgrest
rm postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz

# Проверка версии
INSTALLED_VERSION=$(postgrest --version | head -n 1)
log_success "PostgREST установлен: $INSTALLED_VERSION"

#
# Шаг 7: Настройка PostgREST
#
log_info "Шаг 7/11: Настройка PostgREST..."

sudo mkdir -p /etc/postgrest

sudo tee /etc/postgrest/mansoni.conf > /dev/null <<EOF
db-uri = "postgres://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
db-schemas = "public"
db-anon-role = "$DB_USER"
db-pool = 10
db-pool-timeout = 10

server-host = "127.0.0.1"
server-port = 3000

jwt-secret = "$JWT_SECRET"
jwt-secret-is-base64 = false

max-rows = 1000
EOF

log_success "PostgREST настроен"

#
# Шаг 8: Создание systemd сервиса
#
log_info "Шаг 8/11: Создание systemd сервиса для PostgREST..."

sudo tee /etc/systemd/system/postgrest-mansoni.service > /dev/null <<EOF
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
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl start postgrest-mansoni
sudo systemctl enable postgrest-mansoni

# Ожидание запуска
sleep 2

if sudo systemctl is-active --quiet postgrest-mansoni; then
    log_success "PostgREST сервис запущен"
else
    log_error "PostgREST сервис не запустился. Проверь логи: journalctl -u postgrest-mansoni -n 50"
    exit 1
fi

#
# Шаг 9: Установка Nginx
#
log_info "Шаг 9/11: Установка Nginx..."

sudo apt install -y nginx

# Настройка виртуального хоста
sudo tee /etc/nginx/sites-available/mansoni-api > /dev/null <<'EOF'
upstream postgrest {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name _;  # Измени на свой домен позже

    access_log /var/log/nginx/mansoni-api-access.log;
    error_log /var/log/nginx/mansoni-api-error.log;

    client_max_body_size 10M;

    # CORS заголовки
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Accept, apikey, x-client-info' always;
    add_header 'Access-Control-Max-Age' '3600' always;

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

    location /health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/mansoni-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

log_success "Nginx установлен и настроен"

#
# Шаг 10: Настройка firewall
#
log_info "Шаг 10/11: Настройка firewall..."

sudo apt install -y ufw
sudo ufw --force disable  # Сброс правил

# Базовые правила
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Разрешенные порты
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

# Запрет прямого доступа к PostgreSQL
sudo ufw deny 5432/tcp comment 'Block PostgreSQL'

sudo ufw --force enable

log_success "Firewall настроен"

#
# Шаг 11: Настройка автоматических бэкапов
#
log_info "Шаг 11/11: Настройка автоматических бэкапов..."

sudo mkdir -p /var/backups/mansoni

sudo tee /usr/local/bin/backup-mansoni.sh > /dev/null <<EOF
#!/bin/bash
BACKUP_DIR="/var/backups/mansoni"
DATE=\$(date +%Y%m%d_%H%M%S)

export PGPASSWORD="$DB_PASSWORD"
pg_dump -U $DB_USER -d $DB_NAME -F c -f \$BACKUP_DIR/mansoni_\$DATE.dump

# Удаление старых бэкапов (старше 7 дней)
find \$BACKUP_DIR -name "mansoni_*.dump" -mtime +7 -delete

echo "[\$DATE] Backup completed"
EOF

sudo chmod +x /usr/local/bin/backup-mansoni.sh

# Добавление в cron (каждый день в 3 утра)
(sudo crontab -l 2>/dev/null; echo "0 3 * * * /usr/local/bin/backup-mansoni.sh >> /var/log/mansoni-backup.log 2>&1") | sudo crontab -

log_success "Автоматические бэкапы настроены (каждый день в 3:00)"

#
# Финальная информация
#
echo
log_success "==================================================="
log_success "  Установка завершена успешно!"
log_success "==================================================="
echo
log_info "📊 Информация для подключения:"
echo
echo "  База данных:"
echo "    Host:     localhost"
echo "    Port:     5432"
echo "    Database: $DB_NAME"
echo "    User:     $DB_USER"
echo "    Password: [установлен]"
echo
echo "  PostgREST API:"
echo "    Internal: http://127.0.0.1:3000"
echo "    External: http://$(curl -s ifconfig.me):80"
echo
echo "  JWT Secret (сохрани в .env):"
echo "    $JWT_SECRET"
echo
log_info "📝 Следующие шаги:"
echo
echo "  1. Загрузи SQL файл с миграциями:"
echo "     scp all-migrations.sql ubuntu@$(curl -s ifconfig.me):/tmp/"
echo
echo "  2. Примени миграции:"
echo "     PGPASSWORD='$DB_PASSWORD' psql -U $DB_USER -d $DB_NAME -f /tmp/all-migrations.sql"
echo
echo "  3. Проверь API:"
echo "     curl http://localhost:3000/"
echo
echo "  4. Настрой домен и SSL:"
echo "     sudo certbot --nginx -d api.mansoni.ru"
echo
echo "  5. Обнови CORS в Nginx (замени * на свой домен)"
echo
log_info "📚 Полезные команды:"
echo
echo "  Логи PostgREST:  sudo journalctl -u postgrest-mansoni -f"
echo "  Логи PostgreSQL: sudo tail -f /var/log/postgresql/postgresql-15-main.log"
echo "  Логи Nginx:      sudo tail -f /var/log/nginx/mansoni-api-access.log"
echo "  Статус сервисов: sudo systemctl status postgresql postgrest-mansoni nginx"
echo "  Backup вручную:  sudo /usr/local/bin/backup-mansoni.sh"
echo
log_success "Готово! 🚀"
