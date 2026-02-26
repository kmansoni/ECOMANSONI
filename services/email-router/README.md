# Email Router (MVP)

`email-router` — минимальный сервис для доставки email на внешние адреса через outbox-паттерн:

1. API принимает запросы на отправку и кладет их в `public.email_outbox`.
2. Worker периодически claim-ит пачку писем через RPC `public.claim_email_outbox_batch`.
3. Провайдер (`stub`, `smtp` или `sendmail`) выполняет отправку.
4. Результат каждой попытки логируется в `public.email_deliveries`.

## Переменные окружения

Обязательные:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Опциональные:

- `EMAIL_ROUTER_POSTGREST_URL` (для Timeweb/PostgREST напрямую, например `https://mansoni.ru/api`)

- `EMAIL_ROUTER_PORT` (default: `8090`)
- `EMAIL_ROUTER_PROVIDER` (`stub` | `smtp` | `sendmail`, default: `stub`)
- `EMAIL_ROUTER_POLL_MS` (default: `2000`)
- `EMAIL_ROUTER_BATCH_SIZE` (default: `25`)
- `EMAIL_ROUTER_LOCK_SECONDS` (default: `90`)
- `EMAIL_ROUTER_DEFAULT_MAX_ATTEMPTS` (default: `5`)
- `EMAIL_ROUTER_DEFAULT_FROM` (default: `noreply@example.com`)
- `EMAIL_ROUTER_INGEST_KEY` (если задан, обязателен header `x-ingest-key`)

SMTP (для `EMAIL_ROUTER_PROVIDER=smtp`):

- `SMTP_HOST`
- `SMTP_PORT` (default: `587`)
- `SMTP_SECURE` (`true|false`, default: `false`)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (опционально)

Sendmail (для `EMAIL_ROUTER_PROVIDER=sendmail`, self-hosted режим без внешнего SMTP):

- `SENDMAIL_PATH` (опционально, default системный `sendmail` в PATH)
- `SMTP_FROM` (опционально, fallback отправитель)

## Локальный запуск

```bash
npm --prefix ./services/email-router install
npm run email:router:dev
```

## Применение в Timeweb

### Быстрый деплой сервиса (systemd + sendmail)

Из корня репозитория:

```bash
pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/deploy-email-router-timeweb.ps1 -PromptPassword
```

Скрипт:
- архивирует и загружает `services/email-router` на сервер;
- собирает сервис в `/opt/email-router`;
- обновляет `/etc/default/email-router` (provider=`sendmail`);
- создает/обновляет systemd unit и перезапускает `email-router`;
- проверяет `http://127.0.0.1:8090/health` на сервере.

1. Обновить объединенный файл миграций:

```bash
pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/export-migrations.ps1
```

2. Проверить, что в `supabase/.temp/all-migrations.sql` есть блок `20260226120000_email_router_mvp.sql`.

3. Применить на сервере Timeweb (из-под пользователя с доступом к PostgreSQL):

```bash
PGPASSWORD='<db_password>' psql -U mansoni_app -d mansoni -f /root/all-migrations.sql
```

Если файл миграций еще не загружен на сервер, используй `scripts/upload-to-timeweb.ps1`.

## API

### `GET /health`

Возвращает состояние сервиса.

### `POST /v1/email/send`

Тело запроса:

```json
{
  "to": "user@example.com",
  "subject": "Hello",
  "html": "<p>Hello</p>",
  "text": "Hello",
  "idempotencyKey": "optional-key",
  "maxAttempts": 5,
  "from": "noreply@your-domain.tld"
}
```

Также поддерживаются шаблоны:

```json
{
  "to": ["u1@example.com", "u2@example.com"],
  "templateKey": "welcome",
  "templateVars": { "name": "Alex" },
  "idempotencyKey": "welcome-campaign-2026-02"
}
```

Если `templateKey` указан, сервис берет шаблон из `public.email_templates`.
