---
name: security-engineer
description: "Расширенный агент безопасности: dependency scanning, SAST, RLS verification tests, secrets management, CSP audit, CORS audit, auth flow security, rate limiting, input validation, OWASP Top 10. Use when: CVE, npm audit, dependency, XSS, SQL injection, CSRF, CSP, CORS, secrets, hardcoded key, JWT, refresh token, rate limit, input validation, OWASP, penetration, pentest."
argument-hint: "[scope: dependencies | sast | rls-tests | secrets | csp | cors | auth | rate-limit | owasp | full]"
user-invocable: true
---

# Security Engineer — Расширенный агент безопасности

Поверх security-audit: проактивная инженерия безопасности с автоматизированными проверками, генерацией тестов RLS-политик, аудитом зависимостей, CSP/CORS конфигурации и маппингом OWASP Top 10 на конкретный стек проекта.

## Принцип

> Security-audit НАХОДИТ проблемы. Security-engineer ПРЕДОТВРАЩАЕТ их: генерирует тесты политик, сканирует зависимости, создаёт чеклисты валидации, конфигурирует заголовки безопасности. Каждая проверка — автоматизируемая.

---

## 1. Dependency Scanning

### 1.1. Протокол сканирования

```bash
# Шаг 1: npm audit
npm audit --json > audit-report.json

# Шаг 2: Анализ severity
# critical — исправить НЕМЕДЛЕННО (pre-auth RCE, data breach)
# high — исправить в текущем спринте
# moderate — запланировать
# low — оценить risk/effort

# Шаг 3: Проверить transitive dependencies
npm ls --all | grep {vulnerable-package}

# Шаг 4: Fix
npm audit fix              # auto-fix compatible updates
npm audit fix --force      # ОПАСНО: может сломать — тестировать!
# Или: добавить override в package.json
```

### 1.2. Чеклист зависимостей

```
☐ npm audit — 0 critical, 0 high
☐ Проверить дату последнего обновления каждой зависимости (> 2 года = риск)
☐ Проверить: нет ли deprecated packages
☐ Проверить: нет ли packages с known supply chain attacks
☐ Lockfile (package-lock.json / bun.lockb) — закомичен в репо
☐ Нет wildcard версий (^, ~, *) для security-sensitive пакетов
☐ supabase-js, @tanstack/react-query — на последней stable
☐ Deno Edge Functions: pinned versions в import URLs
```

### 1.3. Known CVE паттерны для нашего стека

```
| Пакет | CVE паттерн | Проверка |
|-------|-------------|----------|
| @supabase/supabase-js | Auth bypass | Проверить версию ≥ 2.45 |
| react | XSS через dangerouslySetInnerHTML | grep -r "dangerouslySetInnerHTML" src/ |
| vite | Dev server arbitrary file read | Проверить версию ≥ 5.4 |
| @radix-ui/* | Focus trap bypass | Проверить aria-modal на dialogs |
| capacitor | Deep link injection | Проверить intent-filter specificity |
| mediasoup-client | SRTP key leak | Проверить E2EE key exchange |
```

---

## 2. SAST: Static Application Security Testing

### 2.1. XSS Prevention в React + Supabase

```typescript
// АВТОМАТИЧЕСКИЙ ПОИСК:

// 🔴 CRITICAL: dangerouslySetInnerHTML без sanitize
// grep -rn "dangerouslySetInnerHTML" src/
// Если найдено → проверить: есть ли DOMPurify.sanitize() перед вставкой
// FIX: import DOMPurify from 'dompurify';
//      <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />

// 🔴 CRITICAL: eval / new Function с пользовательским вводом
// grep -rn "eval\|new Function\|setTimeout.*string" src/

// 🟠 HIGH: .innerHTML с пользовательскими данными  
// grep -rn "\.innerHTML" src/

// 🟡 MEDIUM: URL-инъекция через href
// Паттерн: <a href={userInput}> без валидации протокола
// FIX: проверить url.startsWith('https://') || url.startsWith('http://')
// BLOCK: javascript:, data:, vbscript:

// 🟡 MEDIUM: Open redirect
// Паттерн: window.location = userInput || navigate(userInput)
// FIX: whitelist allowed redirect domains

// ✅ SAFE в React: {userInput} в JSX — автоматически экранируется
```

