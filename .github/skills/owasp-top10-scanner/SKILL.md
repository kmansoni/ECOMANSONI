---
name: owasp-top10-scanner
description: "Сканер OWASP Top 10:2025 для TypeScript + React + Supabase стека. Покрывает все 10 категорий с проверками специфичными для мессенджер-платформы. Use when: security audit, проверить OWASP, sканировать уязвимости, security review."
argument-hint: "[путь для сканирования или '*' для всего проекта]"
user-invocable: true
---

# OWASP Top 10 Scanner — Мессенджер на Supabase

Сканирует кодовую базу на все 10 категорий OWASP Top 10:2025, с проверками адаптированными под TypeScript + React + Supabase стек.

## Архитектура сканирования

Сканирование проходит в 3 слоя:
1. **Статический анализ** — чтение кода, grep по опасным паттернам
2. **Семантический анализ** — понимание контекста (не просто regex)
3. **Кросс-файловый анализ** — трассировка данных от input до sink

---

## A01:2025 — Broken Access Control

**Проверки в коде:**

```bash
# Ищем RLS-обходы
grep -r "service_role" src/  # не должно быть на клиенте
grep -r "supabase\.rpc\(" src/ --include="*.ts" --include="*.tsx"  # проверить SECURITY DEFINER
grep -r "\.from\(.*\)\.select\(" src/ | grep -v ".limit("  # нет .limit()
```

**SQL проверки:**
```sql
-- Таблицы без RLS
SELECT schemaname, tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename NOT IN (
  SELECT tablename FROM pg_policies
);
```

**Суть проблемы:** Пользователь А может прочитать/изменить данные пользователя Б.

**Чеклист:**
- [ ] RLS включён на КАЖДОЙ таблице с пользовательскими данными
- [ ] SELECT политики ограничивают данные auth.uid()
- [ ] INSERT проверяет user_id = auth.uid()
- [ ] UPDATE/DELETE: только владелец или admin
- [ ] Edge Functions проверяют auth на каждом endpoint
- [ ] Нет IDOR: IDs не угадываемы или не проверяются

---

## A02:2025 — Cryptographic Failures

**Проверки:**
```bash
grep -r "Math\.random()" src/  # не для security-критичных токенов
grep -r "MD5\|sha1\|SHA1\|DES" src/  # устаревшие алгоритмы
grep -rn "http://" src/ --include="*.ts" | grep -v "localhost"  # незашифрованные URLs
grep -r "localStorage\.setItem.*key\|privateKey\|secret" src/  # незашифрованные ключи
```

**Чеклист:**
- [ ] Приватные ключи E2EE не в localStorage/sessionStorage в plain text
- [ ] Только HTTPS/WSS соединения (кроме localhost)
- [ ] crypto.getRandomValues() для security токенов (не Math.random)
- [ ] Нет hardcoded IV/nonce в E2EE
- [ ] AES-GCM или XChaCha20-Poly1305 для шифрования (не AES-ECB)

---

## A03:2025 — Injection

**Проверки:**
```bash
grep -rn "dangerouslySetInnerHTML" src/ --include="*.tsx"
grep -rn "innerHTML\s*=" src/
grep -rn "eval(" src/
grep -rn "new Function(" src/
grep -rn "\.raw\(\`SELECT" src/  # raw SQL
```

**Чеклист:**
- [ ] Нет dangerouslySetInnerHTML без DOMPurify
- [ ] Нет innerHTML с пользовательскими данными
- [ ] Нет eval() с пользовательскими данными
- [ ] Суpabase .rpc() с параметрами (не string concat)
- [ ] Markdown рендеринг через safe-парсер (не raw HTML)

---

## A04:2025 — Insecure Design

**Проверки:**
```bash
grep -rn "supabase\.auth\.signIn\|sendOTP" src/ --include="*.ts"
# Проверить есть ли rate limiting рядом с авторизацией
grep -rn "maxSize\|MAX_FILE_SIZE" src/
```

**Чеклист:**
- [ ] Rate limiting на OTP: cooldown + attempt limit
- [ ] Rate limiting на login: lockout после N неудачных попыток
- [ ] Максимальный размер файла проверяется на сервере (не только клиент)
- [ ] Нет предсказуемых resource IDs (не sequential integers)
- [ ] Нет race condition в financial/critical operations

