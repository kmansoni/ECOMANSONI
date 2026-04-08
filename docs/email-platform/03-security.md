# 03 — Безопасность Email-платформы

## Содержание

- [3.1 STRIDE Threat Model](#31-stride-threat-model)
- [3.2 Security Hardening Checklist](#32-security-hardening-checklist)
- [3.3 Защита от abuse](#33-защита-от-abuse)
- [3.4 CORS / CSRF / SSRF Hardening](#34-cors--csrf--ssrf-hardening)
- [3.5 Plan ротации секретов](#35-plan-ротации-секретов)
- [3.6 Аудит и мониторинг безопасности](#36-аудит-и-мониторинг-безопасности)

---

## 3.1 STRIDE Threat Model

### Контекст

Область применения: `email-router` API, Postfix SMTP relay, PostgreSQL, Redis, OpenDKIM.

### Таблица угроз STRIDE

| # | Угроза | Категория STRIDE | Компонент | Вектор атаки | Митигация | Статус |
|---|---|---|---|---|---|---|
| T1 | Поддельные JWT токены | Spoofing | API gateway | Форжинг токена, перехват | JWKS verification, RS256, token expiry 1h | ✅ |
| T2 | Модификация email content в transit | Tampering | Postfix → remote | MITM, подмена контента | DKIM signing, TLS SMTP (STARTTLS) | ✅ |
| T3 | Отправка от чужого домена (From forgery) | Spoofing | email-router | Поставить From: admin@bank.com | SPF hard fail, DMARC p=reject, From domain validation | ✅ |
| T4 | Отказ от факта отправки | Repudiation | API + PostgreSQL | Оспаривание отправки письма | Append-only audit log, DKIM signature как доказательство | ✅ |
| T5 | Утечка PII (email адреса, имена) из логов | Information Disclosure | Pino logger | Логирование req/res body | PII redaction middleware, маскировка email в логах | ✅ |
| T6 | DDoS на API endpoint | Denial of Service | email-router | Flood запросов | IP rate limiting (100 req/min), tenant rate limiting | ✅ |
| T7 | Queue flooding (bulk spam) | Denial of Service | BullMQ/Redis | Массовая очередь задач | Max queue size per tenant, backpressure | ✅ |
| T8 | Повышение привилегий app → admin | Elevation of Privilege | RBAC middleware | JWT role manipulation | Строгая проверка role claim, RBAC (app/service/admin) | ✅ |
| T9 | SQL injection | Tampering | PostgreSQL | Malicious input | Parameterized queries (pg driver), Zod validation | ✅ |
| T10 | Brute force admin endpoints | Spoofing | /email/admin/* | Перебор JWT токенов | IP allowlist для /admin/*, rate limiting, fail2ban | ✅ |
| T11 | Open relay (relay spam) | Tampering | Postfix | Использовать как spam relay | mynetworks = loopback only, smtpd_relay_restrictions | ✅ |
| T12 | Redis key poisoning | Tampering | Redis/BullMQ | Injected malicious job | Redis auth, network isolation, job schema validation | ✅ |
| T13 | DKIM private key exposure | Information Disclosure | OpenDKIM | Чтение файла ключа | Encryption at rest (EMAIL_ENCRYPTION_KEY), Docker secrets | ✅ |
| T14 | Secrets в переменных окружения | Information Disclosure | Docker | docker inspect, env leak | Vault / Docker secrets, .env не в git | ⚠️ |
| T15 | Container escape | Elevation of Privilege | Docker | Уязвимость контейнера | Non-root user, read-only filesystem, seccomp profile | ⚠️ |

**Статус:** ✅ Реализовано | ⚠️ Частично | ❌ Не реализовано

---

## 3.2 Security Hardening Checklist

### Аутентификация и авторизация

- [x] **JWT verification через JWKS** — публичный ключ получается из Supabase JWKS endpoint, не хранится статически
- [x] **Algorithm pinning** — только RS256, HS256 отклоняется
- [x] **Token expiry** — access token 1 час, refresh token 7 дней
- [x] **RBAC** — роли: `app` (отправка писем), `service` (статистика), `admin` (управление)
- [x] **IP allowlist для /admin/*** — только из сети 10.0.0.0/8 или через VPN

### Сетевая безопасность

- [x] **Helmet headers** — X-Content-Type-Options, X-Frame-Options, HSTS, CSP
- [x] **CORS** — whitelist origins (только mansoni.ru и localhost для dev)
- [x] **Rate limiting** — 100 req/min per IP, 1000 req/min per tenant
- [x] **Network isolation** — Docker networks: `email-internal` (только inter-service), `email-public` (только email-router)
- [x] **Postfix relay restriction** — mynetworks = loopback only

### Данные и шифрование

- [x] **TLS для SMTP** — STARTTLS обязателен (smtpd_tls_security_level=encrypt)
- [x] **DKIM** — RSA-2048 подпись всех исходящих писем
- [x] **Encryption at rest** — DKIM private keys зашифрованы с EMAIL_ENCRYPTION_KEY
- [x] **PII redaction в логах** — email адреса маскируются: `u***@domain.com`
- [x] **Input validation** — Zod schemas для всех входящих данных
- [ ] **Database encryption** — PostgreSQL tablespace encryption (TODO Phase 3)

### Конфигурация Docker

- [x] **Non-root user** — все контейнеры запускаются как `node:1000`
- [x] **Read-only filesystem** — монтирование с `:ro` где возможно
- [x] **No privileged** — `privileged: false`
- [ ] **Seccomp profile** — ограничение системных вызовов (TODO)
- [ ] **AppArmor/SELinux** — MAC политики (TODO)

### Secret management

- [x] **Secrets не в git** — `.env` в `.gitignore`, только `.env.example`
- [x] **Strong passwords** — минимум 32 символа (openssl rand -base64 32)
- [ ] **HashiCorp Vault** — централизованное хранение секретов (TODO Phase 3)

### Мониторинг безопасности

- [x] **Audit log** — append-only лог всех admin действий
- [x] **Failed auth logging** — логировать все 401/403 с IP
- [x] **Anomaly detection** — алерт при >10 failed auth за 1 минуту

---

## 3.3 Защита от abuse

### Suppression List

Автоматическое добавление в suppression list при:

| Событие | Действие | Период |
|---|---|---|
| Hard bounce (550) | Добавить навсегда | Permanent |
| Soft bounce (4xx) × 5 | Добавить на 24ч | Temporary |
| Unsubscribe | Добавить навсегда | Permanent |
| Spam complaint | Добавить навсегда | Permanent |

```bash
# Проверить suppression list
curl -s http://localhost:3100/email/admin/suppression?email=user@example.com \
  -H "Authorization: Bearer $ADMIN_JWT" | jq .

# Удалить из suppression list (с обоснованием)
curl -X DELETE http://localhost:3100/email/admin/suppression \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"email": "user@example.com", "reason": "User confirmed re-opt-in"}'
```

### Rate limits per tenant

```typescript
// Конфигурация в email-router
const tenantLimits = {
  free:       { perMinute: 10,  perHour: 100,    perDay: 500    },
  starter:    { perMinute: 50,  perHour: 1000,   perDay: 10000  },
  business:   { perMinute: 200, perHour: 5000,   perDay: 100000 },
  enterprise: { perMinute: 500, perHour: 20000,  perDay: 500000 },
};
```

### Content-type restrictions

Разрешены форматы:

```
Content-Type: text/plain
Content-Type: text/html
```

Запрещены вложения типов:
- `.exe`, `.bat`, `.cmd`, `.scr`, `.vbs`
- `.js`, `.ts` (исполняемые)
- Password-protected архивы

### Attachment limits

```
Максимальный размер одного вложения: 10 MB
Максимальный общий размер: 25 MB
Максимальное количество вложений: 10
```

### Domain verification для From

```bash
# Только разрешённые домены в From:
# Проверяется при отправке, если From domain ≠ mansoni.ru

# Добавить разрешённый домен
curl -X POST http://localhost:3100/email/admin/allowed-domains \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"domain": "partner.example.com", "tenantId": "tenant_123"}'
```

---

## 3.4 CORS / CSRF / SSRF Hardening

### CORS конфигурация

```typescript
// Пример CORS-конфигурации для services/email-router
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://mansoni.ru',
      'https://app.mansoni.ru',
      'https://admin.mansoni.ru',
      // Dev only:
      ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000'] : []),
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
};
```

### CSRF

Email API использует JWT Bearer token в заголовке `Authorization: Bearer <token>`.  
Cookie не используются → CSRF атаки невозможны (нет cookie для форжинга).

### SSRF hardening

Уязвимость SSRF возможна если API принимает URLs (например, для webhook callbacks или template URLs):

```typescript
// Пример утилиты validateUrl для services/email-router
import { URL } from 'url';
import { isPrivateIP } from 'private-ip';

const BLOCKED_HOSTS = [
  'localhost', '127.0.0.1', '0.0.0.0',
  '169.254.169.254',  // AWS metadata
  '100.64.0.0/10',    // CGNAT
];

export function validateWebhookUrl(rawUrl: string): void {
  const url = new URL(rawUrl);

  // Только HTTPS
  if (url.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS');
  }

  // Проверить что не внутренний IP
  if (isPrivateIP(url.hostname)) {
    throw new Error('Webhook URL cannot point to private IP');
  }

  // Проверить blocked hosts
  if (BLOCKED_HOSTS.some(h => url.hostname === h || url.hostname.endsWith(h))) {
    throw new Error('Webhook URL points to blocked host');
  }
}
```

---

## 3.5 Plan ротации секретов

| Секрет | Где используется | Ротация | Процедура | Downtime |
|---|---|---|---|---|
| `PG_PASSWORD` | email-router → PostgreSQL | Каждые 90 дней | `ALTER USER` + restart | Нет |
| `REDIS_PASSWORD` | email-router → Redis/BullMQ | Каждые 90 дней | `CONFIG SET requirepass` | Нет |
| `SUPABASE_JWT_SECRET` | JWT verification (JWKS) | Каждые 180 дней | Supabase Dashboard | Re-login |
| `EMAIL_ENCRYPTION_KEY` | DKIM key encryption | Каждые 365 дней | Миграция + restart | Нет |
| `DKIM private key` | OpenDKIM подпись | Каждые 365 дней | Новый selector + 48h | Нет |
| `GRAFANA_PASSWORD` | Grafana admin | Каждые 90 дней | Grafana UI | Нет |
| TLS сертификат | HTTPS, SMTP TLS | Каждые 90 дней | certbot renew (auto) | Нет |

### Процедура плановой ротации (ежеквартальная)

```bash
#!/bin/bash
# scripts/rotate-secrets-quarterly.sh

echo "=== Quarterly Secret Rotation ===" 
echo "Date: $(date)"

# 1. Ротация PG password
echo "[1/4] Rotating PostgreSQL password..."
NEW_PG_PASS=$(openssl rand -base64 32)
docker exec email-postgres psql -U emailuser -c \
  "ALTER USER emailuser PASSWORD '$NEW_PG_PASS';"
# Обновить .env.local вручную!
echo "  ⚠️  Update PG_PASSWORD in .env.local manually"

# 2. Ротация Redis password
echo "[2/4] Rotating Redis password..."
NEW_REDIS_PASS=$(openssl rand -base64 32)
docker exec email-redis redis-cli CONFIG SET requirepass "$NEW_REDIS_PASS"
echo "  ⚠️  Update REDIS_PASSWORD in .env.local manually"

# 3. Перезапустить сервисы
echo "[3/4] Restarting services..."
docker restart email-router

# 4. Проверить работоспособность
echo "[4/4] Health check..."
sleep 5
curl -s http://localhost:3100/ready | jq .

echo "=== Rotation Complete ==="
echo "Remember to:"
echo "  - Update secrets in .env.local"
echo "  - Commit rotation date to docs/email-platform/secrets-log.md"
```

---

## 3.6 Аудит и мониторинг безопасности

### Security events для алертинга

```yaml
# prometheus/alerts-security.yml
groups:
  - name: security
    rules:
      - alert: HighAuthFailureRate
        expr: rate(http_requests_total{status="401"}[5m]) > 10
        annotations:
          summary: "Более 10 неудачных auth в минуту — возможная атака"

      - alert: AdminEndpointFromUnknownIP
        expr: increase(admin_requests_from_unknown_ip[5m]) > 0
        annotations:
          summary: "Запрос к /admin/* с неизвестного IP"

      - alert: SuspiciousEmailVolume
        expr: rate(email_sent_total[1m]) > 100
        annotations:
          summary: "Более 100 писем в минуту — возможный abuse"
```

### Security audit log

Все события безопасности записываются в PostgreSQL таблицу `security_audit_log`:

```sql
-- Структура таблицы
CREATE TABLE security_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,  -- 'auth_failure', 'admin_access', 'gdpr_erase', etc.
  actor_id    TEXT,           -- JWT sub
  actor_ip    INET,
  resource    TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Только INSERT, никаких UPDATE/DELETE (append-only)
REVOKE UPDATE, DELETE ON security_audit_log FROM emailuser;
```

### Регулярные security проверки

| Проверка | Частота | Инструмент |
|---|---|---|
| npm audit | При каждом PR | GitHub Actions |
| Docker image scan | При каждом build | Trivy |
| Blacklist check | Каждые 6 часов | mxtoolbox API |
| DMARC report review | Еженедельно | dmarc-report-analyzer |
| Penetration test | Ежегодно | Внешний подрядчик |
| Open relay test | После каждого Postfix релиза | telnet test |
