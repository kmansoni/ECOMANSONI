# Email Router (MVP)

`email-router` — минимальный сервис для доставки email на внешние адреса через outbox-паттерн:

1. API принимает запросы на отправку и кладет их в `public.email_outbox`.
2. Worker периодически claim-ит пачку писем через RPC `public.claim_email_outbox_batch`.
3. Провайдер (`stub`, `smtp` или `sendmail`) выполняет отправку.
4. Результат каждой попытки логируется в `public.email_deliveries`.
5. Входящие письма принимаются в `public.email_inbox`, связываются в треды (`public.email_threads`) и доступны через inbox/thread API.

## Переменные окружения

Обязательные:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Опциональные:

- `EMAIL_ROUTER_POSTGREST_URL` (для прямого PostgREST, например `https://mansoni.ru/api`)

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

Smoke-проверка полного mail flow (send → inbound → threads → reply → read):

```bash
pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/email-router-smoke.ps1 -BaseUrl http://127.0.0.1:8090 -Mailbox support@example.com
```

Если задан `EMAIL_ROUTER_INGEST_KEY`, передай `-IngestKey`.

## Применение

1. Обновить объединенный файл миграций:

```bash
pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/export-migrations.ps1
```

2. Проверить, что в `supabase/.temp/all-migrations.sql` есть блок `20260226120000_email_router_mvp.sql`.

3. Применить на сервере (из-под пользователя с доступом к PostgreSQL):

```bash
PGPASSWORD='<db_password>' psql -U mansoni_app -d mansoni -f /root/all-migrations.sql
```

Если файл миграций еще не загружен на сервер, загрузи его через `scp`.

## API

### `GET /health`

Возвращает состояние сервиса.

### `POST /v1/email/send`

Тело запроса:

```json
{
  "to": "user@example.com",
  "cc": ["manager@example.com"],
  "bcc": ["audit@example.com"],
  "subject": "Hello",
  "html": "<p>Hello</p>",
  "text": "Hello",
  "replyToMessageId": "<source-msg@example.com>",
  "threadId": "optional-thread-uuid",
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

### `POST /v1/email/inbound`

Прием входящего письма (обычно из SMTP webhook/relay):

```json
{
  "messageId": "<abc123@example.com>",
  "from": "sender@example.com",
  "to": ["support@mansoni.ru"],
  "subject": "Reply",
  "text": "Hello",
  "html": "<p>Hello</p>",
  "inReplyToMessageId": "<outbound-msg@example.com>",
  "provider": "postfix",
  "headers": { "x-source": "mx1" },
  "receivedAt": "2026-02-28T18:20:00Z"
}
```

Идемпотентность входящих на уровне `(message_id, to_email)`.

### `GET /v1/email/inbox?to=<email>&limit=50`

Возвращает последние входящие письма для указанного получателя.

```json
{
  "ok": true,
  "count": 2,
  "items": [
    {
      "id": "...",
      "message_id": "<abc123@example.com>",
      "from_email": "sender@example.com",
      "to_email": "support@mansoni.ru",
      "subject": "Reply",
      "received_at": "2026-02-28T18:20:00Z"
    }
  ]
}
```

Поддерживается фильтр только непрочитанных: `GET /v1/email/inbox?to=<email>&limit=50&unreadOnly=true`.

### `GET /v1/email/threads?to=<email>&limit=50&unreadOnly=true`

Возвращает список тредов для конкретного mailbox (получателя).

### `GET /v1/email/threads/:threadId/messages?limit=200`

Возвращает историю треда:

- `inbox`: входящие сообщения
- `outbox`: исходящие сообщения

### `POST /v1/email/inbox/:id/read`

Отмечает письмо как прочитанное/непрочитанное:

```json
{
  "read": true
}
```

### `POST /v1/email/threads/:threadId/reply`

Ставит ответ в outbox в рамках конкретного треда.

```json
{
  "text": "Спасибо, приняли в работу",
  "html": "<p>Спасибо, приняли в работу</p>",
  "from": "support@mansoni.ru",
  "idempotencyKey": "reply-2026-02-28-001"
}
```

Если `to` не указан, сервис пытается взять адрес из последнего inbound сообщения треда.