---

## A05:2025 — Security Misconfiguration

**Проверки:**
```bash
grep -rn "SUPABASE_SERVICE_ROLE\|SERVICE_ROLE_KEY" src/  # только .env
grep -rn "cors.*\*\|\"*\"" supabase/functions/  # CORS wildcard
cat .env.example | grep -v "^#" | grep -v "^$"  # нет секретов в example?
grep -rn "console\.log.*token\|console\.log.*key\|console\.log.*password" src/
```

**Чеклист:**
- [ ] Нет секретов в коде (только process.env / Deno.env.get)
- [ ] CORS в Edge Functions: не `*` для авторизованных endpoints
- [ ] Error responses не раскрывают stack trace
- [ ] Отладочные логи удалены из production кода
- [ ] `.env` в .gitignore (проверить что не закоммичен)

---

## A06:2025 — Vulnerable & Outdated Components

**Проверки:**
```bash
npm audit --audit-level=high
npx npm-check-updates --target minor
```

**Чеклист:**
- [ ] `npm audit` — 0 critical, 0 high severity
- [ ] Зависимости обновлены (< 6 месяцев назад для security-critical)
- [ ] Нет deprecated packages без альтернативы
- [ ] package-lock.json зафиксирован

---

## A07:2025 — Identification & Authentication Failures

**Проверки:**
```bash
grep -rn "supabase\.auth\.getUser\|jwt\|token" supabase/functions/ --include="*.ts"
grep -rn "admin.*bypass\|skipAuth\|noAuth" src/
```

**Чеклист:**
- [ ] Все Edge Functions проверяют JWT через `supabase.auth.getUser()`
- [ ] Нет JWT decode без verify (библиотека с proверкой подписи)
- [ ] Session expiry настроен
- [ ] OTP истекает через разумное время (5-10 мин)
- [ ] Нет hardcoded test credentials в коде

---

## A08:2025 — Software & Data Integrity

**Проверки:**
```bash
cat package-lock.json | jq '.lockfileVersion'  # должен быть зафиксирован
grep -rn "node_modules" .gitignore  # должен быть в .gitignore
```

**Чеклист:**
- [ ] package-lock.json в git (детерминированные deps)
- [ ] Нет `npm install --no-lockfile` в CI
- [ ] Subresource Integrity для CDN ресурсов

---

## A09:2025 — Security Logging & Monitoring

**Проверки:**
```bash
grep -rn "catch.*{" supabase/functions/ --include="*.ts" | grep -v "console\."
# Пустые catch без логов
```

**Чеклист:**
- [ ] Неудачные аутентификации логируются (с userId, IP)
- [ ] Подозрительные действия фиксируются (mass download, brute force)
- [ ] Нет пустых catch блоков в Edge Functions
- [ ] Sensitive данные НЕ в логах (пароли, токены)

---

## A10:2025 — SSRF

**Проверки:**
```bash
grep -rn "fetch(" supabase/functions/ --include="*.ts"
grep -rn "new URL\|url\s*=" supabase/functions/ --include="*.ts"
```

**Чеклист:**
- [ ] Edge Functions не принимают произвольные URL от пользователей для fetch
- [ ] Whitelist для внешних URLs (Stripe API, etc.)
- [ ] Webhook callbacks проверяются (не localhost, не internal IPs)
- [ ] Нет proxy endpoint без авторизации

---

## Итоговый отчёт

```markdown
# OWASP Top 10 Scan — {дата}
Проект: your-ai-companion
Стек: TypeScript + React + Supabase

## Сводка
| Категория | Status | Заметки |
|---|---|---|
| A01 Broken Access Control | 🟡 / 🔴 / ✅ | ... |
| A02 Crypto Failures | ✅ | ... |
...

## Критические находки
...

## Рекомендации
...
```

## Severity Scale

| 🔴 CRITICAL | 🟠 HIGH | 🟡 MEDIUM | 🔵 LOW |
|---|---|---|---|
| RLS отсутствует | hardcoded secret | нет rate limit | verbose errors |
| Auth bypass | IDOR | missing HTTPS dev | old dep (no CVE) |
| Plaintext keys | XSS sink | predictable IDs | missing headers |