### 2.2. SQL Injection в Supabase

```typescript
// 🔴 CRITICAL: конкатенация в RPC/query
// ПЛОХО:
supabase.rpc('search', { query: userInput }); // safe только если RPC использует $1
// Внутри PostgreSQL function:
// ПЛОХО: EXECUTE 'SELECT * FROM t WHERE name = ''' || p_name || '''';
// ХОРОШО: EXECUTE 'SELECT * FROM t WHERE name = $1' USING p_name;

// ✅ SAFE: supabase.from('table').select().eq('field', userInput)
// .eq(), .like(), .in() — всегда parameterized

// 🟠 HIGH: .textSearch() без sanitize
// Проверить: пользовательский ввод не содержит спецсимволы tsquery
// FIX: escape перед передачей: input.replace(/[&|!():*]/g, ' ')

// 🟠 HIGH: .rpc() с SECURITY DEFINER
// Проверить: внутри функции ЕСТЬ проверка auth.uid()
```

### 2.3. CSRF Protection

```
// Supabase использует JWT в Authorization header → CSRF невозможен
// (CSRF атакует только cookie-based auth)

// НО: если есть cookie-based endpoints (кастомные):
// ☐ SameSite=Strict на всех cookies
// ☐ CSRF token для state-changing requests
// ☐ Проверка Origin/Referer header
```

---

## 3. RLS Policy Verification Tests

### 3.1. Шаблон теста RLS

```sql
-- Файл: scripts/test-rls/{table_name}_rls_test.sql

-- =============================================================================
-- Тест RLS для таблицы: {table_name}
-- =============================================================================

-- Setup: создать тестовых пользователей
-- (выполнять от service_role)

BEGIN;

-- Тест 1: Пользователь видит только свои записи
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "user-a-uuid"}';

-- Должно вернуть ТОЛЬКО записи user_a
SELECT count(*) as own_count FROM {table_name};
-- ASSERT: own_count = {expected}

-- Тест 2: Пользователь НЕ видит чужие записи
SET LOCAL request.jwt.claims = '{"sub": "user-b-uuid"}';
SELECT count(*) as other_count FROM {table_name} 
  WHERE user_id = 'user-a-uuid';
-- ASSERT: other_count = 0

-- Тест 3: INSERT проверяет user_id = auth.uid()
SET LOCAL request.jwt.claims = '{"sub": "user-a-uuid"}';
-- Должно упасть:
INSERT INTO {table_name} (user_id, ...) VALUES ('user-b-uuid', ...);
-- ASSERT: ERROR "row violates row-level security policy"

-- Тест 4: UPDATE только своих записей
UPDATE {table_name} SET ... WHERE user_id = 'user-b-uuid';
-- ASSERT: 0 rows updated

-- Тест 5: DELETE только своих записей
DELETE FROM {table_name} WHERE user_id = 'user-b-uuid';
-- ASSERT: 0 rows deleted

-- Тест 6: Неавторизованный пользователь — 0 доступа
SET LOCAL role = 'anon';
SELECT count(*) FROM {table_name};
-- ASSERT: 0 (если таблица не публичная)

ROLLBACK;
```

### 3.2. Генерация тестов

```
Протокол:
1. Получить список ВСЕХ таблиц: SELECT tablename FROM pg_tables WHERE schemaname = 'public'
2. Для каждой таблицы:
   a. Проверить: ALTER TABLE ... ENABLE ROW LEVEL SECURITY
   b. Получить все политики: SELECT * FROM pg_policies WHERE tablename = '{t}'
   c. Сгенерировать тесты по шаблону выше
   d. Специальные тесты для таблиц с channel_members, team_members и т.д.
3. Записать в scripts/test-rls/
```

### 3.3. Специальные проверки

