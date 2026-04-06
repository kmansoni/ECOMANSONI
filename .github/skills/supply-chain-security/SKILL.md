---
name: supply-chain-security
description: "Безопасность цепочки поставок: проверка npm пакетов, malicious packages, typosquatting, lock-файлы, CI/CD секреты, GitHub Actions безопасность. Use when: supply chain, безопасность зависимостей, malicious npm package, typosquatting, CI безопасность."
argument-hint: "[scope: npm | github-actions | docker | all]"
user-invocable: true
---

# Supply Chain Security — Безопасность цепочки поставок

Supply chain атаки направлены на инфраструктуру разработки: npm registry, GitHub Actions, Docker images. Компрометация одного пакета может затронуть тысячи проектов.

---

## npm Безопасность

### Проверка новых пакетов перед установкой

```bash
# 1. Проверить популярность и историю (typosquatting?)
npm info PACKAGE_NAME | grep -E "downloads|version|homepage|author|license"

# 2. Проверить на известные CVE
# https://security.snyk.io/vuln?search=PACKAGE_NAME

# 3. Проверить publish access (кто может публиковать)
npm access ls-packages PACKAGE_NAME 2>/dev/null

# 4. Установить с проверкой integrity
npm install PACKAGE_NAME --ignore-scripts  # Без postinstall скриптов
```

### Опасные npm scripts

```bash
# Найти пакеты с postinstall скриптами
node -e "
const fs = require('fs');
const lockFile = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const packages = lockFile.packages || {};
Object.entries(packages).forEach(([name, pkg]) => {
  if (pkg.scripts && (pkg.scripts.preinstall || pkg.scripts.postinstall || pkg.scripts.install)) {
    console.log(name + ': ' + JSON.stringify(pkg.scripts));
  }
});
"
```

### Lock-файл интегритет

```bash
# Убедиться что lock-файл в git
git ls-files package-lock.json bun.lockb | wc -l  # Должно быть > 0

# Проверить что CI использует --frozen-lockfile (Bun) или --ci (npm)
grep -rn "npm ci\|npm install\|bun install" .github/workflows/ --include="*.yml"
# npm install (без флагов) — ОПАСНО в CI, может обновить зависимости
# npm ci — БЕЗОПАСНО, строго следует package-lock.json
```

---

## GitHub Actions Безопасность

```bash
# Найти Actions с mutable ссылками (небезопасно)
grep -rn "uses:" .github/workflows/ --include="*.yml" | grep -v "@[0-9a-f]\{40\}"
# Небезопасно: actions/checkout@v4 (может измениться!)
# Безопасно: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af68 (commit hash)
```

```yaml
# ❌ Небезопасно — тег может быть переписан
- uses: actions/checkout@v4

# ✅ Безопасно — зафиксированный commit hash
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af68  # v4.2.2
```

### Минимальные права для GitHub Actions

```yaml
# .github/workflows/*.yml
permissions:
  contents: read          # Только чтение репозитория
  pull-requests: write    # Только если нужно для PR комментариев
  # НЕ: write-all, admin
```

### Секреты в CI

```bash
# Проверить что секреты не попадают в логи
grep -rn "echo \$\|print.*SECRET\|cat.*KEY" .github/workflows/ --include="*.yml"

# Проверить что GITHUB_TOKEN не имеет лишних прав
# Settings → Actions → General → Workflow permissions → Read repository contents only
```

---

## Typosquatting Detection

```bash
# Список наших прямых зависимостей
node -e "
const pkg = require('./package.json');
const all = {...pkg.dependencies, ...pkg.devDependencies};
Object.keys(all).forEach(p => console.log(p));
" | sort > /tmp/our-deps.txt

# Проверить подозрительные похожие имена (вручную)
# Примеры атак: lodahs (lodash), reqest (request), crossenv (cross-env)
cat /tmp/our-deps.txt | while read pkg; do
  npm info "$pkg" --json 2>/dev/null | jq -r '"Package: " + .name + " | Author: " + (.author.name // "unknown")'
done
```

---

## Dockerfile Security (если используется)

```dockerfile
# ❌ Небезопасно — latest тег
FROM node:latest

# ✅ Безопасно — точная версия + digest
FROM node:20.18.1-alpine3.20@sha256:...

# ✅ Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# ✅ Игнорировать devDependencies в production
RUN npm ci --only=production
```

---

## Мониторинг

```yaml
# Dependabot для автоматических PR при новых уязвимостях
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 10
    groups:
      minor-and-patch:
        update-types:
          - minor
          - patch
```

---

## Чеклист

- [ ] Lock-файл в git и используется в CI (`npm ci`, не `npm install`)
- [ ] GitHub Actions зафиксированы на commit hash
- [ ] Минимальные права в GitHub Actions (`permissions: contents: read`)
- [ ] Dependabot включён для автоматических security PR
- [ ] Новые пакеты проверяются перед установкой
- [ ] Нет пакетов с подозрительными postinstall скриптами
- [ ] Secrets не логируются в CI/CD
- [ ] Docker images на точных версиях (не latest)
