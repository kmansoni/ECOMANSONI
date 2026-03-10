# 02 — Операционные Runbooks

## Содержание

- [2.1 Incident: Delivery Drop (доставка упала)](#21-incident-delivery-drop)
- [2.2 Incident: IP в Blacklist](#22-incident-ip-в-blacklist)
- [2.3 Incident: Queue Spike](#23-incident-queue-spike)
- [2.4 Backup & Restore](#24-backup--restore)
- [2.5 Secret Rotation](#25-secret-rotation)
- [2.6 GDPR Data Erasure](#26-gdpr-data-erasure)

---

## 2.1 Incident: Delivery Drop

**Severity:** P1  
**Время реакции:** 15 минут  
**Escalation:** если проблема не решена за 30 минут — эскалировать

### Симптомы

- Bounce rate > 5%
- Письма застряли в очереди (статус `queued` > 10 минут)
- Dashboard показывает резкое падение `email_delivered_total`
- Алерт: `HighBounceRate` или `DeliveryLatencyHigh`

### Диагностика

**Шаг 1: Проверить статус очереди**

```bash
# Статус всех очередей через API
curl -s http://localhost:3100/email/admin/queues \
  -H "Authorization: Bearer $ADMIN_JWT" | jq .
```

Ожидаемый вывод в норме:

```json
{
  "email-send": {
    "waiting": 0,
    "active": 2,
    "completed": 1500,
    "failed": 3,
    "delayed": 0
  }
}
```

**Шаг 2: Проверить circuit breaker**

```bash
curl -s http://localhost:3100/ready | jq '.checks.smtp'
```

Если `"error"` — circuit breaker разомкнут (>5 ошибок подряд).

**Шаг 3: Очередь Postfix**

```bash
# Посмотреть очередь Postfix
docker exec email-postfix mailq

# Если > 100 писем — что-то блокирует отправку
# Посмотреть конкретное письмо
docker exec email-postfix postcat -q <QUEUE_ID>
```

**Шаг 4: Логи ошибок**

```bash
# Последние ошибки email-router
docker logs email-router --tail 100 | grep -i error

# Логи Postfix
docker logs email-postfix --tail 100

# Фильтровать по типу bounce
docker logs email-postfix --tail 200 | grep "550\|551\|552\|553\|554"
```

**Шаг 5: Проверить DNS**

```bash
# MX записи принимающего домена (Gmail)
dig +short MX gmail.com

# Проверить, не изменился ли PTR
dig +short -x YOUR_SERVER_IP

# SPF mansoni.ru
dig +short TXT mansoni.ru | grep spf
```

**Шаг 6: Проверить blacklists**

```bash
# Быстрая проверка через mxtoolbox
curl -s "https://api.mxtoolbox.com/api/v1/Lookup/blacklist/YOUR_IP" \
  -H "Authorization: YOUR_MXTOOLBOX_API_KEY"

# Ручная проверка Spamhaus
dig +short YOUR_IP_REVERSED.zen.spamhaus.org
# Пример: для IP 1.2.3.4: dig +short 4.3.2.1.zen.spamhaus.org
# 127.0.0.2 = listed in SBL
# 127.0.0.10 = listed in PBL (нормально для сервера)
# NXDOMAIN = not listed ✅
```

### Действия по устранению

**Сброс circuit breaker:**

```bash
# Через API
curl -X POST http://localhost:3100/email/admin/circuit-breaker/reset \
  -H "Authorization: Bearer $ADMIN_JWT"

# Проверить что сбросился
curl -s http://localhost:3100/ready | jq '.checks.smtp'
```

**Перезапуск Postfix:**

```bash
docker restart email-postfix
# Подождать 10 секунд
sleep 10
# Проверить
docker exec email-postfix postfix status
# Flush очередь
docker exec email-postfix postfix flush
```

**Retry застрявших сообщений:**

```bash
# Через API
curl -X POST http://localhost:3100/email/admin/queues/retry-failed \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"queue": "email-send"}'
```

**Если проблема в DNS:**

```bash
# Обновить кеш DNS в контейнерах
docker exec email-router kill -HUP 1
```

### Escalation

Если через 30 минут доставка не восстановилась:
1. Проверить статус IP в Spamhaus / Barracuda (см. [2.2](#22-incident-ip-в-blacklist))
2. Связаться с хостинг-провайдером (проблема с портом 25)
3. Временно переключить на резервный SMTP relay (SendGrid / Mailgun)

---

## 2.2 Incident: IP в Blacklist

**Severity:** P1  
**Время реакции:** 30 минут  
**Влияние:** письма отклоняются удалённым сервером (550 ошибка)

### Симптомы

- Ошибки вида: `550 5.7.1 Message rejected due to IP blacklist`
- Ошибки вида: `554 5.7.1 Service unavailable; Client host [X.X.X.X] blocked using zen.spamhaus.org`
- Bounce rate резко вырос до 30–100% для определённых доменов
- Алерт: `IPBlacklisted`

### Диагностика

**Определить, в каких блэклистах находится IP:**

```bash
SERVER_IP="YOUR_SERVER_IP"

# Spamhaus (основной)
REVERSED=$(echo $SERVER_IP | awk -F. '{print $4"."$3"."$2"."$1}')
dig +short $REVERSED.zen.spamhaus.org
# 127.0.0.2 = SBL (spam source)
# 127.0.0.4 = XBL (botnet/exploit)
# 127.0.0.10/11 = PBL (policy, нормально)

# Barracuda
dig +short $REVERSED.b.barracudacentral.org

# SpamCop
dig +short $REVERSED.bl.spamcop.net

# Комплексная проверка онлайн
echo "Проверить на: https://mxtoolbox.com/blacklists.aspx?q=$SERVER_IP"
```

**Найти причину (что привело к blacklist):**

```bash
# Анализ Postfix логов — что отправлялось массово
docker logs email-postfix --since 24h | \
  grep "status=sent" | \
  awk '{print $7}' | \
  sort | uniq -c | sort -rn | head -20

# Проверить, не является ли open relay
# С ДРУГОГО сервера:
telnet YOUR_SERVER_IP 25
EHLO test
MAIL FROM: <test@gmail.com>
RCPT TO: <test@yahoo.com>
# Если "250 Ok" — OPEN RELAY! Нужно немедленно закрыть.

# Проверить аномальные объёмы отправки
curl -s http://localhost:3100/email/admin/stats?period=24h \
  -H "Authorization: Bearer $ADMIN_JWT" | jq .
```

### Действия по устранению

**Немедленно (первые 10 минут):**

```bash
# 1. Остановить отправку
docker exec email-postfix postsuper -h ALL  # Hold all messages

# 2. Проверить очередь на подозрительные письма
docker exec email-postfix mailq | head -50

# 3. Если found spam — удалить из очереди
docker exec email-postfix postsuper -d <QUEUE_ID>
```

**Delisting процедура:**

| Блэклист | Delisting URL | Примечание |
|---|---|---|
| Spamhaus SBL | https://www.spamhaus.org/sbl/removal/ | Автоматически, ждать 24–48ч |
| Barracuda | https://www.barracudacentral.org/rbl/removal | Автоматически |
| SpamCop | https://www.spamcop.net/bl.shtml | Автоматически через 24–48ч |
| Microsoft SNDS | https://sendersupport.olc.protection.outlook.com/snds/ | Нужна регистрация |

**После delisting:**

```bash
# Разблокировать очередь Postfix
docker exec email-postfix postsuper -H ALL  # Unhould all

# Убедиться что open relay закрыт
# В postfix/main.cf должно быть:
# mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128
# (только localhost!)

docker exec email-postfix postfix reload
```

### Профилактика

- Мониторинг blacklists каждые 6 часов (Prometheus + mxtoolbox API)
- Suppression list: автоматически добавлять hard bounce адреса
- Warm-up: не превышать 50 писем/день в первую неделю
- Добавить `List-Unsubscribe` заголовок во все массовые рассылки
- Проверять DMARC отчёты еженедельно

---

## 2.3 Incident: Queue Spike

**Severity:** P2  
**Время реакции:** 30 минут

### Симптомы

- Queue size > 10 000 сообщений
- Send latency > 10 секунд (P95)
- Алерт: `QueueSizeHigh` или `SendLatencyHigh`
- SMTP connections pool exhausted

### Диагностика

**Grafana dashboard:**

```
URL: http://localhost:3000/d/email-overview
Метрики для проверки:
  - bullmq_queue_size{queue="email-send"}
  - email_send_duration_ms (P95, P99)
  - smtp_connections_active
  - smtp_connections_pool_size
```

**BullMQ статистика через API:**

```bash
curl -s http://localhost:3100/email/admin/queues \
  -H "Authorization: Bearer $ADMIN_JWT" | jq .

# Или через Redis напрямую
docker exec email-redis redis-cli LLEN "bull:email-send:wait"
docker exec email-redis redis-cli LLEN "bull:email-send:active"
docker exec email-redis redis-cli LLEN "bull:email-send:failed"
docker exec email-redis redis-cli LLEN "bull:email-send:delayed"
```

**Анализ причины:**

```bash
# Массовая рассылка?
curl -s http://localhost:3100/email/admin/jobs?status=waiting&limit=10 \
  -H "Authorization: Bearer $ADMIN_JWT" | jq '.[] | {tenant, createdAt}'

# SMTP relay медленный?
docker logs email-postfix --tail 50 | grep "connect to"

# Проблема с соединением к удалённому серверу?
docker logs email-postfix --since 10m | grep "Connection refused\|Connection timed out"
```

### Действия по устранению

**Масштабирование воркеров:**

```bash
# Увеличить количество конкурентных воркеров
# В infra/email/.env.local:
EMAIL_QUEUE_CONCURRENCY=20  # по умолчанию 5

# Перезапустить email-router
docker restart email-router
```

**Пауза batch-задач:**

```bash
# Поставить на паузу все несрочные задачи
curl -X POST http://localhost:3100/email/admin/queues/pause \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"queue": "email-batch"}'
```

**Проверить SMTP connection pool:**

```bash
# Текущие SMTP соединения
docker exec email-postfix postfix status
docker exec email-postfix mailq | tail -3

# Увеличить лимит соединений в postfix/main.cf
# default_destination_concurrency_limit = 20 → 40
docker exec email-postfix postfix reload
```

**Очистка DLQ и replay:**

```bash
# Посмотреть содержимое dead letter queue
curl -s http://localhost:3100/email/admin/queues/dlq \
  -H "Authorization: Bearer $ADMIN_JWT" | jq .

# Replay всех failed сообщений
curl -X POST http://localhost:3100/email/admin/queues/retry-failed \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"queue": "email-send", "limit": 100}'

# Или удалить failed если они невалидны
curl -X DELETE http://localhost:3100/email/admin/queues/failed \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"queue": "email-send", "olderThan": "1h"}'
```

---

## 2.4 Backup & Restore

### Backup PostgreSQL

```bash
# Ручной backup
make backup-db

# Эквивалент вручную:
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec email-postgres \
  pg_dump -U emailuser emaildb \
  | gzip > /backups/email-pg/backup_$TIMESTAMP.sql.gz

echo "Backup создан: backup_$TIMESTAMP.sql.gz"
ls -lh /backups/email-pg/backup_$TIMESTAMP.sql.gz
```

### Restore PostgreSQL

```bash
# Восстановить из последнего backup
make restore-db FILE=backup_20240101_030000.sql.gz

# Вручную:
# 1. Остановить email-router (чтобы не было новых запросов)
docker stop email-router

# 2. Восстановить БД
zcat /backups/email-pg/backup_20240101_030000.sql.gz | \
  docker exec -i email-postgres \
  psql -U emailuser emaildb

# 3. Запустить email-router
docker start email-router

# 4. Проверить что всё работает
curl -s http://localhost:3100/ready | jq .
```

### Backup Redis

```bash
# Создать RDB snapshot
docker exec email-redis redis-cli BGSAVE

# Дождаться завершения
docker exec email-redis redis-cli LASTSAVE

# Скопировать snapshot
docker cp email-redis:/data/dump.rdb /backups/email-redis/dump_$(date +%Y%m%d).rdb
```

### Restore Redis

```bash
# 1. Остановить Redis
docker stop email-redis

# 2. Заменить dump.rdb
docker cp /backups/email-redis/dump_20240101.rdb email-redis:/data/dump.rdb

# 3. Запустить Redis
docker start email-redis

# 4. Проверить
docker exec email-redis redis-cli PING
```

### Автоматический cron backup

```bash
# Добавить в crontab (редактировать: crontab -e)

# Ежедневный backup PostgreSQL в 03:00
0 3 * * * cd /path/to/infra/email && make backup-db >> /var/log/email-backup.log 2>&1

# Еженедельный backup Redis (воскресенье 04:00)
0 4 * * 0 docker exec email-redis redis-cli BGSAVE && \
  docker cp email-redis:/data/dump.rdb \
  /backups/email-redis/dump_$(date +\%Y\%m\%d).rdb

# Удалить backups старше 30 дней
0 5 * * * find /backups/email-pg/ -name "*.sql.gz" -mtime +30 -delete
0 5 * * 0 find /backups/email-redis/ -name "*.rdb" -mtime +90 -delete
```

### Проверка backup (тестирование)

**Ежемесячно** запускать restore test:

```bash
# Создать тестовую БД
docker exec email-postgres createdb -U emailuser emaildb_test

# Восстановить в тестовую БД
zcat /backups/email-pg/$(ls -t /backups/email-pg/ | head -1) | \
  docker exec -i email-postgres \
  psql -U emailuser emaildb_test

# Проверить количество записей
docker exec email-postgres psql -U emailuser emaildb_test \
  -c "SELECT COUNT(*) FROM email_messages;"

# Удалить тестовую БД
docker exec email-postgres dropdb -U emailuser emaildb_test

echo "✅ Backup verify OK"
```

---

## 2.5 Secret Rotation

### Принципы ротации

- Все секреты меняются без downtime (overlap period)
- После смены — тестовый прогон
- Логировать дату ротации в `/docs/email-platform/secrets-log.md` (без значений!)

### PostgreSQL password rotation

```bash
# 1. Сгенерировать новый пароль
NEW_PG_PASS=$(openssl rand -base64 32)

# 2. Обновить пароль в PostgreSQL
docker exec email-postgres psql -U emailuser \
  -c "ALTER USER emailuser PASSWORD '$NEW_PG_PASS';"

# 3. Обновить .env.local
sed -i "s/PG_PASSWORD=.*/PG_PASSWORD=$NEW_PG_PASS/" infra/email/.env.local

# 4. Перезапустить сервисы (они перечитают env)
docker restart email-router

# 5. Проверить подключение
curl -s http://localhost:3100/ready | jq '.checks.postgres'
# Ожидается: "ok"
```

### Redis password rotation

```bash
# 1. Сгенерировать новый пароль
NEW_REDIS_PASS=$(openssl rand -base64 32)

# 2. Обновить пароль в Redis (без перезапуска)
docker exec email-redis redis-cli CONFIG SET requirepass "$NEW_REDIS_PASS"

# 3. Обновить .env.local
sed -i "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=$NEW_REDIS_PASS/" infra/email/.env.local

# 4. Перезапустить email-router (BullMQ переподключится)
docker restart email-router

# 5. Проверить
curl -s http://localhost:3100/ready | jq '.checks.redis'
```

### JWT secret rotation

> ⚠️ JWT secret используется Supabase. Ротация требует координации с frontend.

```bash
# 1. Обновить SUPABASE_JWT_SECRET в Supabase Dashboard
#    Settings → API → JWT Settings

# 2. Обновить в .env.local
sed -i "s/SUPABASE_JWT_SECRET=.*/SUPABASE_JWT_SECRET=$NEW_SECRET/" infra/email/.env.local

# 3. Перезапустить email-router
docker restart email-router

# 4. Предупредить пользователей о необходимости re-login
# (их старые JWT токены станут невалидными)
```

### DKIM key rotation

DKIM ротация требует 48 часов overlap (старый и новый selector работают одновременно).

```bash
# 1. Сгенерировать новый ключ с новым selector
SELECTOR_NEW="mail2"  # текущий: mail1
make dkim-gen SELECTOR=$SELECTOR_NEW

# 2. Добавить новую DNS TXT запись (НЕ удалять старую!)
cat infra/email/dkim/$SELECTOR_NEW/public.key
# Добавить в DNS:
# mail2._domainkey.mansoni.ru TXT "v=DKIM1; k=rsa; p=<NEW_PUBLIC_KEY>"

# 3. Подождать 48 часов (TTL DNS + доставка in-flight писем)
sleep 172800  # Не буквально, просто подождать 2 дня

# 4. Обновить конфигурацию на новый selector
sed -i "s/DKIM_SELECTOR=.*/DKIM_SELECTOR=$SELECTOR_NEW/" infra/email/.env.local

# 5. Перезапустить opendkim
docker restart email-opendkim

# 6. Проверить DKIM подпись
make dkim-check

# 7. Через 48 часов — удалить старую DNS запись
# Удалить: mail1._domainkey.mansoni.ru
```

### EMAIL_ENCRYPTION_KEY rotation

```bash
# 1. Сгенерировать новый ключ
NEW_ENCRYPT_KEY=$(openssl rand -base64 64)

# 2. Запустить миграцию (перешифровать существующие данные)
docker exec email-router node scripts/rotate-encryption-key.js \
  --old-key "$OLD_ENCRYPT_KEY" \
  --new-key "$NEW_ENCRYPT_KEY"

# 3. Обновить .env.local
sed -i "s/EMAIL_ENCRYPTION_KEY=.*/EMAIL_ENCRYPTION_KEY=$NEW_ENCRYPT_KEY/" infra/email/.env.local

# 4. Перезапустить
docker restart email-router
```

### Таблица ротации секретов

| Секрет | Интервал | Процедура | Downtime |
|---|---|---|---|
| `PG_PASSWORD` | 90 дней | ALTER USER + restart router | Нет |
| `REDIS_PASSWORD` | 90 дней | CONFIG SET + restart router | Нет |
| `SUPABASE_JWT_SECRET` | 180 дней | Supabase Dashboard + restart | Re-login users |
| `DKIM key` | 365 дней | Новый selector + 48h overlap | Нет |
| `EMAIL_ENCRYPTION_KEY` | 365 дней | Migrate + restart | Нет |

---

## 2.6 GDPR Data Erasure

**Требование:** право на забвение (GDPR Art. 17) — удаление персональных данных пользователя в течение 30 дней с момента запроса.

### Что стирается

- Все email сообщения, где пользователь — получатель (`to`, `cc`, `bcc`)
- Все события доставки для этих сообщений
- Кешированные данные в Redis
- Записи в suppression list

### Процедура стирания данных

```bash
# Удаление данных пользователя по email адресу
curl -X DELETE http://localhost:3100/email/admin/gdpr/erase \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

Ожидаемый ответ:

```json
{
  "success": true,
  "erasedAt": "2024-01-01T12:00:00.000Z",
  "summary": {
    "messages": 42,
    "events": 127,
    "suppressionEntries": 1,
    "cacheKeys": 3
  },
  "auditLogId": "gdpr_01ABCDEF..."
}
```

### Проверка стирания

```bash
# Убедиться что данные удалены (должен вернуть 0)
curl -s http://localhost:3100/email/admin/gdpr/check \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}' | jq '.count'
# Ожидается: 0
```

### Экспорт данных (право на доступ, GDPR Art. 15)

```bash
# Получить все данные пользователя (для high-stakes запросов)
curl -s http://localhost:3100/email/admin/gdpr/export \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}' \
  -o user_data_export.json
```

### Audit log GDPR операций

Все GDPR операции записываются в append-only лог. Проверить:

```bash
# Лог всех GDPR erasure запросов
docker exec email-postgres psql -U emailuser emaildb \
  -c "SELECT * FROM gdpr_audit_log ORDER BY created_at DESC LIMIT 20;"
```

### SLA и сроки

| Действие | Срок |
|---|---|
| Принять запрос | Немедленно (API) |
| Стереть данные | В течение 30 дней (GDPR) |
| Подтвердить стирание | В течение 30 дней |
| Хранить audit log | 3 года (для доказательства) |
