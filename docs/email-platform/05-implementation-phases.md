# 05 — План внедрения: 3 фазы

## Содержание

- [Сводная таблица фаз](#сводная-таблица-фаз)
- [Phase 1 — MVP Self-Hosted (48 часов)](#phase-1--mvp-self-hosted-48-часов)
- [Phase 2 — Resilience + Observability (2 недели)](#phase-2--resilience--observability-2-недели)
- [Phase 3 — Scale + Compliance (30 дней)](#phase-3--scale--compliance-30-дней)

---

## Сводная таблица фаз

| Фаза | Срок | Статус | Критерий готовности |
|---|---|---|---|
| Phase 1 — MVP | 48 ч | ✅ Ready | Health + test send + auth + not open relay |
| Phase 2 — Resilience | +2 нед | ⏳ In Progress | Bounces + monitoring + alerts + integr. tests |
| Phase 3 — Scale | +30 дн | ⏳ Pending | Load test + GDPR + backup + mail-tester ≥ 9/10 |

---

## Phase 1 — MVP Self-Hosted (48 часов)

### Цель

Минимально работоспособная email-платформа: отправить письмо с авторизацией через JWT, DKIM подписью, с базовой очередью.

### Deliverables

- [x] **Инфраструктура** — email-router + Redis + PostgreSQL + Postfix в Docker Compose
- [x] **Auth** — JWT verification через Supabase JWKS (RS256)
- [x] **API** — `POST /email/send` + `GET /email/status/:id` + `GET /health` + `GET /ready`
- [x] **Queue** — BullMQ очередь отправки с retry (3 попытки, exponential backoff)
- [x] **DKIM** — OpenDKIM подпись исходящих писем
- [x] **Tests** — базовые unit тесты для handlers (coverage ≥ 50%)

### Техническая реализация

```
email-router (Node.js/TS) → BullMQ worker → Postfix → Internet
                          → PostgreSQL (email_messages, email_events)
```

### Временно́й план Phase 1

| Час | Задача |
|---|---|
| 0–4 | Docker Compose: postgres + redis + postfix + opendkim |
| 4–8 | email-router: базовый Fastify + JWT middleware + конфиги |
| 8–12 | POST /email/send + BullMQ queue + SMTP worker |
| 12–16 | GET /email/status + health/ready endpoints |
| 16–20 | DKIM интеграция + тестовая отправка |
| 20–28 | Базовые unit тесты + исправление найденных ошибок |
| 28–40 | DNS настройка (SPF, DKIM, DMARC, MX, PTR) |
| 40–48 | Финальное тестирование + open relay проверка |

### Risks Phase 1

| Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|
| Postfix misconfiguration → open relay → IP blacklisted | Средняя | Критическое | Строгие mynetworks, тестировать open relay |
| DNS не настроен → email rejected | Высокая | Высокое | Сначала настроить DNS, потом слать |
| Port 25 заблокирован у хостинга | Средняя | Высокое | Уточнить у провайдера заранее |

### Go/No-Go Phase 1

Все пункты должны быть выполнены перед переходом к Phase 2:

- [ ] `GET /health` возвращает `{"status":"ok"}` HTTP 200
- [ ] `GET /ready` возвращает все checks `"ok"` HTTP 200
- [ ] Тестовое письмо доставлено на **Gmail** (реальный ящик)
- [ ] Тестовое письмо доставлено на **Yandex** (реальный ящик)
- [ ] SPF/DKIM/DMARC **pass** на mail-tester.com (score ≥ 7/10)
- [ ] Open relay тест **FAIL** (сервер НЕ является open relay)
- [ ] Unit тесты проходят (coverage ≥ 50%)
- [ ] Нет критических уязвимостей (`npm audit --audit-level=high`)

### Open relay тест (обязателен!)

```bash
# С ДРУГОГО сервера (не с вашего):
telnet YOUR_SERVER_IP 25
EHLO attacker.example.com
MAIL FROM: <fake@gmail.com>
RCPT TO: <victim@yahoo.com>
# Ожидаемый ответ: "554 Relay access denied" или "550 ..."
# НЕ "250 Ok" — это было бы open relay!
QUIT
```

---

## Phase 2 — Resilience + Observability (2 недели)

### Цель

Платформа устойчива к SMTP outages, bounce-и обрабатываются автоматически, команда видит метрики и получает алерты.

### Deliverables

- [ ] **Bounce processing** — webhook или polling для обработки bounce/complaint
- [ ] **Suppression list** — авто-добавление hard bounce и unsubscribe
- [ ] **Circuit breaker** — SMTP circuit breaker (открывается при 5 ошибках, восстановление через 60с)
- [ ] **Retry policy** — exponential backoff: 1м → 5м → 30м → 2ч → 8ч → 24ч
- [ ] **Prometheus metrics** — 15+ метрик (отправлено, доставлено, bounced, latency, queue size)
- [ ] **Grafana dashboards** — 3 dashboard (overview, delivery, queue health)
- [ ] **Loki** — централизованная агрегация логов
- [ ] **Alert rules** — 7 алертов (delivery drop, bounce rate, queue spike, IP blacklist, etc.)
- [ ] **Rate limiting** — per-IP и per-tenant ограничения
- [ ] **Templates** — MJML + Handlebars рендеринг шаблонов
- [ ] **Integration тесты** — E2E тесты для всех ключевых сценариев

### Неделя 1 — Resilience

| День | Задача |
|---|---|
| 1 | Circuit breaker + retry policy |
| 2 | Bounce processing webhook |
| 3 | Suppression list (CRUD API + auto-suppress) |
| 4 | Rate limiting (IP + tenant) |
| 5 | Templates (MJML рендеринг) |

### Неделя 2 — Observability

| День | Задача |
|---|---|
| 6–7 | Prometheus metrics (15+ метрик) |
| 8 | Grafana dashboards (3 шт.) |
| 9 | Loki log aggregation |
| 10 | Alert rules (7 алертов) + notification (Telegram) |
| 11–12 | Integration тесты |
| 13–14 | Testing, bug fixes, documentation |

### Prometheus метрики Phase 2

```typescript
// Обязательные метрики
email_sent_total{tenant, status}     // Counter
email_delivered_total{tenant}        // Counter
email_bounced_total{tenant, type}    // Counter (hard/soft)
email_queued_total                   // Counter
email_queue_size{queue}              // Gauge
email_send_duration_ms{quantile}     // Histogram (P50, P95, P99)
smtp_connections_active              // Gauge
smtp_circuit_breaker_state           // Gauge (0=closed, 1=open)
email_suppression_list_size          // Gauge
email_template_render_duration_ms    // Histogram
bullmq_workers_active                // Gauge
bullmq_job_failed_total              // Counter
```

### Alert rules Phase 2

```yaml
# 7 обязательных алертов
1. HighBounceRate     — bounce rate > 5% за 5 минут
2. DeliveryDrop       — доставка < 80% от нормы за 10 минут
3. QueueSizeHigh      — queue > 10 000 сообщений
4. SendLatencyHigh    — P95 latency > 10 секунд
5. CircuitBreakerOpen — circuit breaker разомкнут > 1 минуты
6. EmailRouterDown    — up{job="email-router"} == 0
7. HighAuthFailure    — > 10 401/403 ошибок в минуту
```

### Grafana dashboards Phase 2

```
Dashboard 1: Email Overview
  - Отправлено / Доставлено / Bounce rate (24h sparklines)
  - Queue size (realtime)
  - Circuit breaker state

Dashboard 2: Delivery Metrics
  - Send latency P50/P95/P99 (time series)
  - Bounce breakdown (hard/soft/complaint)
  - Delivery rate by recipient domain (top 10)

Dashboard 3: Queue Health
  - BullMQ waiting/active/completed/failed
  - SMTP connections pool utilization
  - Worker concurrency
```

### Risks Phase 2

| Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|
| High bounce rate → IP blacklist | Средняя | Критическое | Suppression list, monitoring, slow warm-up |
| Queue backlog при SMTP outage | Высокая | Высокое | Circuit breaker + delayed retry |
| Grafana/Prometheus OOM | Низкая | Среднее | Retention policy, downsampling |

### Go/No-Go Phase 2

- [ ] Bounce rate < 2% на тестовом объёме (1 000 писем)
- [ ] Circuit breaker корректно срабатывает при 5 ошибках SMTP подряд
- [ ] Circuit breaker восстанавливается автоматически через 60 секунд
- [ ] Grafana dashboard отображает все 12+ метрик
- [ ] Все 7 алертов срабатывают при тестовых условиях
- [ ] Все integration тесты проходят (100%)
- [ ] Подавить hard bounce адреса (suppression list работает)
- [ ] Rate limiting работает: 429 при превышении лимита
- [ ] Template рендеринг возвращает корректный HTML

---

## Phase 3 — Scale + Compliance (30 дней)

### Цель

Платформа готова к production нагрузке (100k писем/час), соответствует GDPR, backup/restore протестирован.

### Deliverables

- [ ] **Multi-tenant** — кастомные лимиты per tenant, изоляция данных
- [ ] **GDPR data erasure** — API + audit log + SLA 30 дней
- [ ] **Backup automation** — ежедневный backup PostgreSQL, тестирование restore
- [ ] **Load testing** — k6: 10k/час и 100k/час с SLO
- [ ] **Secret rotation** — автоматизированные скрипты ротации
- [ ] **MTA-STS** — enforce mode для защиты исходящей почты
- [ ] **DMARC p=reject** — полная защита от поддельных писем
- [ ] **IP warm-up** — IP полностью прогрет (14+ дней)
- [ ] **Documentation** — все 5 документов завершены

### Недели 1–2 — Scale

| День | Задача |
|---|---|
| 1–3 | Multi-tenant конфигурация (кастомные лимиты, routing) |
| 4–5 | k6 нагрузочные тесты (10k/час baseline) |
| 6–8 | Оптимизация узких мест (PostgreSQL, queue concurrency) |
| 9–10 | k6 тест 100k/час + доработки |

### Неделя 3 — Compliance

| День | Задача |
|---|---|
| 11–12 | GDPR data erasure API + audit log |
| 13–14 | Backup automation + restore тест |
| 15 | Secret rotation automation scripts |

### Неделя 4 — Production Readiness

| День | Задача |
|---|---|
| 16–17 | MTA-STS конфигурация + проверка |
| 18–19 | DMARC p=quarantine → p=reject (post warm-up) |
| 20–21 | IP warm-up финальная стадия |
| 22–25 | Финальное тестирование + документация |
| 26–30 | Buffer / bug fixes |

### k6 нагрузочные тесты

```javascript
// services/email-router/tests/load/k6-send.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  scenarios: {
    // Тест 1: 10k/час
    ramp_to_10k: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '2m', target: 3 },    // ramp up to ~10k/hr
        { duration: '10m', target: 3 },   // steady state
        { duration: '1m', target: 0 },    // ramp down
      ],
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<2000'],  // P95 < 2s
    'errors': ['rate<0.01'],              // Error rate < 1%
    'http_req_failed': ['rate<0.01'],
  },
};

export default function () {
  const payload = JSON.stringify({
    to: [{ email: `test+${__VU}@mansoni.ru` }],
    subject: `Load test ${Date.now()}`,
    text: 'k6 load test message',
  });

  const res = http.post(
    `${__ENV.BASE_URL}/email/send`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${__ENV.TEST_JWT}`,
      },
    }
  );

  const success = check(res, {
    'status is 202': (r) => r.status === 202,
    'has messageId': (r) => JSON.parse(r.body).messageId !== undefined,
  });

  errorRate.add(!success);
  sleep(0.1);
}
```

Запуск:

```bash
# 10k/час тест
k6 run \
  --env BASE_URL=http://localhost:3100 \
  --env TEST_JWT=$(make get-test-jwt) \
  services/email-router/tests/load/k6-send.js

