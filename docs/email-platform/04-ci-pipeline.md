# 04 — CI/CD Pipeline

## Содержание

- [4.1 Обзор пайплайна](#41-обзор-пайплайна)
- [4.2 GitHub Actions Workflow](#42-github-actions-workflow)
- [4.3 Stages: Lint / Test / Security / Docker](#43-stages-lint--test--security--docker)
- [4.4 Переменные окружения для CI](#44-переменные-окружения-для-ci)
- [4.5 Docker Build & Push](#45-docker-build--push)
- [4.6 Deploy на сервер](#46-deploy-на-сервер)
- [4.7 Rollback процедура](#47-rollback-процедура)

---

## 4.1 Обзор пайплайна

```
Push/PR → Lint → Typecheck → Unit Tests → Integration Tests
       → Security Scan → Docker Build → Docker Push
       → Deploy to Staging → Smoke Tests
       → (manual gate) → Deploy to Production
```

### Триггеры

| Событие | Triggerт | Что запускается |
|---|---|---|
| PR в main/develop | `pull_request` | lint + typecheck + unit tests + security |
| Push в main | `push` | полный пайплайн + deploy staging |
| Push тега `v*` | `push tags` | deploy production |
| Cron (ежедневно) | `schedule` | security scan + dependency audit |

---

## 4.2 GitHub Actions Workflow

Отдельный workflow-файл для `email-router` в текущем репозитории не хранится. Ниже приведён референсный шаблон CI/CD для `services/email-router`, который должен встраиваться в актуальные workflow из `.github/workflows/`.

```yaml
name: Email Router CI/CD

on:
  push:
    branches: [main, develop]
    tags: ['v*']
    paths:
      - 'services/email-router/**'
      - 'infra/email/**'
  pull_request:
    branches: [main, develop]
    paths:
      - 'services/email-router/**'
  schedule:
    # Ежедневный security scan в 03:00 UTC
    - cron: '0 3 * * *'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}/email-router

jobs:
  lint:
    name: Lint & Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: services/email-router/package-lock.json

      - name: Install dependencies
        run: cd services/email-router && npm ci

      - name: ESLint
        run: cd services/email-router && npm run lint

      - name: TypeScript typecheck
        run: cd services/email-router && npm run typecheck

  test:
    name: Tests
    runs-on: ubuntu-latest
    needs: lint
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: emailuser
          POSTGRES_PASSWORD: testpassword
          POSTGRES_DB: emaildb_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      NODE_ENV: test
      DATABASE_URL: postgres://emailuser:testpassword@localhost:5432/emaildb_test
      REDIS_URL: redis://localhost:6379
      SUPABASE_JWT_SECRET: test_jwt_secret_for_ci_only
      EMAIL_ENCRYPTION_KEY: dGVzdF9lbmNyeXB0aW9uX2tleV9mb3JfY2lfb25seV8zMg==

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: services/email-router/package-lock.json

      - name: Install dependencies
        run: cd services/email-router && npm ci

      - name: Run database migrations
        run: cd services/email-router && npm run db:migrate

      - name: Unit tests
        run: cd services/email-router && npm run test:unit -- --coverage

      - name: Integration tests
        run: cd services/email-router && npm run test:integration

      - name: Upload coverage report
        uses: codecov/codecov-action@v4
        with:
          directory: services/email-router/coverage
          flags: email-router

  security:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: lint
    permissions:
      security-events: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: services/email-router/package-lock.json

      - name: Install dependencies
        run: cd services/email-router && npm ci

      - name: npm audit (high severity)
        run: cd services/email-router && npm audit --audit-level=high

      - name: Trivy filesystem scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: 'services/email-router'
          severity: 'CRITICAL,HIGH'
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'

  docker:
    name: Docker Build & Push
    runs-on: ubuntu-latest
    needs: [test, security]
    if: github.event_name == 'push'
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract Docker metadata (tags, labels)
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,prefix=sha-

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: services/email-router
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            BUILD_DATE=${{ github.event.head_commit.timestamp }}
            GIT_COMMIT=${{ github.sha }}

      - name: Trivy image scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: '${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:sha-${{ github.sha }}'
          severity: 'CRITICAL'
          exit-code: '1'

  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: docker
    if: github.ref == 'refs/heads/main'
    environment:
      name: staging
      url: https://email-staging.mansoni.ru

    steps:
      - name: Deploy to staging server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/email-platform
            export IMAGE_TAG=sha-${{ github.sha }}
            docker compose pull email-router
            docker compose up -d --no-deps email-router
            sleep 10
            # Smoke test
            curl -sf http://localhost:3100/health || exit 1
            echo "✅ Deployment successful: $IMAGE_TAG"

  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: docker
    if: startsWith(github.ref, 'refs/tags/v')
    environment:
      name: production
      url: https://email.mansoni.ru

    steps:
      - name: Deploy to production server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/email-platform
            export IMAGE_TAG=${{ github.ref_name }}
            # Backup before deploy
            make backup-db
            # Rolling update
            docker compose pull email-router
            docker compose up -d --no-deps --wait email-router
            sleep 15
            # Health check
            curl -sf http://localhost:3100/ready || exit 1
            echo "✅ Production deployment successful: $IMAGE_TAG"
```

---

## 4.3 Stages: Lint / Test / Security / Docker

### Stage: Lint

Что проверяется:

```bash
# ESLint — стиль кода и потенциальные ошибки
npm run lint
# Конфиг: services/email-router/.eslintrc.json

# TypeScript — статическая типизация
npm run typecheck
# Конфиг: services/email-router/tsconfig.json
```

Обязательные правила ESLint:
- `@typescript-eslint/no-explicit-any` — запрет `any`
- `@typescript-eslint/no-unused-vars` — нет неиспользуемых переменных
- `no-console` — использовать Pino logger, не console.log

### Stage: Test

Структура тестов:

```
services/email-router/
├── tests/
│   ├── unit/
│   │   ├── handlers/         # unit тесты для handlers
│   │   ├── services/         # unit тесты для сервисов
│   │   └── utils/            # unit тесты для утилит
│   ├── integration/
│   │   ├── send.test.ts      # POST /email/send
│   │   ├── status.test.ts    # GET /email/status/:id
│   │   └── admin.test.ts     # /email/admin endpoints
│   └── load/
│       └── k6-send.js        # k6 нагрузочные тесты
```

Команды:

```bash
# Unit тесты (быстрые, без БД)
npm run test:unit

# Integration тесты (с PostgreSQL + Redis)
npm run test:integration

# Все тесты с coverage
npm run test -- --coverage

# Конкретный файл
npm run test -- tests/unit/handlers/send.test.ts

# Watch mode (dev)
npm run test:watch
```

Coverage targets:

```
Statements: ≥ 80%
Branches:   ≥ 75%
Functions:  ≥ 80%
Lines:      ≥ 80%
```

### Stage: Security

```bash
# Dependency vulnerabilities
npm audit --audit-level=high

# Если есть high/critical — исправить перед merge
npm audit fix

# Trivy — сканирование кода и Docker образа
trivy fs services/email-router --severity CRITICAL,HIGH

# OWASP dependency check (ежемесячно)
docker run --rm \
  -v $(pwd)/services/email-router:/src \
  owasp/dependency-check \
  --scan /src --format JSON --out /src/reports
```

---

## 4.4 Переменные окружения для CI

### GitHub Secrets (настроить в Settings → Secrets)

| Secret | Описание | Где используется |
|---|---|---|
| `STAGING_HOST` | IP или hostname staging сервера | deploy-staging |
| `STAGING_USER` | SSH пользователь | deploy-staging |
| `STAGING_SSH_KEY` | Приватный SSH ключ | deploy-staging |
| `PROD_HOST` | IP или hostname production сервера | deploy-production |
| `PROD_USER` | SSH пользователь | deploy-production |
| `PROD_SSH_KEY` | Приватный SSH ключ | deploy-production |
| `CODECOV_TOKEN` | Token для Codecov | coverage upload |

### GitHub Variables (Settings → Variables)

| Variable | Значение |
|---|---|
| `STAGING_URL` | `https://email-staging.mansoni.ru` |
| `PROD_URL` | `https://email.mansoni.ru` |

### CI-only environment variables (не секреты)

Для тестового запуска в CI используются специальные тестовые значения:

```bash
# reference workflow snippet (env секция jobs.test)
NODE_ENV: test
DATABASE_URL: postgres://emailuser:testpassword@localhost:5432/emaildb_test
REDIS_URL: redis://localhost:6379
SUPABASE_JWT_SECRET: test_jwt_secret_for_ci_only_not_real
```

> ⚠️ Никогда не использовать production секреты в CI тестах

---

## 4.5 Docker Build & Push

### Dockerfile

```dockerfile
# services/email-router/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Production образ
FROM node:20-alpine AS production

# Security: non-root user
RUN addgroup -S emailgroup && adduser -S emailuser -G emailgroup

WORKDIR /app

# Копировать только необходимое
COPY --from=builder --chown=emailuser:emailgroup /app/dist ./dist
COPY --from=builder --chown=emailuser:emailgroup /app/node_modules ./node_modules
COPY --chown=emailuser:emailgroup package.json ./

USER emailuser

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3100/health || exit 1

CMD ["node", "dist/index.js"]
```

### Тегирование образов

```
ghcr.io/org/email-router:main           # последний из main
ghcr.io/org/email-router:sha-abc1234    # конкретный commit
ghcr.io/org/email-router:v1.2.3         # release tag
ghcr.io/org/email-router:1.2            # major.minor
```

---

## 4.6 Deploy на сервер

### Структура на сервере

```
/opt/email-platform/
├── infra/email/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   ├── .env.local          # production secrets (не в git!)
│   ├── postfix/
│   ├── dkim/
│   └── certs/
└── backups/
    ├── pg/
    └── redis/
```

### Deploy процедура вручную (emergency)

```bash
# На production сервере
cd /opt/email-platform/infra/email

# 1. Backup перед деплоем
make backup-db

# 2. Pull новый образ
docker compose pull email-router

# 3. Rolling restart (zero-downtime если несколько реплик)
docker compose up -d --no-deps --wait email-router

# 4. Проверить health
sleep 10
curl -s http://localhost:3100/health | jq .
curl -s http://localhost:3100/ready | jq .

# 5. Если что-то пошло не так — rollback
# (см. раздел 4.7)
```

---

## 4.7 Rollback процедура

### Быстрый rollback (через Docker tag)

```bash
# Посмотреть доступные теги
docker images | grep email-router

# Откатить на предыдущий образ
cd /opt/email-platform/infra/email

# Указать предыдущий тег
export IMAGE_TAG=sha-<PREVIOUS_COMMIT_SHA>

# Откатить
docker compose up -d --no-deps email-router

# Проверить
curl -s http://localhost:3100/ready | jq .
echo "✅ Rollback complete to $IMAGE_TAG"
```

### Rollback с восстановлением БД

> Требуется если в деплое была миграция БД, которую нужно откатить

```bash
# 1. Остановить email-router
docker stop email-router

# 2. Восстановить БД из backup
make restore-db FILE=backup_$(date -d yesterday +%Y%m%d)_030000.sql.gz

# 3. Откатить образ
export IMAGE_TAG=sha-<PREVIOUS_SHA>
docker compose up -d --no-deps email-router

# 4. Проверить
curl -s http://localhost:3100/ready | jq .
```

### Определение предыдущего тега

```bash
# Посмотреть историю деплоев в GitHub Actions
# Откройте актуальный workflow из .github/workflows/ для текущего репозитория

# Или через Docker history
docker image history ghcr.io/org/email-router:main --format "{{.CreatedAt}} {{.Comment}}"
```
