# Message Queue Designer

## Описание

Проектирование очередей сообщений в Supabase-экосистеме: pg_net, pgmq, webhooks, гарантии доставки, dead letter.

## Когда использовать

- Отложенная обработка (email, push, resize изображений)
- Интеграция с внешними API (платёжные системы, SMS)
- Распределение нагрузки (batch processing)
- Надёжная доставка с retry
- Декаплинг сервисов

## Очередь на PostgreSQL (pgmq-подход)

```sql
CREATE TABLE task_queue (
  id bigserial PRIMARY KEY,
  queue_name text NOT NULL DEFAULT 'default',
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- pending, processing, done, failed, dead
  attempts int DEFAULT 0,
  max_attempts int DEFAULT 3,
  scheduled_at timestamptz DEFAULT now(),
  locked_until timestamptz,
  locked_by text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_queue_pending ON task_queue (queue_name, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX idx_queue_failed ON task_queue (queue_name)
  WHERE status = 'failed';
```

## Получение задачи (с блокировкой)

```sql
CREATE OR REPLACE FUNCTION dequeue_task(p_queue text, p_worker text)
RETURNS task_queue
LANGUAGE plpgsql
AS $$
DECLARE
  task task_queue;
BEGIN
  SELECT * INTO task
  FROM task_queue
  WHERE queue_name = p_queue
    AND status = 'pending'
    AND scheduled_at <= now()
  ORDER BY scheduled_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF task.id IS NOT NULL THEN
    UPDATE task_queue
    SET status = 'processing',
        locked_by = p_worker,
        locked_until = now() + interval '5 minutes',
        attempts = attempts + 1
    WHERE id = task.id;
  END IF;

  RETURN task;
END;
$$;
```

## Завершение / ошибка

```sql
CREATE OR REPLACE FUNCTION complete_task(p_id bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE task_queue
  SET status = 'done', completed_at = now(), locked_by = NULL
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION fail_task(p_id bigint, p_error text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE task_queue
  SET
    status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'failed' END,
    error_message = p_error,
    locked_by = NULL,
    -- Exponential backoff: 30s, 2min, 8min
    scheduled_at = CASE
      WHEN attempts < max_attempts THEN now() + (power(2, attempts) * interval '30 seconds')
      ELSE scheduled_at
    END
  WHERE id = p_id;
END;
$$;
```

## pg_net — HTTP из PostgreSQL

```sql
-- Вызов webhook при новом заказе
CREATE OR REPLACE FUNCTION notify_order_webhook()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://project.supabase.co/functions/v1/process-order',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('order_id', NEW.id)
  );
  RETURN NEW;
END;
$$;
```

## Idempotency

```sql
-- Ключ идемпотентности для предотвращения дублей
ALTER TABLE task_queue ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX idx_queue_idempotency ON task_queue (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Вставка с дедупликацией
INSERT INTO task_queue (queue_name, payload, idempotency_key)
VALUES ('emails', '{"to":"user@mail.ru"}', 'order-123-confirm')
ON CONFLICT (idempotency_key) DO NOTHING;
```

## Чеклист

1. **FOR UPDATE SKIP LOCKED** — конкурентное получение без дедлоков
2. **max_attempts** — ограничить retry, не бесконечный цикл
3. **Exponential backoff** — увеличивать интервал между retry
4. **Dead letter** — `status = 'dead'` для мониторинга провалов
5. **Idempotency key** — дедупликация задач
6. **Lock timeout** — задачу освободить если воркер умер

## Anti-patterns

- `DELETE` из очереди вместо смены статуса — потеря истории
- Retry без backoff — DDoS на внешний API
- Нет `SKIP LOCKED` — два воркера берут одну задачу
- Бесконечные retry — задача в цикле навсегда
- Большой payload в очереди — лучше ID + ссылка на данные
- Нет мониторинга dead letter — ошибки накапливаются молча