# 100k/час тест (модифицировать target: 28)
k6 run \
  --env BASE_URL=http://localhost:3100 \
  --env TEST_JWT=$(make get-test-jwt) \
  --env SCENARIO=100k \
  services/email-router/tests/load/k6-send.js
```

### SLO (Service Level Objectives) Phase 3

| Метрика | 10k/час | 100k/час |
|---|---|---|
| Success rate | ≥ 99% | ≥ 98% |
| P95 latency | < 2s | < 5s |
| P99 latency | < 5s | < 10s |
| Error rate | < 1% | < 2% |
| Queue drain time | < 60s | < 120s |

### PostgreSQL оптимизация для scale

```sql
-- Партиционирование email_events по месяцам (для > 1M записей)
CREATE TABLE email_events (
  id UUID NOT NULL,
  message_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE TABLE email_events_2024_01 PARTITION OF email_events
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Индексы для частых запросов
CREATE INDEX CONCURRENTLY idx_email_messages_status_created 
  ON email_messages(status, created_at DESC);

CREATE INDEX CONCURRENTLY idx_email_events_message_id 
  ON email_events(message_id);
```

### Redis масштабирование

```bash
# Проверить использование памяти
docker exec email-redis redis-cli INFO memory | grep used_memory_human

# Настроить maxmemory policy (если памяти не хватает)
# В infra/email/redis/redis.conf:
maxmemory 2gb
maxmemory-policy allkeys-lru

# Для production с высокой нагрузкой — Redis Cluster или Sentinel
```

### Risks Phase 3

| Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|
| Scale bottleneck в PostgreSQL | Средняя | Высокое | Партиционирование email_events по времени |
| Redis memory exhaustion | Средняя | Критическое | maxmemory policy + мониторинг |
| IP warm-up медленнее ожидаемого | Средняя | Среднее | Мониторинг bounce rate, гибкий план |
| GDPR request в неудобный момент | Низкая | Среднее | Автоматизация API, SLA 30 дней |

### Go/No-Go Phase 3

- [ ] k6: 10k/час — P95 < 2s, success rate > 99%
- [ ] k6: 100k/час — P95 < 5s, success rate > 98%
- [ ] GDPR erasure API работает end-to-end (данные удалены, audit log создан)
- [ ] Backup restore протестирован (данные восстановлены корректно)
- [ ] MTA-STS в enforce mode, проверен через `mta-sts.mansoni.ru`
- [ ] DMARC p=reject без false positives (легитимная почта не блокируется)
- [ ] Mail-tester.com score ≥ 9/10
- [ ] Zero open relay findings
- [ ] IP warm-up завершён (bounce rate < 1% на 100k/день объёме)
- [ ] Вся документация (docs 01–05) актуальна и проверена

---

## Метрики успеха всего проекта

| Метрика | Baseline | Target |
|---|---|---|
| Delivery rate | N/A | ≥ 98% |
| Average latency | N/A | < 1s (P50) |
| Bounce rate | N/A | < 1% |
| Mail-tester score | N/A | ≥ 9/10 |
| Uptime | N/A | ≥ 99.9% |
| P95 latency (100k/hr) | N/A | < 5s |
| Time to first email | N/A | < 1 минуты |
