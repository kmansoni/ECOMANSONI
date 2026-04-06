---
name: vulnerable-component-detector
description: "Обнаружение уязвимых компонентов: npm audit, известные CVE в зависимостях, устаревшие библиотеки с уязвимостями, OWASP A06. Use when: OWASP A06, vulnerable components, CVE, устаревшие зависимости, npm audit, outdated packages."
argument-hint: "[package.json или scope: frontend | server | all]"
user-invocable: true
---

# Vulnerable Component Detector — OWASP A06

Устаревшие зависимости с известными CVE — один из самых простых векторов атаки: эксплойт уже написан, нужно только найти уязвимую версию.

---

## Быстрый аудит

```bash
# 1. npm audit — все уязвимости
npm audit --json 2>/dev/null | jq '.vulnerabilities | to_entries[] | {name: .key, severity: .value.severity, title: .value.via[0].title // .value.via[0]}'

# 2. Только критические и высокие
npm audit --audit-level=high

# 3. Устаревшие пакеты с красным цветом (major.minor.patch)
npm outdated

# 4. Проверить конкретный пакет на CVE
# https://www.npmjs.com/advisories
# https://nvd.nist.gov/vuln/search
```

---

## Ключевые зависимости для проверки

```bash
# Извлечь версии критических пакетов
node -e "
const pkg = require('./package.json');
const deps = {...pkg.dependencies, ...pkg.devDependencies};
const critical = ['react', 'vite', '@supabase/supabase-js', 'typescript',
  'zod', '@tanstack/react-query', 'zustand', 'socket.io', 'ws',
  'jsonwebtoken', 'express', 'mediasoup', 'node'];
critical.forEach(name => {
  if (deps[name]) console.log(name + ': ' + deps[name]);
});
"
```

---

## Известные уязвимые паттерны (проект-специфичные)

```bash
# Проверить критические версии

# jsonwebtoken < 9.0.0 — Algorithm confusion vulnerability (CVE-2022-23529)
node -e "console.log(require('./node_modules/jsonwebtoken/package.json').version)"

# ws < 8.17.1 — DoS vulnerability (CVE-2024-37890)
node -e "console.log(require('./node_modules/ws/package.json').version)"

# Vite < 5.2.6 — Server Side Request Forgery (CVE-2024-31207)
node -e "console.log(require('./node_modules/vite/package.json').version)"

# React < 18.2.0 — Server Components issues
node -e "console.log(require('./node_modules/react/package.json').version)"
```

---

## Автоматизация мониторинга

```json
// package.json — добавить в scripts
{
  "scripts": {
    "audit:check": "npm audit --audit-level=moderate",
    "audit:fix": "npm audit fix",
    "audit:report": "npm audit --json > audit-report.json",
    "deps:outdated": "npm outdated"
  }
}
```

```yaml
# .github/workflows/security.yml — еженедельная проверка
name: Dependency Security Audit
on:
  schedule:
    - cron: '0 9 * * 1'  # Каждый понедельник в 9:00
  push:
    paths: ['package.json', 'package-lock.json']

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm audit --audit-level=high
```

---

## Анализ транзитивных зависимостей

```bash
# Найти кто тянет уязвимый пакет
npm ls vulnerable-package-name

# Граф зависимостей для пакета
npm explain vulnerable-package-name

# Полное дерево зависимостей (осторожно — большой вывод)
npm ls --all 2>/dev/null | grep -E "WARN|deprecated" | head -20
```

---

## Исправление

```bash
# Автоматическое исправление (только non-breaking)
npm audit fix

# С обновлением major версий (ОСТОРОЖНО — может сломать API)
npm audit fix --force

# Точечное обновление конкретного пакета
npm update package-name

# Если пакет не обновляется (конфликт зависимостей)
# overrides в package.json:
```

```json
{
  "overrides": {
    "vulnerable-transitive-dep": ">=2.0.0"
  }
}
```

---

## Чеклист

- [ ] `npm audit` — 0 critical, 0 high
- [ ] `npm outdated` — нет красных строк (major отставание)
- [ ] jsonwebtoken >= 9.0.0
- [ ] ws >= 8.17.1
- [ ] Vite >= 5.2.6
- [ ] Автоматический аудит в CI/CD (weekly)
- [ ] Политика: critical CVE → patch в течение 48 часов
- [ ] lock-файл в git (package-lock.json / bun.lockb)