```sql
-- Проверить channel isolation:
-- Пользователь A (member канала 1) НЕ видит сообщения канала 2
SET LOCAL request.jwt.claims = '{"sub": "user-a-uuid"}';
SELECT count(*) FROM messages WHERE channel_id = 'channel-2-uuid';
-- ASSERT: 0

-- Проверить admin escalation:
-- Обычный member НЕ может менять роли
UPDATE channel_members SET role = 'admin' WHERE user_id = 'victim-uuid';
-- ASSERT: 0 rows updated (или policy violation)

-- Проверить service_role bypass:
-- service_role МОЖЕТ обходить RLS (для Edge Functions)
-- Проверить: НИКАКОЙ клиентский код не использует service_role key
```

---

## 4. Secrets Management

### 4.1. Поиск захардкоженных секретов

```bash
# Паттерны для поиска:
# 🔴 API keys:
grep -rn "sk_live\|sk_test\|pk_live\|pk_test" src/ supabase/
grep -rn "AAAA[A-Za-z0-9_-]{7,}:[A-Za-z0-9_-]{140,}" src/  # FCM key
grep -rn "ghp_[A-Za-z0-9]{36}" src/  # GitHub token
grep -rn "eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\." src/  # JWT

# 🔴 Supabase service_role key на клиенте:
grep -rn "service_role" src/
# ДОЛЖНО быть 0 результатов!

# 🟠 Passwords:
grep -rn "password\s*[:=]\s*['\"]" src/ --include="*.ts" --include="*.tsx"

# 🟡 Private keys:
grep -rn "BEGIN (RSA |EC )?PRIVATE KEY" src/
```

### 4.2. Правильное хранение

```
| Секрет | Где хранить | Доступ |
|--------|-------------|--------|
| SUPABASE_URL | .env (VITE_) | Клиент (публичный) |
| SUPABASE_ANON_KEY | .env (VITE_) | Клиент (публичный) |
| SUPABASE_SERVICE_ROLE | .env (НЕ VITE_) | Только Edge Functions |
| JWT_SECRET | Supabase Dashboard | Только server-side |
| TURN_SECRET | Server env | Только SFU server |
| SMTP_PASSWORD | Server env | Только email-router |
| FCM_SERVER_KEY | Supabase secrets | Только Edge Functions |

Правила:
✅ VITE_ prefix = доступно в клиентском bundle (только публичные!)
✅ Supabase Edge: Deno.env.get() — из secrets (supabase secrets set)
✅ Node.js services: process.env из .env (НЕ коммитить .env!)
❌ НИКОГДА: service_role key в клиентском коде
❌ НИКОГДА: пароли в git history
```

### 4.3. .gitignore проверка

```
☐ .env в .gitignore
☐ .env.local в .gitignore
☐ *.pem, *.key в .gitignore
☐ Проверить git log -- .env (не было ли случайного коммита)
☐ Supabase: supabase/.env — НЕ коммитить
```

---

## 5. CSP Headers Audit

### 5.1. Рекомендуемый CSP

```html
<!-- Для Supabase + React SPA: -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://*.supabase.co;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob: https://*.supabase.co;
  media-src 'self' blob: https://*.supabase.co;
  connect-src 'self' 
    https://*.supabase.co wss://*.supabase.co 
    https://{sfu-host} wss://{sfu-host}
    https://{turn-server};
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
">
```

### 5.2. CSP чеклист

```
☐ Нет 'unsafe-eval' (блокирует eval, new Function)
☐ 'unsafe-inline' для style — приемлемо (Tailwind JIT)
☐ connect-src: только известные домены (Supabase, SFU, TURN)
☐ frame-src: 'none' (если нет iframe-ов)
☐ object-src: 'none' (блокирует Flash, Java applets)
☐ base-uri: 'self' (предотвращает base tag injection)
☐ form-action: 'self' (предотвращает form hijacking)
☐ report-uri настроен для мониторинга нарушений
```

---

## 6. CORS Configuration Audit

### 6.1. Edge Functions CORS

