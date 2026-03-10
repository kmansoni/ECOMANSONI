# 01 — Быстрый старт: от нуля до первого письма

## Содержание

1. [Prerequisites](#1-prerequisites)
2. [Быстрый старт (dev, 5 минут)](#2-быстрый-старт-dev-5-минут)
3. [Проверка DKIM/SPF/DMARC](#3-проверка-dkimspfdmarc)
4. [Выход в staging](#4-выход-в-staging)
5. [Выход в production](#5-выход-в-production)
6. [Справочник CLI команд](#6-справочник-cli-команд)

---

## 1. Prerequisites

### Обязательные компоненты

| Компонент | Версия | Проверка |
|---|---|---|
| Docker | 24+ | `docker --version` |
| Docker Compose | v2+ | `docker compose version` |
| Node.js | 20+ | `node --version` |
| Git | любая | `git --version` |
| openssl | любая | `openssl version` |

### Инфраструктура

- **Домен** `mansoni.ru` с доступом к панели DNS (Cloudflare / reg.ru / etc.)
- **VPS/сервер** с публичным IPv4 адресом
- Порты **25, 465, 587** открыты на входящий трафик (для SMTP)
- Порт **3100** доступен для email-router API
- Обратная DNS-запись (PTR) настраивается у хостинг-провайдера

### Рекомендуемые характеристики сервера

```
CPU:  2+ ядра
RAM:  4 GB (минимум)
Disk: 20 GB SSD
OS:   Ubuntu 22.04 LTS / Debian 12
```

---

## 2. Быстрый старт (dev, 5 минут)

### Шаг 1 — Клонировать репозиторий

```bash
git clone <repo-url> && cd your-ai-companion-main
```

### Шаг 2 — Настроить переменные окружения

```bash
cd infra/email
cp .env .env.local
```

Открыть `.env.local` и установить обязательные значения:

```bash
# Обязательно изменить:
SUPABASE_JWT_SECRET=your_supabase_jwt_secret_here
PG_PASSWORD=strong_password_here

# Опционально для dev:
DOMAIN=mansoni.ru
FROM_EMAIL=noreply@mansoni.ru
```

### Шаг 3 — Сгенерировать DKIM ключи

```bash
make dkim-gen
```

Команда создаёт пару RSA 2048-bit ключей в `infra/email/dkim/`:
- `private.key` — приватный ключ (не коммитить!)
- `public.key` — публичный ключ для DNS TXT записи

### Шаг 4 — Запустить core сервисы

```bash
make up-dev
```

Запускает контейнеры: `email-router`, `postgres`, `redis`, `postfix`, `opendkim`.

Проверить статус:

```bash
docker compose ps
```

Ожидаемый вывод — все сервисы в состоянии `Up` или `healthy`.

### Шаг 5 — Проверить health

```bash
make health
```

Эквивалентная команда:

```bash
curl -s http://localhost:3100/health | jq .
```

Ожидаемый ответ:

```json
{
  "status": "ok",
  "service": "email-router",
  "version": "1.0.0",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Шаг 6 — Проверить readiness

```bash
make ready
```

Эквивалентная команда:

```bash
curl -s http://localhost:3100/ready | jq .
```

Ожидаемый ответ — все checks в состоянии `ok`:

```json
{
  "status": "ok",
  "checks": {
    "postgres": "ok",
    "redis": "ok",
    "smtp": "ok"
  }
}
```

> ⚠️ Если `smtp: "error"` — Postfix не запустился. Проверить: `docker logs email-postfix --tail 50`

### Шаг 7 — Отправить тестовое письмо

```bash
# Получить JWT токен для тестов
export TEST_JWT=$(make get-test-jwt)

# Отправить письмо
curl -X POST http://localhost:3100/email/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d '{
    "to": [{"email": "your@email.com", "name": "Test User"}],
    "subject": "Test от mansoni.ru",
    "text": "Hello! Это тестовое письмо с email-платформы.",
    "html": "<p>Hello! Это <strong>тестовое письмо</strong> с email-платформы.</p>"
  }'
```

Ожидаемый ответ:

```json
{
  "messageId": "msg_01ABCDEF...",
  "status": "queued"
}
```

### Шаг 8 — Проверить статус доставки

```bash
curl -s http://localhost:3100/email/status/msg_01ABCDEF... \
  -H "Authorization: Bearer $TEST_JWT" | jq .
```

Ожидаемый ответ через 5–30 секунд:

```json
{
  "messageId": "msg_01ABCDEF...",
  "status": "delivered",
  "deliveredAt": "2024-01-01T00:00:05.000Z"
}
```

---

## 3. Проверка DKIM/SPF/DMARC

### DNS проверка через dig

```bash
# DKIM публичный ключ
dig +short TXT mail._domainkey.mansoni.ru

# SPF запись
dig +short TXT mansoni.ru

# DMARC политика
dig +short TXT _dmarc.mansoni.ru

# MX записи
dig +short MX mansoni.ru

# PTR (обратная DNS)
dig +short -x YOUR_SERVER_IP
```

### Ожидаемые значения DNS

```
# SPF — разрешить отправку с вашего IP
mansoni.ru TXT "v=spf1 ip4:YOUR_SERVER_IP ~all"

# DKIM — публичный ключ (добавить из infra/email/dkim/public.key)
mail._domainkey.mansoni.ru TXT "v=DKIM1; k=rsa; p=MIIBIjAN..."

# DMARC — начать с p=none для мониторинга
_dmarc.mansoni.ru TXT "v=DMARC1; p=none; rua=mailto:dmarc@mansoni.ru"

# MX
mansoni.ru MX 10 mail.mansoni.ru
```

### Онлайн инструменты проверки

| Инструмент | URL | Что проверяет |
|---|---|---|
| MXToolbox | https://mxtoolbox.com/SuperTool.aspx | MX, SPF, DKIM, DMARC, blacklists |
| Mail Tester | https://www.mail-tester.com/ | Комплексный тест (отправить письмо) |
| DKIM Validator | https://dkimvalidator.com/ | DKIM подпись |
| Google Admin Toolbox | https://toolbox.googleapps.com/apps/checkmx/ | MX и репутация |

### Проверка через mail-tester.com

```bash
# 1. Зайти на mail-tester.com — получить одноразовый адрес
# 2. Отправить тестовое письмо на этот адрес:
curl -X POST http://localhost:3100/email/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d '{
    "to": [{"email": "test-xxxxx@mail-tester.com"}],
    "subject": "Test mansoni.ru",
    "text": "Test message",
    "html": "<p>Test message</p>"
  }'

# 3. Проверить результат на mail-tester.com
# Цель: ≥ 7/10 для dev, ≥ 9/10 для production
```

---

## 4. Выход в staging

### 4.1 Настройка DNS записей

Добавить в DNS панели управления (TTL = 300 для начала):

```
# 1. SPF
mansoni.ru  IN TXT  "v=spf1 ip4:YOUR_VPS_IP include:_spf.mansoni.ru ~all"

# 2. DKIM (взять публичный ключ из infra/email/dkim/public.key)
mail._domainkey.mansoni.ru  IN TXT  "v=DKIM1; k=rsa; p=<PUBLIC_KEY>"

# 3. DMARC (начать с p=none)
_dmarc.mansoni.ru  IN TXT  "v=DMARC1; p=none; sp=none; rua=mailto:dmarc-reports@mansoni.ru; ruf=mailto:dmarc-forensic@mansoni.ru; fo=1"

# 4. MX
mansoni.ru  IN MX  10 mail.mansoni.ru

# 5. A запись для mail-сервера
mail.mansoni.ru  IN A  YOUR_VPS_IP
```

### 4.2 TLS сертификат (Let's Encrypt)

```bash
# Установить certbot
apt-get install -y certbot

# Получить сертификат
certbot certonly --standalone -d mail.mansoni.ru \
  --email admin@mansoni.ru \
  --agree-tos \
  --non-interactive

# Сертификат будет в:
# /etc/letsencrypt/live/mail.mansoni.ru/fullchain.pem
# /etc/letsencrypt/live/mail.mansoni.ru/privkey.pem

# Скопировать в infra/email/certs/
cp /etc/letsencrypt/live/mail.mansoni.ru/fullchain.pem infra/email/certs/
cp /etc/letsencrypt/live/mail.mansoni.ru/privkey.pem infra/email/certs/

# Автообновление (cron)
echo "0 3 1 * * certbot renew --quiet && make reload-tls" | crontab -
```

### 4.3 Прогрев IP адреса (IP Warm-up)

Начинать с малых объёмов и удваивать каждый день:

| День | Объём | Bounce rate | Действие |
|---|---|---|---|
| 1 | 50 | < 2% | Продолжать |
| 2 | 100 | < 2% | Продолжать |
| 3 | 200 | < 2% | Продолжать |
| 4 | 500 | < 2% | Продолжать |
| 5 | 1 000 | < 2% | Продолжать |
| 7 | 5 000 | < 2% | Продолжать |
| 14 | 50 000 | < 2% | ✅ IP прогрет |

> ⚠️ Если bounce rate > 5% — остановить прогрев, проверить blacklists, почистить список

### 4.4 DMARC policy progression

```
# Неделя 1: мониторинг (не блокировать)
p=none; rua=mailto:dmarc@mansoni.ru

# Неделя 3: карантин
p=quarantine; pct=25; rua=mailto:dmarc@mansoni.ru

# Неделя 6: полная защита
p=reject; rua=mailto:dmarc@mansoni.ru
```

---

## 5. Выход в production

### 5.1 Безопасность — сменить пароли

```bash
# Сгенерировать надёжные секреты
openssl rand -base64 32  # PG_PASSWORD
openssl rand -base64 32  # REDIS_PASSWORD
openssl rand -base64 64  # EMAIL_ENCRYPTION_KEY

# Обновить в .env.local
nano infra/email/.env.local
```

### 5.2 Включить TLS для SMTP

В `infra/email/postfix/main.cf`:

```ini
# TLS для входящих соединений
smtpd_tls_cert_file = /etc/ssl/certs/mail.pem
smtpd_tls_key_file = /etc/ssl/private/mail.key
smtpd_tls_security_level = encrypt
smtpd_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1

# TLS для исходящих соединений
smtp_tls_security_level = may
smtp_tls_protocols = !SSLv2, !SSLv3
```

### 5.3 Мониторинг — Grafana dashboards

```bash
# Запустить observability стек
make up-monitoring

# Grafana доступна на http://localhost:3000
# Login: admin / admin (сменить немедленно!)

# Импортировать dashboards:
# infra/email/grafana/dashboards/email-overview.json
# infra/email/grafana/dashboards/delivery-metrics.json
# infra/email/grafana/dashboards/queue-health.json
```

### 5.4 Настройка алертов в Prometheus

```yaml
# infra/email/prometheus/alerts.yml
groups:
  - name: email-platform
    rules:
      - alert: HighBounceRate
        expr: rate(email_bounces_total[5m]) / rate(email_sent_total[5m]) > 0.05
        for: 5m
        annotations:
          summary: "Bounce rate > 5%"

      - alert: QueueSizeHigh
        expr: bullmq_queue_size > 10000
        for: 1m
        annotations:
          summary: "Queue size превышает 10k"

      - alert: EmailRouterDown
        expr: up{job="email-router"} == 0
        for: 1m
        annotations:
          summary: "email-router недоступен"
```

### 5.5 Backup cron для PostgreSQL

```bash
# Добавить в crontab
crontab -e

# Ежедневный backup в 03:00
0 3 * * * cd /path/to/infra/email && make backup-db >> /var/log/email-backup.log 2>&1

# Проверить backup retention (хранить 30 дней)
find /backups/email-pg/ -name "*.sql.gz" -mtime +30 -delete
```

### 5.6 Production checklist

- [ ] Все пароли сменены (`PG_PASSWORD`, `REDIS_PASSWORD`, `EMAIL_ENCRYPTION_KEY`)
- [ ] TLS enabled (`smtpd_tls_security_level=encrypt`)
- [ ] DMARC `p=reject`
- [ ] PTR запись настроена
- [ ] Grafana dashboards настроены
- [ ] Alerting настроен (Prometheus → Telegram/Slack)
- [ ] Backup cron запущен
- [ ] IP warm-up завершён
- [ ] Mail-tester.com score ≥ 9/10
- [ ] Open relay тест прошёл (не является open relay)

---

## 6. Справочник CLI команд

### Управление сервисами

| Команда | Описание |
|---|---|
| `make up-dev` | Запустить все сервисы (dev режим) |
| `make up` | Запустить все сервисы (production) |
| `make down` | Остановить все сервисы |
| `make restart` | Перезапустить все сервисы |
| `make logs` | Показать логи всех сервисов |
| `make logs-router` | Показать логи email-router |
| `make logs-postfix` | Показать логи Postfix |

### Диагностика

| Команда | Описание |
|---|---|
| `make health` | Проверить `/health` endpoint |
| `make ready` | Проверить `/ready` endpoint (все зависимости) |
| `make dkim-check` | Проверить DKIM конфигурацию |
| `make queue-stats` | Статистика BullMQ очередей |
| `make postfix-queue` | Очередь Postfix (`mailq`) |
| `make postfix-flush` | Принудительная отправка очереди Postfix |

### Ключи и секреты

| Команда | Описание |
|---|---|
| `make dkim-gen` | Сгенерировать пару DKIM ключей |
| `make dkim-rotate` | Ротация DKIM ключей (новый selector) |
| `make secrets-check` | Проверить наличие всех обязательных env vars |

### Backup и восстановление

| Команда | Описание |
|---|---|
| `make backup-db` | Создать backup PostgreSQL |
| `make restore-db FILE=backup.sql.gz` | Восстановить из backup |
| `make backup-redis` | Создать BGSAVE snapshot Redis |

### DNS проверки

```bash
# Полная проверка DNS одной командой
make dns-check DOMAIN=mansoni.ru

# Эквивалент вручную:
echo "=== MX ===" && dig +short MX mansoni.ru
echo "=== SPF ===" && dig +short TXT mansoni.ru | grep spf
echo "=== DKIM ===" && dig +short TXT mail._domainkey.mansoni.ru
echo "=== DMARC ===" && dig +short TXT _dmarc.mansoni.ru
echo "=== PTR ===" && dig +short -x $(curl -s ifconfig.me)
```

### Postfix диагностика

```bash
# Показать очередь
docker exec email-postfix mailq

# Посмотреть содержимое письма в очереди
docker exec email-postfix postcat -q <QUEUE_ID>

# Принудительно отправить очередь
docker exec email-postfix postfix flush

# Удалить всю очередь (осторожно!)
docker exec email-postfix postsuper -d ALL

# Проверить конфигурацию
docker exec email-postfix postfix check
```

### Redis диагностика

```bash
# Подключиться к Redis
docker exec -it email-redis redis-cli

# Просмотр BullMQ очередей
docker exec email-redis redis-cli KEYS "bull:*" | head -20

# Размер очереди ожидания
docker exec email-redis redis-cli LLEN "bull:email-send:wait"

# Прочитать статистику памяти
docker exec email-redis redis-cli INFO memory | grep used_memory_human
```
