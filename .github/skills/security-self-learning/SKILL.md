# Security Self-Learning — Протокол самообучения по безопасности

## Триггеры

- Новый код с auth, crypto, input handling → автоматический аудит
- Новая зависимость → проверка CVE
- Новый API endpoint → threat model
- Изменение RLS → policy verification

## Источники знаний

### OWASP Resources
- OWASP/CheatSheetSeries — 60+ cheat sheets по всем темам
- OWASP/ASVS — Application Security Verification Standard
- OWASP/Testing-Guide — методология тестирования
- OWASP/Top10 — топ-10 уязвимостей

### Security Tools & Rules
- trailofbits/semgrep-rules — автоматические правила поиска уязвимостей
- returntocorp/semgrep — статический анализ
- eslint-plugin-security — ESLint правила безопасности
- snyk/cli — проверка зависимостей

### Real-World Exploits
- cure53 audit reports — аудиты реальных проектов
- HackerOne disclosed reports — реальные баг-баунти
- portswigger/web-security-academy — обучающие лабы
- NIST NVD — база CVE

### Crypto & E2EE
- nicola-tommasi/signal-protocol-js — реализация Signal
- nicola-tommasi/e2ee — E2EE паттерны
- nicola-tommasi/libsodium.js — криптографическая библиотека
- nicola-tommasi/tink — Google crypto library

### Supabase Security
- supabase/supabase — официальные security паттерны
- supabase/auth — auth implementation details
- supabase/storage — storage security
- supabase/realtime — realtime security

## Процесс обучения

### 1. IDENTIFY — определить домен
```
Вопросы:
- Какой тип данных обрабатывается? (PII, финансы, медицина)
- Какие trust boundaries пересекаются?
- Какой attack surface?
- Какие compliance requirements?
```

### 2. SEARCH — найти эталоны
```
GitHub search:
- topic:security + stars:>1000 + language:TypeScript
- "RLS policy" + stars:>100
- "Content-Security-Policy" + React
- "XSS prevention" + TypeScript
```

### 3. ANALYZE — извлечь паттерны
```
Для каждого репозитория:
- Как реализована auth?
- Как валидируется input?
- Как обрабатываются ошибки auth?
- Есть ли CSP headers?
- Как хранятся secrets?
```

### 4. COMPARE — сравнить с нашим кодом
```
Чеклист:
□ RLS на каждой таблице
□ Input validation на каждом endpoint
□ XSS protection (DOMPurify для user content)
□ CSRF tokens
□ Rate limiting
□ Security headers
□ Audit logging
□ E2EE для приватных данных
```

### 5. ADAPT — применить
```
НЕ копировать слепо. Адаптировать под наш стек:
- React + Supabase + Edge Functions
- TypeScript strict
- Capacitor mobile
```

### 6. SAVE — сохранить знания
```
Файл: /memories/repo/security-{topic}-{date}.md
Содержание:
- Источник: {repo/article}
- Паттерн: {что нашли}
- Применение: {как адаптировали}
- Anti-pattern: {что НЕ делать}
```

## OWASP Top 10 Checklist для нашего стека

### A01 — Broken Access Control
- [ ] RLS policy на КАЖДОЙ таблице (deny by default)
- [ ] auth.uid() проверка в КАЖДОМ запросе
- [ ] Role-based access: user/admin/moderator
- [ ] IDOR prevention: нет прямых ID в URL без проверки владельца

### A02 — Cryptographic Failures
- [ ] E2EE: AES-256-GCM + X25519
- [ ] Пароли: bcrypt (Supabase auth)
- [ ] HTTPS only (HSTS)
- [ ] Нет хранения секретов в localStorage (кроме зашифрованных ключей E2EE)

### A03 — Injection
- [ ] Параметризованные запросы (Supabase client)
- [ ] DOMPurify для user-generated HTML
- [ ] Нет eval(), innerHTML с user data
- [ ] Template literal injection prevention

### A04 — Insecure Design
- [ ] Threat model для каждого модуля
- [ ] Rate limiting на auth endpoints
- [ ] Account lockout после N failed attempts
- [ ] Secure defaults (deny by default)

### A05 — Security Misconfiguration
- [ ] CORS: explicit origins, не wildcard
- [ ] CSP headers: script-src 'self'
- [ ] X-Frame-Options: DENY
- [ ] Нет debug mode в production
- [ ] Supabase: анонимный доступ минимальный

### A06 — Vulnerable Components
- [ ] npm audit: 0 critical, 0 high
- [ ] Dependabot/Renovate настроен
- [ ] Нет устаревших пакетов с known CVE
- [ ] Lock file (package-lock.json) в репозитории

### A07 — Authentication Failures
- [ ] Supabase Auth (не кастомный)
- [ ] MFA support
- [ ] Token refresh: автоматический
- [ ] Session management: secure, httpOnly, sameSite

### A08 — Software Integrity
- [ ] SRI для external scripts
- [ ] Signed commits (GPG)
- [ ] CI/CD: no arbitrary code execution from PRs

### A09 — Security Logging
- [ ] Auth events: login, logout, failed attempts
- [ ] Admin actions: создание/удаление пользователей
- [ ] RLS denials: логирование попыток несанкционированного доступа
- [ ] Нет PII в логах

### A10 — SSRF
- [ ] URL validation для user-provided URLs
- [ ] Нет fetch() с user-controlled URL без whitelist
- [ ] Edge Functions: нет доступа к internal services