```typescript
// _shared/cors.ts — текущая конфигурация
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',   // ⚠️ ПРОВЕРИТЬ
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// 🟠 ПРОБЛЕМА: '*' для sensitive endpoints
// FIX для production:
const ALLOWED_ORIGINS = [
  'https://your-domain.com',
  'https://www.your-domain.com',
  'capacitor://localhost',      // Capacitor Android
  'http://localhost',           // Capacitor Android webview
  'http://localhost:8080',      // Dev server (только в dev!)
];

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.includes(origin || '');
  return {
    'Access-Control-Allow-Origin': allowed ? origin! : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Vary': 'Origin',
  };
}
```

### 6.2. CORS чеклист

```
☐ Production Edge Functions: НЕ '*', а whitelist origins
☐ Credentials: если используются cookies, нужен explicit origin (не *)
☐ Methods: только нужные (POST, GET — не DELETE/PUT если не нужны)
☐ Headers: только нужные (не 'Access-Control-Allow-Headers: *')
☐ Preflight: OPTIONS handler на КАЖДОМ endpoint
☐ Vary: Origin header — если origin динамический
☐ Dev vs Prod: localhost разрешён ТОЛЬКО в development
```

---

## 7. Auth Flow Security

### 7.1. Чеклист JWT

```
☐ JWT подписан сервером (Supabase Auth → HS256/RS256)
☐ exp (expiration) проверяется: default 1h для access token
☐ Refresh token: rotation enabled (каждый refresh = новый token pair)
☐ Refresh token хранится в httpOnly cookie ИЛИ secure storage (не localStorage!)
☐ При logout: revoke refresh token server-side
☐ При password change: invalidate ALL sessions
☐ JWT payload не содержит sensitive data (password, full address)
```

### 7.2. Session Management

```
☐ Supabase onAuthStateChange: обработка SIGNED_OUT event
☐ Auto-refresh: supabase-js делает это автоматически
☐ Multi-tab: auth state синхронизирован через BroadcastChannel
☐ Multi-account: токены изолированы (разные storage keys)
☐ Session timeout: настроен в Supabase Dashboard (рекомендация: 7 дней)
☐ Device management: пользователь видит и может отозвать сессии
```

### 7.3. OTP Security

```
☐ Rate limit: max 3 OTP запроса в 5 минут на номер
☐ OTP brute-force: max 5 попыток ввода, затем cooldown 10 минут
☐ OTP expiry: 5 минут
☐ OTP не логируется (ни в Supabase logs, ни в Edge Function)
☐ OTP delivery: проверить что SMS действительно отправляется
```

---

## 8. Rate Limiting Audit

### 8.1. Рекомендуемые лимиты

```
| Endpoint | Лимит | Окно | Penalty |
|----------|-------|------|---------|
| Auth: sign-in | 5 req | 1 min | 429 + cooldown 5 min |
| Auth: OTP send | 3 req | 5 min | 429 + cooldown 10 min |
| Auth: OTP verify | 5 req | 5 min | 429 + lock 30 min |
| Messages: send | 30 msg | 1 min | 429 + queue |
| Media: upload | 10 files | 1 min | 429 |
| Search | 20 req | 1 min | 429 + backoff |
| Edge Functions (general) | 100 req | 1 min | 429 |
| API (read) | 300 req | 1 min | 429 |
| Realtime: subscribe | 50 channels | — | Reject |
| Calls: create | 5 req | 5 min | 429 |
```

### 8.2. Реализация в Edge Functions

```typescript
// Простой in-memory rate limiter (для Edge Functions):
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(userId: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }
  
  if (entry.count >= maxRequests) {
    return false; // rate limited
  }
  
  entry.count++;
  return true; // allowed
}

// В handler:
if (!rateLimit(user.id, 30, 60_000)) {
  return new Response(
    JSON.stringify({ error: 'Too many requests' }),
    { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } }
  );
}
```

---

## 9. Input Validation Checklist

### 9.1. Клиентская валидация (UX)

