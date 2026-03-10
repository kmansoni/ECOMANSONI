# Self-Hosted Email Platform — Production Architecture

> **Проект:** your-ai-companion (ECOMANSONI)
> **Домен:** mansoni.ru
> **Версия документа:** 1.0.0
> **Дата:** 2026-03-10
> **Статус:** Draft → Review

---

## Содержание

1. [Обзор и принципы](#1-обзор-и-принципы)
2. [C4-диаграмма контейнеров](#2-c4-диаграмма-контейнеров)
3. [Потоки данных — Sequence Diagrams](#3-потоки-данных)
4. [Описание компонентов](#4-описание-компонентов)
5. [Security: Threat Model — STRIDE](#5-security-threat-model--stride)
6. [Надёжность и отказоустойчивость](#6-надёжность-и-отказоустойчивость)
7. [DNS-записи](#7-dns-записи)
8. [Deliverability Checklist](#8-deliverability-checklist)
9. [План внедрения — 3 фазы](#9-план-внедрения--3-фазы)
10. [GDPR и Data Handling](#10-gdpr-и-data-handling)

---

## 1. Обзор и принципы

### 1.1 Цель

Полностью self-hosted email-инфраструктура для отправки транзакционных и системных писем платформы ECOMANSONI. Никаких внешних SaaS-провайдеров (SendGrid, Mailgun, SES запрещены). Только open-source self-hosted компоненты.

### 1.2 Текущее состояние

Существующий `email-router` — zero-dependency Node.js сервис с:
- Raw SMTP-клиент (RFC 5321, STARTTLS, AUTH PLAIN)
- API Key аутентификация (`X-API-Key`)
- HTML-шаблоны с XSS-защитой (`{{variable}}` + `{{url:variable}}`)
- In-memory store (требует миграцию на PostgreSQL)
- Синхронная отправка (нет очередей)
- SMTP override для per-user credentials через Supabase Edge Function
- Docker-ready с non-root user

### 1.3 Архитектурные принципы

| Принцип | Реализация |
|---------|-----------|
| **Zero external SaaS** | Все компоненты self-hosted, open-source |
| **At-least-once delivery** | BullMQ + idempotency key + дедупликация |
| **Defense in depth** | JWT + mTLS + DKIM + DMARC + Rspamd |
| **Observe everything** | Prometheus + Grafana + Loki для всех компонентов |
| **Graceful degradation** | Circuit breaker, retry с backoff, DLQ |
| **GDPR by design** | PII шифрование, retention policy, right to erasure |

### 1.4 Выбор технологий

| Компонент | Рекомендуемый (default) | Альтернатива |
|-----------|------------------------|-------------|
| API Gateway | Node.js 20 + Fastify | текущий raw http (сохраняем zero-dep) |
| Очередь задач | Redis 7 + BullMQ | PostgreSQL pgboss |
| SMTP relay | Postfix 3.8 | Haraka (Node.js SMTP) |
| DKIM | OpenDKIM 2.11 | Rspamd встроенный DKIM |
| DMARC | OpenDMARC 1.4 | Rspamd DMARC module |
| Anti-spam | Rspamd 3.x | SpamAssassin |
| БД | PostgreSQL 16 | SQLite (только dev) |
| Мониторинг | Prometheus + Grafana | VictoriaMetrics + Grafana |
| Логи | Loki + Promtail | Elasticsearch + Filebeat |
| TLS сертификаты | Let's Encrypt + certbot | acme.sh |

---

## 2. C4-диаграмма контейнеров

```mermaid
graph TB
    subgraph external [Внешние системы]
        supabase[Supabase Auth<br/>JWT/JWKS Provider]
        dns[DNS<br/>SPF/DKIM/DMARC]
        recipients[Получатели<br/>Gmail/Yandex/Mail.ru]
        blacklists[Blacklist Services<br/>Spamhaus/DNSBL]
    end

    subgraph platform [Email Platform — Docker Network]
        subgraph api_layer [API Layer]
            router[email-router<br/>Node.js 20<br/>:8090 HTTP]
        end

        subgraph queue_layer [Queue Layer]
            redis[(Redis 7<br/>:6379)]
            bullmq_send[BullMQ: send<br/>основная очередь]
            bullmq_retry[BullMQ: retry<br/>повторные попытки]
            bullmq_dlq[BullMQ: dead-letter<br/>необработанные]
        end

        subgraph smtp_layer [SMTP Layer]
            postfix[Postfix 3.8<br/>:25/:587 SMTP]
            opendkim[OpenDKIM<br/>:8891 milter]
            opendmarc[OpenDMARC<br/>:8893 milter]
            rspamd[Rspamd 3.x<br/>:11332 milter<br/>:11334 web UI]
        end

        subgraph data_layer [Data Layer]
            postgres[(PostgreSQL 16<br/>:5432)]
        end

        subgraph observability [Observability Stack]
            prometheus[Prometheus<br/>:9090]
            grafana[Grafana<br/>:3000]
            loki[Loki<br/>:3100]
            promtail[Promtail<br/>log collector]
        end
    end

    supabase -->|JWKS validation| router
    router -->|enqueue job| redis
    redis --> bullmq_send
    bullmq_send -->|SMTP submit| postfix
    bullmq_send -->|on failure| bullmq_retry
    bullmq_retry -->|max retries exceeded| bullmq_dlq
    postfix -->|milter protocol| opendkim
    postfix -->|milter protocol| opendmarc
    postfix -->|milter protocol| rspamd
    postfix -->|deliver| recipients
    recipients -->|bounce DSN| postfix
    postfix -->|bounce webhook| router
    router -->|CRUD| postgres
    router -->|suppression check| postgres
    router -->|metrics /metrics| prometheus
    prometheus --> grafana
    loki --> grafana
    promtail -->|logs| loki
    router -.->|structured logs| promtail
    postfix -.->|mail.log| promtail
    rspamd -.->|rspamd logs| promtail
    dns -.->|SPF/DKIM/DMARC records| recipients
    router -->|check| blacklists

    style router fill:#4A90D9,color:#fff
    style redis fill:#DC382D,color:#fff
    style postfix fill:#FFB347,color:#000
    style postgres fill:#336791,color:#fff
    style prometheus fill:#E6522C,color:#fff
    style grafana fill:#F46800,color:#fff
    style rspamd fill:#5CB85C,color:#fff
```

### 2.1 Границы системы

| Граница | Протокол | Аутентификация |
|---------|----------|----------------|
| App → email-router | HTTPS :8090 | JWT (Supabase JWKS) |
| email-router → Redis | TCP :6379 | AUTH password |
| BullMQ worker → Postfix | SMTP :587 STARTTLS | SASL PLAIN |
| Postfix → Internet | SMTP :25 TLS | DKIM подпись |
| Internet → Postfix | SMTP :25 | SPF/DKIM/DMARC проверка |
| Postfix → email-router | HTTP webhook | Internal API key |
| email-router → PostgreSQL | TCP :5432 | md5/scram-sha-256 |
| Prometheus → * | HTTP /metrics | Bearer token |

---

## 3. Потоки данных

### 3.1 Отправка транзакционного письма

```mermaid
sequenceDiagram
    participant App as Application
    participant Router as email-router
    participant PG as PostgreSQL
    participant Q as Redis/BullMQ
    participant Worker as Queue Worker
    participant Postfix as Postfix SMTP
    participant DKIM as OpenDKIM
    participant Net as Internet/Recipient

    App->>Router: POST /api/v1/emails<br/>Authorization: Bearer JWT<br/>Idempotency-Key: uuid
    Router->>Router: Validate JWT via JWKS
    Router->>PG: Check idempotency_key exists
    alt Duplicate request
        PG-->>Router: Found existing record
        Router-->>App: 200 OK — cached result
    end
    Router->>PG: Check suppression_list for recipient
    alt Recipient suppressed
        PG-->>Router: Suppressed — hard_bounce/complaint
        Router-->>App: 422 RECIPIENT_SUPPRESSED
    end
    Router->>PG: INSERT email_messages — status=queued
    Router->>Q: BullMQ.add — send queue
    Router-->>App: 202 Accepted — messageId

    Q->>Worker: Dequeue job
    Worker->>Postfix: SMTP MAIL FROM / RCPT TO / DATA
    Postfix->>DKIM: Sign via milter
    DKIM-->>Postfix: Signed message
    Postfix->>Net: Deliver via MX lookup
    Net-->>Postfix: 250 OK
    Postfix-->>Worker: SMTP 250 response
    Worker->>PG: UPDATE status=sent, smtp_response
    Worker->>Q: Job completed
```

### 3.2 Retry Flow с Exponential Backoff

```mermaid
sequenceDiagram
    participant Q as Send Queue
    participant W as Worker
    participant SMTP as Postfix
    participant RQ as Retry Queue
    participant DLQ as Dead-Letter Queue
    participant PG as PostgreSQL

    Q->>W: Dequeue job - attempt 1
    W->>SMTP: SMTP submit
    SMTP-->>W: 4xx Temporary Error

    W->>PG: UPDATE status=retrying, attempt=1
    W->>RQ: Re-enqueue — delay 30s

    Note over RQ: Backoff: 30s, 120s, 480s, 1920s, 7680s

    RQ->>W: Dequeue — attempt 2 — after 30s
    W->>SMTP: SMTP submit
    SMTP-->>W: 4xx Temporary Error
    W->>PG: UPDATE attempt=2
    W->>RQ: Re-enqueue — delay 120s

    RQ->>W: Dequeue — attempt 5 — after 7680s
    W->>SMTP: SMTP submit
    SMTP-->>W: 4xx Temporary Error

    W->>PG: UPDATE status=failed, moved_to_dlq=true
    W->>DLQ: Move to Dead-Letter Queue
    W->>PG: INSERT email_events — type=dlq_moved

    Note over DLQ: Manual review / replay via admin API
```

**Retry Policy:**

| Попытка | Задержка | Формула |
|---------|----------|---------|
| 1 | 30 сек | `30 * 4^0` |
| 2 | 120 сек (2 мин) | `30 * 4^1` |
| 3 | 480 сек (8 мин) | `30 * 4^2` |
| 4 | 1920 сек (32 мин) | `30 * 4^3` |
| 5 | 7680 сек (2.1 ч) | `30 * 4^4` |

После 5 попыток → Dead-Letter Queue. Общее время ожидания: ~2.7 часа.

### 3.3 Bounce/DSN Processing

```mermaid
sequenceDiagram
    participant Net as Recipient MTA
    participant PF as Postfix
    participant Router as email-router
    participant PG as PostgreSQL
    participant Prom as Prometheus

    Net->>PF: DSN — 550 User not found
    PF->>PF: Parse DSN — extract original Message-ID
    PF->>Router: POST /internal/webhooks/bounce<br/>X-Internal-Key: secret
    Router->>PG: SELECT email by original_message_id
    Router->>PG: UPDATE status=bounced, bounce_type
    
    alt Hard Bounce — 5xx
        Router->>PG: INSERT suppression_list<br/>reason=hard_bounce, permanent=true
        Router->>Prom: counter email_bounces_total type=hard
    end
    
    alt Soft Bounce — 4xx
        Router->>PG: UPDATE soft_bounce_count += 1
        Router->>Prom: counter email_bounces_total type=soft
        alt soft_bounce_count >= 3 за 7 дней
            Router->>PG: INSERT suppression_list<br/>reason=repeated_soft_bounce
        end
    end

    Router->>PG: INSERT email_events — type=bounce
```

### 3.4 Complaint / Feedback Loop Processing

```mermaid
sequenceDiagram
    participant ISP as ISP Feedback Loop<br/>Gmail/Yahoo
    participant PF as Postfix
    participant Router as email-router
    participant PG as PostgreSQL

    ISP->>PF: ARF Report — abuse complaint
    PF->>Router: POST /internal/webhooks/complaint<br/>body: ARF parsed data
    Router->>PG: SELECT email by reported_message_id
    Router->>PG: UPDATE status=complained
    Router->>PG: INSERT suppression_list<br/>reason=complaint, permanent=true
    Router->>PG: INSERT email_events — type=complaint
    
    Note over Router,PG: Complaint = немедленная<br/>suppression без возможности<br/>автоматического снятия
```

### 3.5 Suppression Check — перед каждой отправкой

```mermaid
sequenceDiagram
    participant W as Queue Worker
    participant PG as PostgreSQL
    participant Q as Send Queue

    Q->>W: Dequeue send job
    W->>PG: SELECT FROM suppression_list<br/>WHERE email = recipient<br/>AND domain = sending_domain
    
    alt Suppressed
        PG-->>W: Found — reason: hard_bounce/complaint
        W->>PG: UPDATE email_messages<br/>status=suppressed
        W->>PG: INSERT email_events<br/>type=suppressed_before_send
        W->>Q: Job completed — not sent
    end
    
    alt Not suppressed
        PG-->>W: Not found
        W->>W: Proceed with SMTP delivery
    end
```

---

## 4. Описание компонентов

### 4.1 email-router (API Gateway)

| Параметр | Значение |
|----------|---------|
| **Назначение** | HTTP API gateway для приёма запросов на отправку, управления шаблонами, статусами, suppression list |
| **Технология** | Node.js 20 (zero-dependency, raw http модуль) |
| **Порты** | `:8090` HTTP, `:9091` Prometheus metrics |
| **Зависимости** | Redis, PostgreSQL, Supabase Auth (JWKS) |
| **SLA** | 99.9% uptime, p99 latency < 100ms для enqueue |
| **Healthcheck** | `GET /health` — проверка Redis + PostgreSQL + SMTP probe |

**Текущий код:** `email-router/src/` — zero-dependency SMTP клиент, template engine, API key auth.

**Изменения для production:**
- Добавить JWT validation через Supabase JWKS (сохранить API key как fallback для service-to-service)
- Заменить синхронный `sendMail()` на BullMQ enqueue
- Мигрировать in-memory store на PostgreSQL
- Добавить idempotency key проверку
- Добавить suppression list проверку перед enqueue
- Добавить `/metrics` endpoint для Prometheus
- Добавить `/internal/webhooks/bounce` и `/internal/webhooks/complaint`

**API Endpoints:**

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| `POST` | `/api/v1/emails` | Отправить письмо | JWT / API Key |
| `GET` | `/api/v1/emails/:id` | Статус письма | JWT / API Key |
| `GET` | `/api/v1/emails` | Список писем с фильтрами | JWT / API Key |
| `POST` | `/api/v1/templates` | Создать шаблон | JWT (admin) |
| `GET` | `/api/v1/templates` | Список шаблонов | JWT / API Key |
| `GET` | `/api/v1/stats` | Статистика отправок | JWT (admin) |
| `GET` | `/api/v1/suppression` | Suppression list | JWT (admin) |
| `DELETE` | `/api/v1/suppression/:email` | Удалить из suppression | JWT (admin) |
| `POST` | `/internal/webhooks/bounce` | Bounce callback от Postfix | Internal Key |
| `POST` | `/internal/webhooks/complaint` | Complaint callback | Internal Key |
| `GET` | `/health` | Health check | None |
| `GET` | `/metrics` | Prometheus metrics | Bearer token |

### 4.2 Redis + BullMQ (Queue Layer)

| Параметр | Значение |
|----------|---------|
| **Назначение** | Очередь задач для асинхронной отправки, retry, dead-letter |
| **Технология** | Redis 7.2 OSS + BullMQ 5.x (npm) |
| **Порты** | `:6379` TCP |
| **Зависимости** | Нет (standalone) |
| **SLA** | 99.99% — при потере Redis отправка деградирует до синхронной |
| **Persistence** | AOF + RDB snapshots каждые 60 сек |

**Очереди:**

| Очередь | Назначение | Concurrency | Rate limit |
|---------|-----------|-------------|------------|
| `email:send` | Основная отправка | 10 workers | 100/мин |
| `email:retry` | Повторные попытки | 5 workers | 50/мин |
| `email:dlq` | Dead-letter (failed) | 1 worker (manual) | — |
| `email:bounce` | Обработка bounce | 3 workers | — |
| `email:scheduled` | Отложенная отправка | 5 workers | 100/мин |

### 4.3 Postfix (SMTP Relay)

| Параметр | Значение |
|----------|---------|
| **Назначение** | SMTP relay для исходящей и входящей почты |
| **Технология** | Postfix 3.8 |
| **Порты** | `:25` SMTP (входящая), `:587` submission (STARTTLS), `:465` SMTPS |
| **Зависимости** | OpenDKIM, OpenDMARC, Rspamd (milter chain) |
| **SLA** | 99.9% — при недоступности Postfix BullMQ накапливает задачи |
| **Конфигурация** | `main.cf`: `smtpd_milters = inet:opendkim:8891, inet:opendmarc:8893, inet:rspamd:11332` |

**Ключевые настройки `main.cf`:**

```
# Identity
myhostname = mail.mansoni.ru
mydomain = mansoni.ru
myorigin = $mydomain

# TLS (outbound)
smtp_tls_security_level = may
smtp_tls_CApath = /etc/ssl/certs
smtp_tls_loglevel = 1

# TLS (inbound)
smtpd_tls_security_level = may
smtpd_tls_cert_file = /etc/letsencrypt/live/mail.mansoni.ru/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/mail.mansoni.ru/privkey.pem

# SASL auth
smtpd_sasl_auth_enable = yes
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth

# Milter chain
smtpd_milters = inet:opendkim:8891, inet:opendmarc:8893, inet:rspamd:11332
non_smtpd_milters = $smtpd_milters
milter_default_action = accept

# Queue limits
maximal_queue_lifetime = 5d
bounce_queue_lifetime = 1d
message_size_limit = 10240000

# Rate limiting
smtpd_client_message_rate_limit = 100
anvil_rate_time_unit = 60s
```

### 4.4 OpenDKIM

| Параметр | Значение |
|----------|---------|
| **Назначение** | DKIM-подпись исходящих писем |
| **Технология** | OpenDKIM 2.11 |
| **Порты** | `:8891` milter protocol |
| **Зависимости** | Postfix (подключается как milter) |
| **SLA** | 99.9% — при недоступности Postfix отправляет без подписи (`milter_default_action = accept`) |

**Конфигурация:**

```
# /etc/opendkim.conf
Mode                    sv          # sign & verify
Socket                  inet:8891
Domain                  mansoni.ru
Selector                mail
KeyFile                 /etc/opendkim/keys/mansoni.ru/mail.private
Canonicalization        relaxed/relaxed
SignatureAlgorithm      rsa-sha256
OversignHeaders         From
```

### 4.5 OpenDMARC

| Параметр | Значение |
|----------|---------|
| **Назначение** | DMARC верификация входящих писем + aggregate reporting |
| **Технология** | OpenDMARC 1.4 |
| **Порты** | `:8893` milter protocol |
| **Зависимости** | Postfix, OpenDKIM (должен быть в цепочке раньше) |
| **SLA** | 99.9% |

**Конфигурация:**

```
# /etc/opendmarc.conf
Socket                  inet:8893
AuthservID              mail.mansoni.ru
RejectFailures          true
TrustedAuthservIDs      mail.mansoni.ru
IgnoreHosts             /etc/opendmarc/ignore.hosts
HistoryFile             /var/run/opendmarc/opendmarc.dat
```

### 4.6 Rspamd (Anti-spam / Policy Engine)

| Параметр | Значение |
|----------|---------|
| **Назначение** | Anti-spam фильтрация, virus scanning, policy enforcement, rate limiting |
| **Технология** | Rspamd 3.x |
| **Порты** | `:11332` milter, `:11334` Web UI |
| **Зависимости** | Redis (для Bayes, rate limiting, greylisting) |
| **SLA** | 99.9% — при недоступности Postfix пропускает без фильтрации |

**Модули:**

| Модуль | Назначение |
|--------|-----------|
| `dkim_signing` | DKIM-подпись (альтернатива OpenDKIM) |
| `arc` | ARC-подпись для forwarding |
| `rbl` | Проверка по blacklists (Spamhaus, etc.) |
| `spf` | SPF-валидация входящих |
| `dkim` | DKIM-верификация входящих |
| `dmarc` | DMARC-проверка входящих |
| `ratelimit` | Rate limiting по IP/sender/recipient |
| `greylisting` | Greylisting для неизвестных MTA |
| `phishing` | Обнаружение фишинговых URL |

### 4.7 PostgreSQL (Data Layer)

| Параметр | Значение |
|----------|---------|
| **Назначение** | Хранение сообщений, событий, шаблонов, suppression list, idempotency keys |
| **Технология** | PostgreSQL 16 |
| **Порты** | `:5432` TCP |
| **Зависимости** | Нет |
| **SLA** | 99.99% |
| **Backup** | pg_dump ежедневно + WAL archiving для PITR |

**Схема БД:**

```sql
-- Основная таблица сообщений
CREATE TABLE email_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) UNIQUE,
    from_address    VARCHAR(320) NOT NULL,
    to_address      VARCHAR(320) NOT NULL,
    subject         TEXT NOT NULL,
    html_body       TEXT,
    text_body       TEXT,
    template_name   VARCHAR(64),
    template_data   JSONB,
    status          VARCHAR(20) NOT NULL DEFAULT 'queued',
    -- queued | sending | sent | delivered | bounced | failed | suppressed | complained
    smtp_message_id VARCHAR(255),
    smtp_response   TEXT,
    attempt_count   INT DEFAULT 0,
    max_attempts    INT DEFAULT 5,
    next_retry_at   TIMESTAMPTZ,
    error_message   TEXT,
    bounce_type     VARCHAR(20), -- hard | soft
    metadata        JSONB DEFAULT '{}',
    service_id      VARCHAR(64), -- RBAC: какой сервис отправил
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    bounced_at      TIMESTAMPTZ,
    failed_at       TIMESTAMPTZ
);

CREATE INDEX idx_email_messages_status ON email_messages(status);
CREATE INDEX idx_email_messages_to ON email_messages(to_address);
CREATE INDEX idx_email_messages_created ON email_messages(created_at DESC);
CREATE INDEX idx_email_messages_idempotency ON email_messages(idempotency_key);
CREATE INDEX idx_email_messages_smtp_mid ON email_messages(smtp_message_id);

-- Журнал событий (append-only)
CREATE TABLE email_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
    event_type  VARCHAR(30) NOT NULL,
    -- queued | sending | sent | delivered | bounced | failed | suppressed
    -- | complained | dlq_moved | retrying | opened | clicked
    payload     JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_events_message ON email_events(message_id, created_at);
CREATE INDEX idx_email_events_type ON email_events(event_type);

-- Suppression list
CREATE TABLE suppression_list (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(320) NOT NULL,
    domain      VARCHAR(255) NOT NULL, -- sending domain
    reason      VARCHAR(30) NOT NULL,
    -- hard_bounce | repeated_soft_bounce | complaint | manual | unsubscribe
    source_message_id UUID REFERENCES email_messages(id),
    permanent   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ, -- для temporary suppression
    UNIQUE(email, domain)
);

CREATE INDEX idx_suppression_email ON suppression_list(email, domain);

-- Шаблоны писем
CREATE TABLE email_templates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(64) NOT NULL UNIQUE,
    subject     TEXT,
    html_body   TEXT NOT NULL,
    text_body   TEXT,
    variables   JSONB DEFAULT '[]', -- описание переменных шаблона
    version     INT DEFAULT 1,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency keys с TTL
CREATE TABLE idempotency_keys (
    key         VARCHAR(255) PRIMARY KEY,
    message_id  UUID NOT NULL REFERENCES email_messages(id),
    response    JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);

-- RBAC: сервисные аккаунты
CREATE TABLE email_service_accounts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id  VARCHAR(64) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    api_key_hash VARCHAR(128) NOT NULL, -- SHA-256 of API key
    role        VARCHAR(20) NOT NULL DEFAULT 'app',
    -- roles: service (internal), admin (full), app (standard send)
    rate_limit  INT DEFAULT 100, -- per minute
    allowed_from VARCHAR(320)[], -- разрешённые from addresses
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cleanup: удаление expired idempotency keys
-- Запускать через pg_cron или cron job
-- DELETE FROM idempotency_keys WHERE expires_at < NOW();
```

### 4.8 Prometheus + Grafana + Loki (Observability)

| Компонент | Назначение | Порт | SLA |
|-----------|-----------|------|-----|
| **Prometheus** | Сбор метрик (pull model) | `:9090` | 99.9% |
| **Grafana** | Дашборды, алерты | `:3000` | 99.9% |
| **Loki** | Агрегация логов | `:3100` | 99.9% |
| **Promtail** | Сбор логов из контейнеров | — | — |

**Ключевые метрики (Prometheus):**

```
# email-router
email_send_requests_total{status="accepted|rejected|error"}
email_send_latency_seconds{quantile="0.5|0.9|0.99"}
email_queue_size{queue="send|retry|dlq"}
email_active_workers{queue="send|retry"}

# Delivery
email_delivered_total{provider="gmail|yandex|mailru|other"}
email_bounced_total{type="hard|soft"}
email_complained_total
email_suppressed_total{reason="hard_bounce|complaint|manual"}

# SMTP
smtp_connection_duration_seconds
smtp_errors_total{code="4xx|5xx|timeout|dns"}
smtp_circuit_breaker_state{state="closed|open|half_open"}

# Infrastructure
postfix_queue_size
rspamd_scanned_total{action="reject|greylist|add_header|no_action"}
redis_connected_clients
pg_active_connections
```

**Grafana Dashboards:**

1. **Email Overview** — отправки/доставки/bounce rates за период
2. **Queue Health** — размер очередей, backlog, processing rate
3. **SMTP Performance** — latency, error rates, connection pool
4. **Deliverability** — bounce rate по провайдерам, suppression growth
5. **Infrastructure** — CPU/RAM/Disk для всех контейнеров

**Alert Rules:**

| Alert | Condition | Severity |
|-------|-----------|----------|
| High bounce rate | `email_bounced_total / email_delivered_total > 5%` за 1ч | Critical |
| DLQ growing | `email_queue_size{queue="dlq"} > 100` | Warning |
| SMTP circuit open | `smtp_circuit_breaker_state{state="open"} == 1` | Critical |
| Queue backlog | `email_queue_size{queue="send"} > 1000` за 5мин | Warning |
| Postfix queue full | `postfix_queue_size > 5000` | Critical |
| Redis down | `up{job="redis"} == 0` за 1мин | Critical |

---

## 5. Security: Threat Model — STRIDE

### 5.1 Spoofing (Подмена идентичности)

| Угроза | Вектор | Митигация | Компонент |
|--------|--------|-----------|-----------|
| Подмена JWT | Forge JWT token | JWKS валидация через Supabase публичный ключ. `iss`, `exp`, `aud` claims проверяются. Key rotation через JWKS endpoint | email-router |
| Подмена API key | Brute-force API key | SHA-256 hash + `crypto.timingSafeEqual`. Минимум 32 символа. Rate limit на auth failures | email-router |
| Email spoofing | Отправка от чужого домена | SPF `-all`, DKIM required, DMARC `p=reject`. `from` валидируется против config domain | Postfix + DNS |
| Service impersonation | Поддельный internal webhook | mTLS между контейнерами в Docker network + Internal API key | Docker network |

**Реализация JWT:**

```
1. email-router при старте скачивает JWKS с Supabase
2. Кэширует публичные ключи с TTL = 1 час
3. На каждый запрос: decode JWT → verify signature → check exp, iss, aud
4. Извлекает service_id из custom claims для RBAC
5. Fallback: X-API-Key для service-to-service (legacy)
```

### 5.2 Tampering (Нарушение целостности)

| Угроза | Вектор | Митигация |
|--------|--------|-----------|
| Модификация письма в transit | MITM на SMTP | STARTTLS на всех SMTP соединениях. Opportunistic TLS → enforced для крупных провайдеров |
| SMTP header injection | `\r\n` в email headers | `sanitizeSmtpParam()` в `smtp/client.js` удаляет CR/LF/NUL |
| Template injection | Malicious templateData | HTML escaping в `templates/engine.js`. URL sanitization для `{{url:*}}` |
| SQL injection | Malicious input params | Parameterized queries для PostgreSQL. Никаких string concatenation |
| DKIM replay | Re-send signed message | Oversign `From` header. `l=` tag не используется |

### 5.3 Repudiation (Отказ от авторства)

| Угроза | Вектор | Митигация |
|--------|--------|-----------|
| Отрицание отправки | Сервис утверждает что не отправлял | Append-only `email_events` таблица. Каждый state transition логируется с timestamp и actor |
| Отрицание получения | Bounce без доказательств | DSN message сохраняется в `email_events.payload`. SMTP response code + transcript |
| Audit gap | Пропущенные логи | Structured JSON logging. Promtail → Loki с retention. Immutable event stream |

**Structured Log Format:**

```json
{
  "ts": "2026-03-10T12:00:00.000Z",
  "level": "info",
  "event": "email.sent",
  "messageId": "er-1710072000000-abc12345@mansoni.ru",
  "to_hash": "sha256:abc...",
  "service_id": "platform-auth",
  "smtp_code": 250,
  "duration_ms": 342,
  "trace_id": "uuid-v4"
}
```

> **Важно:** `to` адрес логируется как SHA-256 hash, не в plain text (GDPR).

### 5.4 Information Disclosure (Утечка данных)

| Угроза | Вектор | Митигация |
|--------|--------|-----------|
| Утечка SMTP credentials | env vars в логах | Credentials никогда не логируются. `AUTH PLAIN` команда редактируется в debug логах |
| Email содержимое в логах | Structured logging без body | Body/subject не попадают в Loki. Только metadata: to_hash, template_name, status |
| Secrets в Docker image | Build-time secrets | Multi-stage build, secrets через Docker secrets / env vars, никогда не COPY |
| TLS downgrade attack | Перехват SMTP без TLS | `smtp_tls_security_level = encrypt` для известных провайдеров (Gmail, Yandex) |
| Database leak | SQL dump доступен | PostgreSQL: `ssl = on`, encrypted at rest (LUKS). Backup зашифрован GPG |

### 5.5 Denial of Service (Отказ в обслуживании)

| Угроза | Вектор | Митигация |
|--------|--------|-----------|
| API flood | Массовые POST /send | Rate limiting per service_id: 100/мин default. BullMQ rate limiter |
| Queue saturation | Миллион задач в Redis | Max queue depth alert. Circuit breaker при backlog > threshold |
| SMTP connection exhaustion | Открыть 1000 TCP | Connection pool с max size. Postfix `smtpd_client_connection_rate_limit` |
| DNS amplification | Через bounce processing | Rate limit на incoming SMTP. Rspamd greylisting |
| Memory exhaustion | Huge email body | `MAX_BODY_BYTES = 1 MiB` в `server.js`. `message_size_limit = 10MB` в Postfix |

**Rate Limiting Architecture:**

```
Layer 1: Nginx / reverse proxy — IP-based rate limit (generic)
Layer 2: email-router — service_id rate limit (per JWT claim)
Layer 3: BullMQ — queue-level rate limiter (global throughput)
Layer 4: Postfix — SMTP client rate limit (per destination domain)
Layer 5: Rspamd — sender/recipient rate limit
```

### 5.6 Elevation of Privilege (Повышение привилегий)

| Угроза | Вектор | Митигация |
|--------|--------|-----------|
| App sends as admin | Подмена role в JWT | Roles извлекаются из JWT claims, подписанных Supabase. Custom claims не подделать |
| Service escapes Docker | Container breakout | Non-root user в Dockerfile. Read-only filesystem. No `--privileged` |
| API key gives admin access | Shared API key | Каждый сервис имеет свой service_account с явными allowed_from и rate_limit |

**RBAC Matrix:**

| Role | Send email | View stats | Manage templates | Manage suppression | Replay DLQ | View all emails |
|------|-----------|-----------|-----------------|-------------------|-----------|----------------|
| `app` | ✅ (own domain) | ❌ | ❌ | ❌ | ❌ | ❌ |
| `service` | ✅ (any allowed) | ✅ (own) | ✅ | ❌ | ❌ | ✅ (own) |
| `admin` | ✅ (any) | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 6. Надёжность и отказоустойчивость

### 6.1 Retry Policy

| SMTP код | Категория | Действие |
|----------|----------|---------|
| 2xx | Success | `status=sent`, job completed |
| 421 | Temp: server busy | Retry с backoff |
| 450 | Temp: mailbox unavailable | Retry с backoff |
| 451 | Temp: local error | Retry с backoff |
| 452 | Temp: insufficient storage | Retry с backoff |
| 500 | Perm: syntax error | `status=failed`, в DLQ |
| 550 | Perm: user not found | `status=bounced`, suppression list |
| 551 | Perm: user not local | `status=bounced`, suppression list |
| 552 | Perm: message too large | `status=failed`, в DLQ |
| 553 | Perm: mailbox name invalid | `status=bounced`, suppression list |
| 554 | Perm: transaction failed | `status=failed`, в DLQ |
| Timeout | Network | Retry с backoff |
| ECONNREFUSED | Network | Retry с backoff |
| ENOTFOUND | DNS | Retry с backoff (DNS может быть временно) |

### 6.2 Dead-Letter Queue + Replay

```
DLQ содержит:
- Все failed jobs после max_attempts
- Permanent 5xx ошибки (для аудита)
- Jobs, отвергнутые circuit breaker

Replay механизм:
1. Admin просматривает DLQ через GET /api/v1/dlq
2. Может replay отдельное сообщение: POST /api/v1/dlq/:id/replay
3. Может replay все: POST /api/v1/dlq/replay-all?filter=smtp_error
4. Replay сбрасывает attempt_count и помещает обратно в send queue
```

### 6.3 Circuit Breaker для SMTP

```mermaid
stateDiagram-v2
    [*] --> Closed
    Closed --> Open: failures >= threshold<br/>5 failures за 60s
    Open --> HalfOpen: cooldown expired<br/>30s timeout
    HalfOpen --> Closed: probe success
    HalfOpen --> Open: probe failure
    Open --> Open: requests rejected<br/>return 503 + queue
```

**Параметры:**

| Параметр | Значение |
|----------|---------|
| Failure threshold | 5 failures за 60 секунд |
| Cooldown period | 30 секунд |
| Half-open probe count | 1 test message |
| Reset on success | Счётчик failures обнуляется |

**Поведение при Open state:**
- Новые задачи остаются в BullMQ с увеличенным delay
- Метрика `smtp_circuit_breaker_state{state="open"}` → alert
- После cooldown: один probe message → если success → Closed

### 6.4 Graceful Degradation

| Компонент недоступен | Поведение |
|---------------------|-----------|
| **Redis** | Fallback на синхронную отправку (текущий `sendMail()`). Потеря retry/DLQ |
| **PostgreSQL** | Отправка работает, но без записи в БД. Логи в Loki. Health = degraded |
| **Postfix** | Circuit breaker opens. Задачи накапливаются в BullMQ |
| **DNS** | SMTP timeout → retry. Cache resolver (unbound) для DNS с TTL |
| **Prometheus/Grafana** | Не влияет на отправку. Lost observability → alert via healthcheck |
| **OpenDKIM** | `milter_default_action = accept` → письма без DKIM. Alert |
| **Rspamd** | `milter_default_action = accept` → без фильтрации. Alert |

### 6.5 Idempotency

```
Поток:
1. Клиент отправляет POST /api/v1/emails с заголовком Idempotency-Key: <uuid>
2. email-router проверяет idempotency_keys таблицу
3. Если ключ существует и не expired → возвращает cached response (200)
4. Если ключ новый → создаёт запись, обрабатывает, сохраняет response
5. TTL ключа: 24 часа

Гарантия: один Idempotency-Key → максимум одна отправка.
Защита от: дубликатов при network retry, client retry, load balancer retry.
```

### 6.6 At-Least-Once Delivery с дедупликацией

```
Гарантии BullMQ:
- Job не удаляется из Redis пока worker не подтвердит completion
- При crash worker → job возвращается в очередь (visibility timeout)
- Каждый job имеет уникальный jobId = email_messages.id

Дедупликация на стороне worker:
1. Перед отправкой проверяет status в PostgreSQL
2. Если status уже = sent/delivered → skip (дедупликация)
3. Если status = queued/retrying → отправляет
4. UPDATE status = sending перед SMTP (optimistic lock)
```

---

## 7. DNS-записи

### 7.1 Обязательные записи для mansoni.ru

#### SPF

```dns
mansoni.ru.  IN  TXT  "v=spf1 ip4:YOUR_SERVER_IP -all"
```

> Заменить `YOUR_SERVER_IP` на IPv4 адрес VPS. `-all` — строгая политика (fail для неавторизованных IP).

#### DKIM

```dns
mail._domainkey.mansoni.ru.  IN  TXT  "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."
```

> Публичный ключ генерируется командой:
> ```bash
> opendkim-genkey -s mail -d mansoni.ru -b 2048
> ```
> Файл `mail.txt` содержит готовую DNS-запись.

#### DMARC

```dns
_dmarc.mansoni.ru.  IN  TXT  "v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc-rua@mansoni.ru; ruf=mailto:dmarc-ruf@mansoni.ru; adkim=s; aspf=s; pct=100; fo=1"
```

| Параметр | Значение | Описание |
|----------|---------|---------|
| `p=reject` | reject | Политика для домена — отклонять неавторизованные |
| `sp=reject` | reject | Политика для субдоменов |
| `adkim=s` | strict | Strict DKIM alignment |
| `aspf=s` | strict | Strict SPF alignment |
| `rua` | mailto:dmarc-rua@mansoni.ru | Aggregate reports |
| `ruf` | mailto:dmarc-ruf@mansoni.ru | Forensic reports |
| `pct=100` | 100% | Применять ко всем письмам |
| `fo=1` | 1 | Отчёт при любом SPF/DKIM failure |

> **Внимание:** Начать с `p=none` на Phase 1 для мониторинга. Перейти на `p=quarantine` после проверки, затем `p=reject` на Phase 2.

#### MX

```dns
mansoni.ru.  IN  MX  10  mail.mansoni.ru.
mail.mansoni.ru.  IN  A  YOUR_SERVER_IP
```

#### PTR / rDNS

```
YOUR_SERVER_IP  IN  PTR  mail.mansoni.ru.
```

> PTR-запись настраивается у хостинг-провайдера (VPS panel). Это **критически важно** для deliverability — без PTR Gmail и Yandex могут отклонять письма.

**Проверка:**
```bash
dig -x YOUR_SERVER_IP
# Должен вернуть: mail.mansoni.ru.
```

### 7.2 Дополнительные записи

#### MTA-STS (RFC 8461)

```dns
_mta-sts.mansoni.ru.  IN  TXT  "v=STSv1; id=20260310T000000"
```

Файл `https://mta-sts.mansoni.ru/.well-known/mta-sts.txt`:

```
version: STSv1
mode: enforce
mx: mail.mansoni.ru
max_age: 604800
```

> MTA-STS говорит отправляющим серверам использовать TLS при доставке на наш домен. Размещается как static файл на HTTPS.

#### TLSRPT (RFC 8460)

```dns
_smtp._tls.mansoni.ru.  IN  TXT  "v=TLSRPTv1; rua=mailto:tls-reports@mansoni.ru"
```

> Получаем отчёты о TLS-проблемах от других серверов.

#### BIMI (опционально, Brand Indicators for Message Identification)

```dns
default._bimi.mansoni.ru.  IN  TXT  "v=BIMI1; l=https://mansoni.ru/.well-known/bimi/logo.svg; a=https://mansoni.ru/.well-known/bimi/cert.pem"
```

> Требует VMC-сертификат (Verified Mark Certificate). Показывает логотип бренда в Gmail.
> **Рекомендация:** реализовать на Phase 3, когда repitation установлена.

### 7.3 Полная DNS-зона (сводка)

```dns
; === mansoni.ru — Email DNS Records ===

; MX
@                       IN  MX   10  mail.mansoni.ru.

; A record for mail server
mail                    IN  A    YOUR_SERVER_IP

; SPF
@                       IN  TXT  "v=spf1 ip4:YOUR_SERVER_IP -all"

; DKIM
mail._domainkey         IN  TXT  "v=DKIM1; k=rsa; p=<PUBLIC_KEY>"

; DMARC
_dmarc                  IN  TXT  "v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc-rua@mansoni.ru; ruf=mailto:dmarc-ruf@mansoni.ru; adkim=s; aspf=s; pct=100; fo=1"

; MTA-STS
_mta-sts                IN  TXT  "v=STSv1; id=20260310T000000"

; TLSRPT
_smtp._tls              IN  TXT  "v=TLSRPTv1; rua=mailto:tls-reports@mansoni.ru"

; BIMI (optional, Phase 3)
; default._bimi          IN  TXT  "v=BIMI1; l=https://mansoni.ru/.well-known/bimi/logo.svg"
```

---

## 8. Deliverability Checklist

### 8.1 Authentication

| Проверка | Gmail | Yandex | Mail.ru | Outlook | Статус |
|----------|-------|--------|---------|---------|--------|
| SPF pass | ✅ Required | ✅ Required | ✅ Required | ✅ Required | ⬜ |
| DKIM pass | ✅ Required | ✅ Required | ✅ Required | ✅ Required | ⬜ |
| DMARC pass | ✅ Required | ✅ Recommended | ✅ Recommended | ✅ Required | ⬜ |
| PTR/rDNS match | ✅ Required | ✅ Required | ✅ Required | ✅ Required | ⬜ |
| MTA-STS | ✅ Bonus | ❓ Unknown | ❓ Unknown | ✅ Bonus | ⬜ |
| BIMI | ✅ Shows logo | ❌ Not supported | ❌ Not supported | ❌ Not supported | ⬜ |

### 8.2 Warm-up стратегия

> Новый IP без истории отправок будет автоматически throttled крупными провайдерами. Необходим постепенный warm-up.

| День | Объём/день | Целевые провайдеры | Замечания |
|------|-----------|-------------------|----------|
| 1-3 | 10-20 | Свои аккаунты | Тестовые письма на gmail.com, yandex.ru, mail.ru |
| 4-7 | 50-100 | Реальные пользователи | Только engagement-heavy (welcome, verification) |
| 8-14 | 200-500 | Все | Мониторить bounce rate |
| 15-21 | 500-1000 | Все | Проверить blacklists |
| 22-30 | 1000-5000 | Все | Стабильный объём |
| 30+ | По потребности | Все | Увеличивать не более 2x в неделю |

**Критерии прерывания warm-up:**
- Bounce rate > 5% → остановить, исследовать
- Spam complaint rate > 0.1% → остановить немедленно, проверить контент
- IP попал в blacklist → остановить, delist, разобраться в причине

### 8.3 IP Reputation

| Действие | Инструмент | Частота |
|----------|-----------|---------|
| Проверка IP в blacklists | MXToolbox, MultiRBL | Ежедневно (автоматически) |
| Google Postmaster Tools | postmaster.google.com | Регистрация при warm-up |
| Yandex Postmaster | postmaster.yandex.ru | Регистрация при warm-up |
| Mail.ru Postmaster | postmaster.mail.ru | Регистрация при warm-up |
| Microsoft SNDS | sendersupport.olc.protection.outlook.com | Регистрация при warm-up |
| Sender Score check | senderscore.org | Еженедельно |

### 8.4 Content Best Practices

| Правило | Описание |
|---------|---------|
| `List-Unsubscribe` header | Обязательно для bulk mail. RFC 8058 one-click unsubscribe. Gmail требует с 2024! |
| `List-Unsubscribe-Post` | `List-Unsubscribe-Post: List-Unsubscribe=One-Click` |
| Text/HTML multipart | Всегда отправлять и text, и HTML версию |
| Ratio текст/изображения | Минимум 60% текста, максимум 40% изображений |
| No URL shorteners | bit.ly, goo.gl — red flag для spam filters |
| Consistent `From` | Использовать постоянный from address |
| Valid `Reply-To` | Рабочий адрес для ответов |
| Subject line | Без CAPS LOCK, без чрезмерных emoji, без spam-слов |
| Unsubscribe link | В footer каждого маркетингового письма |
| Physical address | Для маркетинговых писем (CAN-SPAM, GDPR) |

### 8.5 Monitoring Blacklists

**Автоматическая проверка (cron job каждые 6 часов):**

```
Blacklists для мониторинга:
- zen.spamhaus.org (SBL, XBL, PBL)
- bl.spamcop.net
- b.barracudacentral.org
- dnsbl.sorbs.net
- cbl.abuseat.org
- dnsbl-1.uceprotect.net
- psbl.surriel.com
- db.wpbl.info
```

**Реагирование на listing:**

1. Немедленно остановить отправку с этого IP
2. Определить причину листинга (check Postfix logs)
3. Устранить причину (спам, open relay, compromised account)
4. Подать запрос на delisting
5. Мониторить delisting (может занять 24-72 часа)
6. Возобновить отправку после delisting

---

## 9. План внедрения — 3 фазы

### Phase 1 — MVP

**Цель:** Базовая отправка транзакционных писем через self-hosted инфраструктуру.

**Deliverables:**

- [ ] Docker Compose: email-router + Redis + Postfix + PostgreSQL
- [ ] JWT auth через Supabase JWKS (+ API key fallback)
- [ ] BullMQ очередь для асинхронной отправки
- [ ] PostgreSQL schema для email_messages, email_events
- [ ] Миграция in-memory store → PostgreSQL
- [ ] Idempotency key поддержка
- [ ] Health check: Redis + PostgreSQL + SMTP probe
- [ ] Базовый DKIM signing (OpenDKIM)
- [ ] SPF + DKIM + DMARC DNS записи (DMARC `p=none` для мониторинга)
- [ ] Let's Encrypt TLS для Postfix
- [ ] PTR/rDNS настройка
- [ ] Интеграционные тесты: отправка тестового письма → Gmail, Yandex, Mail.ru
- [ ] README с инструкцией запуска

**Риски:**

| Риск | Вероятность | Влияние | Митигация |
|------|------------|---------|-----------|
| IP в blacklist с первой отправки | Средняя | Высокое | Начать с warm-up, проверить IP перед стартом |
| DKIM misconfiguration | Высокая | Высокое | Тест через mail-tester.com до production |
| PostgreSQL migration breaks API | Средняя | Среднее | Сохранить backward-compatible API |
| Redis single point of failure | Средняя | Высокое | Fallback на синхронную отправку |

**Go/No-Go критерии:**

- ✅ Тестовое письмо доставлено в Inbox (не Spam) Gmail, Yandex, Mail.ru
- ✅ SPF pass, DKIM pass, DMARC pass (проверка через mail-tester.com, score >= 9/10)
- ✅ Health endpoint возвращает 200 с all dependencies OK
- ✅ Idempotency: повторный запрос с тем же ключом → не дублирует отправку
- ✅ PTR/rDNS resolves to mail.mansoni.ru

### Phase 2 — Resilience + Observability

**Цель:** Bounce processing, suppression list, полный monitoring, DMARC enforcement.

**Deliverables:**

- [ ] Bounce/DSN processing pipeline
- [ ] Suppression list (hard bounce, soft bounce threshold, complaints)
- [ ] Suppression check перед каждой отправкой
- [ ] Feedback loop registration (Gmail, Yandex, Mail.ru)
- [ ] Retry с exponential backoff (4xx codes)
- [ ] Dead-letter queue с replay API
- [ ] Circuit breaker для SMTP
- [ ] Prometheus exporter для email-router
- [ ] Grafana dashboards (5 штук, см. раздел 4.8)
- [ ] Loki + Promtail для централизованных логов
- [ ] Alert rules (bounce rate, DLQ, circuit breaker)
- [ ] DMARC policy upgrade: `p=none` → `p=quarantine` → `p=reject`
- [ ] Rspamd для anti-spam на входящие
- [ ] OpenDMARC для DMARC reports
- [ ] Blacklist monitoring (автоматический cron)
- [ ] Warm-up plan execution
- [ ] List-Unsubscribe header support
- [ ] Admin API: GET /dlq, POST /dlq/:id/replay
- [ ] Rate limiting per service_id

**Риски:**

| Риск | Вероятность | Влияние | Митигация |
|------|------------|---------|-----------|
| Bounce processing misparse DSN | Средняя | Среднее | Extensive parsing tests с реальными DSN samples |
| False positives в suppression | Низкая | Высокое | Soft bounce threshold = 3 за 7 дней (не 1) |
| Prometheus/Grafana resource overhead | Низкая | Низкое | Retention 15 дней. Отдельный Docker volume |
| DMARC reject breaks legitimate mail | Средняя | Высокое | Поэтапно: none → quarantine → reject с мониторингом reports |

**Go/No-Go критерии:**

- ✅ Bounce rate < 2% за последние 7 дней
- ✅ Suppression list корректно блокирует hard-bounced addresses
- ✅ Circuit breaker срабатывает при SMTP недоступности
- ✅ Grafana dashboard показывает реальные метрики
- ✅ DLQ replay успешно повторно отправляет письма
- ✅ DMARC aggregate reports приходят и разбираются
- ✅ IP не в blacklists

### Phase 3 — Scale + Compliance

**Цель:** Multi-tenant, GDPR compliance, backup/restore, нагрузочное тестирование.

**Deliverables:**

- [ ] Multi-tenant: service_accounts с изоляцией данных
- [ ] RBAC enforcement (app/service/admin roles)
- [ ] GDPR: retention policy (auto-delete email bodies через 90 дней)
- [ ] GDPR: право на удаление (DELETE /api/v1/gdpr/erasure)
- [ ] GDPR: PII шифрование at rest (AES-256 для email body в PostgreSQL)
- [ ] GDPR: export personal data (GET /api/v1/gdpr/export)
- [ ] PostgreSQL backup: automated daily pg_dump + WAL archiving
- [ ] Backup restore drill: documented & tested procedure
- [ ] Load testing: 100,000 emails/час на dedicated infra
- [ ] Horizontal scaling: multiple email-router instances + shared Redis
- [ ] MTA-STS + TLSRPT DNS records
- [ ] BIMI (если VMC сертификат получен)
- [ ] Scheduled sends: `send_at` field в API
- [ ] Webhook events: send status changes to external URL
- [ ] Email analytics: open tracking (pixel), click tracking (optional, GDPR-aware)
- [ ] Documentation: runbook для on-call

**Риски:**

| Риск | Вероятность | Влияние | Митигация |
|------|------------|---------|-----------|
| 100k/час требует серьёзное hardware | Средняя | Среднее | Load test на staging, vertical scaling Postfix |
| GDPR erasure breaks foreign keys | Средняя | Среднее | Soft delete + scheduled purge. Anonymize, not delete |
| Multi-tenant isolation leak | Низкая | Критическое | Тесты на изоляцию. service_id в WHERE clause всех queries |
| Backup restore takes too long | Средняя | Высокое | Practice restore drill. WAL для PITR < 1 hour RPO |

**Go/No-Go критерии:**

- ✅ Load test: 100,000 emails/час, p99 < 5 секунд, error rate < 0.1%
- ✅ GDPR erasure deletes all PII за < 72 часа
- ✅ Backup restore: RTO < 4 часа, RPO < 1 час
- ✅ Multi-tenant: service A не видит данные service B
- ✅ Security audit пройден (internal or external)
- ✅ Runbook документирован и протестирован on-call engineer-ом

---

## 10. GDPR и Data Handling

### 10.1 Retention Policy

| Данные | Retention | Действие по истечении |
|--------|----------|---------------------|
| Email body (html/text) | 90 дней | Удаление (NULL в БД) |
| Email metadata (to, from, subject) | 1 год | Анонимизация (SHA-256 hash) |
| Email events (статусы) | 2 года | Удаление |
| Suppression list | Бессрочно | Остаётся (необходимо для предотвращения повторной отправки) |
| Idempotency keys | 24 часа | Автоматическое удаление |
| Prometheus metrics | 15 дней | Автоматически (retention config) |
| Loki logs | 30 дней | Автоматически (retention config) |

**Автоматическая очистка (pg_cron):**

```sql
-- Ежедневно в 03:00 UTC
-- Шаг 1: Удалить тела писем старше 90 дней
UPDATE email_messages
SET html_body = NULL, text_body = NULL, template_data = NULL
WHERE created_at < NOW() - INTERVAL '90 days'
  AND html_body IS NOT NULL;

-- Шаг 2: Анонимизировать metadata старше 1 года
UPDATE email_messages
SET to_address = 'sha256:' || encode(sha256(to_address::bytea), 'hex'),
    from_address = 'sha256:' || encode(sha256(from_address::bytea), 'hex'),
    subject = '[redacted]'
WHERE created_at < NOW() - INTERVAL '1 year'
  AND to_address NOT LIKE 'sha256:%';

-- Шаг 3: Удалить events старше 2 лет
DELETE FROM email_events
WHERE created_at < NOW() - INTERVAL '2 years';

-- Шаг 4: Удалить expired idempotency keys
DELETE FROM idempotency_keys
WHERE expires_at < NOW();
```

### 10.2 Право на удаление (Right to Erasure)

**API:** `DELETE /api/v1/gdpr/erasure`

```json
{
  "email": "user@example.com",
  "reason": "user_request",
  "request_id": "GDPR-2026-001"
}
```

**Процедура:**

1. Получить запрос с верифицированным email
2. Найти все `email_messages` где `to_address = email`
3. Удалить тела писем (SET NULL)
4. Анонимизировать metadata (SHA-256 hash)
5. Записать audit event: `gdpr_erasure_completed`
6. Suppression list entry **сохраняется** (legitimate interest — предотвращение повторной отправки)
7. Вернуть подтверждение с request_id

**SLA:** Выполнение в течение 72 часов (GDPR требует до 30 дней, мы ставим 72ч).

### 10.3 Логирование без PII

**Принцип:** Логи не содержат PII в plain text.

| Поле | В логах | Пример |
|------|--------|--------|
| Email address | SHA-256 hash | `to_hash: "a3f2b8..."` |
| Subject | Не логируется | — |
| Body | Не логируется | — |
| IP address | Хранится 7 дней, затем anonymize | `ip: "1.2.3.4"` → `ip: "1.2.3.0/24"` |
| Template name | Логируется (не PII) | `template: "verification"` |
| Status | Логируется | `status: "sent"` |
| Message ID | Логируется | `messageId: "er-...@mansoni.ru"` |

### 10.4 Шифрование at rest

| Компонент | Шифрование | Метод |
|-----------|-----------|-------|
| PostgreSQL data | ✅ | LUKS full-disk encryption на VPS |
| PostgreSQL backup | ✅ | GPG encryption перед upload |
| Redis (persistent) | ✅ | LUKS (Redis AOF/RDB на encrypted volume) |
| Email body в БД | ✅ (Phase 3) | AES-256-GCM application-level encryption |
| Docker secrets | ✅ | Docker Swarm secrets или env file с chmod 600 |
| TLS certificates | ✅ | Let's Encrypt auto-renewal |

**Application-level encryption (Phase 3):**

```
Encrypt: AES-256-GCM(email_body, key_from_vault)
Store: base64(IV + ciphertext + auth_tag) в PostgreSQL
Decrypt: только при чтении через API (key rotation supported)
Key storage: отдельный secrets manager (HashiCorp Vault / SOPS)
```

---

## Appendix A: Docker Compose (Phase 1 Reference)

```yaml
# docker-compose.email.yml — Phase 1 MVP
version: '3.8'

services:
  email-router:
    build: ../../email-router
    ports:
      - "8090:8090"
    environment:
      - NODE_ENV=production
      - EMAIL_ROUTER_PORT=8090
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://emailuser:${PG_PASSWORD}@postgres:5432/emaildb
      - SUPABASE_JWKS_URL=${SUPABASE_JWKS_URL}
      - EMAIL_ROUTER_API_KEY=${EMAIL_ROUTER_API_KEY}
      - SMTP_HOST=postfix
      - SMTP_PORT=587
      - SMTP_USER=asset@mansoni.ru
      - SMTP_PASS=${SMTP_PASS}
      - SMTP_FROM=asset@mansoni.ru
      - MAIL_DOMAIN=mansoni.ru
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
      postfix:
        condition: service_started
    networks:
      - email-internal
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:8090/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3

  redis:
    image: redis:7.2-alpine
    command: >
      redis-server
      --appendonly yes
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 256mb
      --maxmemory-policy noeviction
    volumes:
      - redis-data:/data
    networks:
      - email-internal
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=emaildb
      - POSTGRES_USER=emailuser
      - POSTGRES_PASSWORD=${PG_PASSWORD}
    volumes:
      - pg-data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - email-internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U emailuser -d emaildb"]
      interval: 10s
      timeout: 5s
      retries: 3
    restart: unless-stopped

  postfix:
    image: boky/postfix:latest
    environment:
      - HOSTNAME=mail.mansoni.ru
      - RELAYHOST=
      - ALLOWED_SENDER_DOMAINS=mansoni.ru
      - POSTFIX_myhostname=mail.mansoni.ru
      - POSTFIX_mydomain=mansoni.ru
      - POSTFIX_smtpd_milters=inet:opendkim:8891
      - POSTFIX_non_smtpd_milters=inet:opendkim:8891
      - POSTFIX_milter_default_action=accept
    ports:
      - "25:25"
      - "587:587"
    volumes:
      - postfix-data:/var/spool/postfix
      - ./certs:/etc/letsencrypt:ro
    networks:
      - email-internal
    restart: unless-stopped

  opendkim:
    image: instrumentisto/opendkim:latest
    volumes:
      - ./dkim-keys:/etc/opendkim/keys:ro
      - ./opendkim.conf:/etc/opendkim/opendkim.conf:ro
    networks:
      - email-internal
    restart: unless-stopped

volumes:
  redis-data:
  pg-data:
  postfix-data:

networks:
  email-internal:
    driver: bridge
```

---

## Appendix B: Prometheus Scrape Config

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: email-router
    static_configs:
      - targets: ['email-router:9091']
    metrics_path: /metrics

  - job_name: redis
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: postgres
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: postfix
    static_configs:
      - targets: ['postfix-exporter:9154']

  - job_name: rspamd
    static_configs:
      - targets: ['rspamd:11334']
    metrics_path: /metrics
```

---

## Appendix C: Ссылки на RFC

| RFC | Тема | Применение |
|-----|------|-----------|
| RFC 5321 | SMTP | Основной протокол отправки |
| RFC 5322 | Email format | Формат заголовков и body |
| RFC 6376 | DKIM | Подпись и верификация |
| RFC 7208 | SPF | Авторизация отправителей |
| RFC 7489 | DMARC | Политика аутентификации |
| RFC 8058 | One-Click Unsubscribe | List-Unsubscribe-Post |
| RFC 8460 | TLSRPT | Отчёты о TLS-проблемах |
| RFC 8461 | MTA-STS | Принудительный TLS |
| RFC 3464 | DSN | Формат bounce-уведомлений |
| RFC 5965 | ARF | Формат abuse/complaint отчётов |
| RFC 2047 | MIME encoded-word | UTF-8 в Subject |
