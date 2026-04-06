---
name: security-misconfiguration-audit
description: "Аудит OWASP A05 Security Misconfiguration: CORS wildcard, открытые debug endpoints, leaked secrets, verbose errors, missing security headers, exposed service_role. Use when: A05, misconfiguration, CORS, секреты в коде, security headers, конфигурация."
argument-hint: "[область: cors | headers | secrets | endpoints | all]"
user-invocable: true
---

# Security Misconfiguration — OWASP A05:2025

Неправильная конфигурация является второй по частоте уязвимостью. Часто легко обнаруживается автоматически.

---

## Проверка 1: Leaked Secrets

```bash
# В коде
grep -rn "SUPABASE_SERVICE_ROLE\|service_role" src/ --include="*.ts" --include="*.tsx"
grep -rn "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" src/  # base64 JWT hardcoded

# В .env.example (не должно быть реальных значений)
cat .env.example

# В git history (опасно!)
git log --all -p -- ".env" 2>/dev/null | grep "^+" | grep -v "^+++" | grep "="

# Hardcoded API keys
grep -rn "sk_live_\|sk_test_\|AIza\|AKIA\|xoxb-" src/ server/ services/
grep -rn "ghp_\|gho_\|github_pat_" src/ server/ services/
```

**Чеклист Secrets:**
- [ ] Нет реальных secrets в src/ или .env.example
- [ ] .env + .env.local в .gitignore
- [ ] Нет secrets в git history (если были — ротируйте!)
- [ ] VITE_* переменные: только PUBLIC данные (URL, anon key)
- [ ] service_role — только в Edge Functions через Deno.env.get()

---

## Проверка 2: CORS Misconfiguration

```bash
grep -rn "Access-Control-Allow-Origin" supabase/functions/ --include="*.ts"
grep -rn "'\\*'\|\"\\*\"" supabase/functions/ --include="*.ts"
grep -rn "corsHeaders\|CORS_ORIGIN\|allowedOrigins" supabase/functions/ --include="*.ts"
```

### Правильный CORS для Edge Functions

```typescript
// ✅ Whitelist origins
const ALLOWED_ORIGINS = [
  'https://your-app.com',
  'https://www.your-app.com',
  ...(Deno.env.get('DENO_ENV') === 'development' ? ['http://localhost:5173', 'http://localhost:8080'] : []),
];

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return headers;
}

// ❌ НЕ делать так (для endpoints с Credentials):
headers.set('Access-Control-Allow-Origin', '*');
headers.set('Access-Control-Allow-Credentials', 'true');  // НЕВАЛИДНО с *
```

**Чеклист CORS:**
- [ ] Нет `*` для auth-required endpoints
- [ ] Список разрешённых origins зафиксирован
- [ ] OPTIONS preflight обрабатывается
- [ ] `Vary: Origin` header при conditional CORS
- [ ] Нет `Allow-Credentials: true` + `Origin: *`

---

## Проверка 3: Security Headers

```bash
# Проверяем заголовки ответов Edge Functions
grep -rn "X-Frame\|X-Content-Type\|Referrer-Policy\|Feature-Policy\|Permissions-Policy" supabase/functions/ src/
grep -rn "Content-Security-Policy\|CSP" src/ public/ index.html
```

### Необходимые HTTP headers

```typescript
// В Edge Function ответах:
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  // CSP — сложнее, требует настройку под конкретные ресурсы
};
```

```html
<!-- В index.html для SPA -->
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co">
```

**Чеклист Headers:**
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY` или `SAMEORIGIN`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Strict-Transport-Security: max-age=31536000`
- [ ] `Content-Security-Policy` настроен
- [ ] Нет `Server: nginx/1.18` (не раскрывать версию)

---

## Проверка 4: Error Messages

```bash
grep -rn "catch.*{" supabase/functions/ --include="*.ts" -A 3 | grep "error\|stack\|message"
grep -rn "console\.error\|\.message\|\.stack" supabase/functions/ --include="*.ts"
```

### Verbose error pattern

```typescript
// ❌ ОПАСНО — стек трейс попадает к пользователю
return new Response(JSON.stringify({ error: error.message, stack: error.stack }), { status: 500 });

// ✅ БЕЗОПАСНО — только general message, детали в логах
console.error('Error in send-message:', error);  // для логов
return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
```

**Чеклист Error Messages:**
- [ ] Нет stack trace в API ответах
- [ ] Нет конкретных DB ошибок (table name, column) в ответах
- [ ] Одинаковое сообщение для "user not found" и "wrong password" (timing-safe)
- [ ] Production mode: детальные ошибки только в логах

---

## Проверка 5: Debug Endpoints & Features

```bash
grep -rn "\/debug\|\/admin\|\/test\|\/health" supabase/functions/ src/ --include="*.ts"
grep -rn "DEBUG\|DEVELOPMENT\|isDev\|process\.env\.NODE_ENV" supabase/functions/ --include="*.ts"
grep -rn "console\.log" supabase/functions/ --include="*.ts" | grep -v "console\.error\|console\.warn"
```

**Чеклист Debug:**
- [ ] Нет debug endpoints без auth в production
- [ ] `console.log` удалены или заменены на условный logger в Edge Functions
- [ ] Health check endpoints не раскрывают конфигурацию
- [ ] Нет тестовых аккаунтов в production (`test@test.com`:password)

---

## Проверка 6: Supabase конфигурация

```bash
# Проверить что в supabase/config.toml нет небезопасных настроек
cat supabase/config.toml 2>/dev/null | grep -i "disable\|enabled\|jwt"

# RLS включён?
grep -rn "ENABLE ROW LEVEL SECURITY" supabase/migrations/ --include="*.sql"
```

**Чеклист Supabase:**
- [ ] RLS включён на всех таблицах
- [ ] JWT secret достаточной длины (≥ 32 байта)
- [ ] Auth providers настроены корректно (нет анонимной регистрации)
- [ ] Email confirmation включена для регистрации
- [ ] Storage buckets: private по умолчанию

---

## Итоговая матрица

| Проверка | Статус | Severity | Действие |
|---|---|---|---|
| Leaked secrets | ✅/🔴 | CRITICAL | Ротировать ключи немедленно |
| CORS wildcard | ✅/🟡 | MEDIUM | Whitelist origins |
| Missing security headers | ✅/🟡 | MEDIUM | Добавить в Edge Functions |
| Verbose errors | ✅/🟠 | HIGH | Скрыть детали от клиента |
| Debug endpoints | ✅/🟡 | MEDIUM | Удалить или защитить |
| RLS не включён | ✅/🔴 | CRITICAL | Включить немедленно |