```typescript
// Zod schema для каждой формы:
import { z } from "zod";

const messageSchema = z.object({
  content: z.string().min(1).max(4096),           // Как в Telegram
  channel_id: z.string().uuid(),
  reply_to: z.string().uuid().optional(),
  type: z.enum(["text", "image", "voice", "video", "sticker", "document"]),
});

const profileSchema = z.object({
  display_name: z.string().min(1).max(64).regex(/^[^<>&"']*$/), // No HTML
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  bio: z.string().max(500).optional(),
  avatar_url: z.string().url().optional(),
});
```

### 9.2. Серверная валидация (Security)

```typescript
// В КАЖДОЙ Edge Function:
// 1. Проверить Content-Type
if (req.headers.get('content-type') !== 'application/json') {
  return new Response('Invalid Content-Type', { status: 415 });
}

// 2. Проверить размер body
const body = await req.text();
if (body.length > 1_000_000) { // 1MB max
  return new Response('Payload too large', { status: 413 });
}

// 3. Parse JSON безопасно
let parsed;
try { parsed = JSON.parse(body); } catch { return badRequest(); }

// 4. Validate с тем же Zod schema
const result = messageSchema.safeParse(parsed);
if (!result.success) {
  return new Response(JSON.stringify({ error: result.error.flatten() }), { status: 400 });
}

// 5. Sanitize HTML (если контент может содержать HTML)
// import DOMPurify from 'dompurify'; — НЕ доступен в Deno
// На сервере: strip tags вручную или использовать sanitize-html
```

---

## 10. OWASP Top 10 Маппинг

```
| # | OWASP | Наш стек | Статус | Митигация |
|---|-------|----------|--------|-----------|
| A01 | Broken Access Control | RLS policies | ☐ | RLS на каждой таблице, тесты |
| A02 | Cryptographic Failures | E2EE, TLS | ☐ | HTTPS only, E2EE для чатов |
| A03 | Injection | SQL, XSS | ☐ | Parameterized queries, React auto-escape |
| A04 | Insecure Design | Architecture | ☐ | Threat modeling, ADR |
| A05 | Security Misconfiguration | CORS, CSP | ☐ | CORS whitelist, CSP headers |
| A06 | Vulnerable Components | npm deps | ☐ | npm audit, lockfile |
| A07 | Auth Failures | JWT, OTP | ☐ | Rate limiting, token rotation |
| A08 | Data Integrity Failures | Updates | ☐ | Lockfile, code review |
| A09 | Logging & Monitoring | Logs | ☐ | Structured logging, no PII |
| A10 | SSRF | Edge Functions | ☐ | URL whitelist, no user-controlled URLs |
```

---

## 11. Workflow

### Фаза 1: Dependency scan
1. `npm audit` — зафиксировать baseline
2. Проверить transitive deps
3. План обновлений critical/high

### Фаза 2: SAST scan
1. grep по паттернам из секции 2
2. Для каждой находки: classify severity + mitigation
3. Запись в отчёт

### Фаза 3: RLS tests
1. Список всех таблиц
2. Генерация тестов по шаблону
3. Выполнение (от service_role)
4. Зафиксировать PASS/FAIL

### Фаза 4: Secrets audit
1. grep по паттернам из секции 4
2. Проверить .gitignore
3. Проверить git history

### Фаза 5: Headers & CORS
1. Проверить CSP
2. Проверить CORS на каждом Edge Function
3. Рекомендации по hardening

### Фаза 6: Отчёт
1. OWASP mapping (секция 10)
2. Severity-sorted findings
3. Action plan с конкретными fix-ами

---

## Маршрутизация в оркестраторе

**Триггеры**: CVE, npm audit, dependency scan, XSS, SQL injection, CSRF, CSP, CORS, secrets, API key, hardcoded, JWT, refresh token, session, rate limit, brute force, input validation, OWASP, pentest, безопасность, уязвимость, vulnerability, RLS тест, policy test

**Агенты**:
- `review` — при аудите безопасности
- `codesmith` — при реализации fix-ов и тестов
- `debug` — при расследовании auth/security issues
