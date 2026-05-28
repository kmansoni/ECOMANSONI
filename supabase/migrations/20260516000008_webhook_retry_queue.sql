-- Migration: Webhook retry queue with exponential backoff

-- Таблица неудачно обработанных вебхук-событий
CREATE TABLE IF NOT EXISTS bot_webhook_failed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  event_payload JSONB NOT NULL,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);
-- Индекс для быстрого поиска событий, готовых к повторной попытке
CREATE INDEX IF NOT EXISTS idx_webhook_failed_retry
  ON bot_webhook_failed_events (next_retry_at)
  WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_failed_bot
  ON bot_webhook_failed_events (bot_id)
  WHERE processed_at IS NULL;
-- Функция cron: retry неудачных вебхук-обработок с экспоненциальным ожиданием
-- Запускать каждые 5 минут: SELECT cron.schedule('retry-webhook-failed', '*/5 * * * *', $$SELECT cron.retry_webhook_failed_events()$$);
CREATE OR REPLACE FUNCTION cron_retry_webhook_failed_events()
RETURNS bigint
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_batch_size CONSTANT int := 50;
  v_processed int := 0;
  v_record RECORD;
BEGIN
  FOR v_record IN
    SELECT id, bot_id, event_payload, retry_count
    FROM bot_webhook_failed_events
    WHERE processed_at IS NULL
      AND next_retry_at <= now()
    ORDER BY next_retry_at ASC
    LIMIT v_batch_size
  FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Пробуем переотправить событие в bot-engine
      PERFORM net.http_post(
        url := (SELECT current_setting('app.bot_engine_url', true) || '/events'),
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := v_record.event_payload::text
      );

      -- Успешно
      UPDATE bot_webhook_failed_events
      SET processed_at = now()
      WHERE id = v_record.id;

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Увеличиваем счётчик и вычисляем следующее время попытки
      -- Экспоненциальный backoff: 1м, 2м, 4м, 8м, 16м
      UPDATE bot_webhook_failed_events
      SET
        retry_count = v_record.retry_count + 1,
        next_retry_at = now() + (60 * POWER(2, LEAST(v_record.retry_count + 1, 5))) * interval '1 second',
        error_message = LEFT(SQLERRM, 500)
      WHERE id = v_record.id;

      -- Если превышен лимит попыток, помечаем как обработанное с ошибкой
      IF v_record.retry_count + 1 >= 5 THEN
        UPDATE bot_webhook_failed_events
        SET processed_at = now()
        WHERE id = v_record.id AND processed_at IS NULL;
      END IF;
    END;
  END LOOP;

  RETURN v_processed;
END;
$$;
-- Утилита: добавление события в очередь повтора
CREATE OR REPLACE FUNCTION enqueue_webhook_retry(
  p_bot_id UUID,
  p_event_payload JSONB,
  p_error_message TEXT DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO bot_webhook_failed_events (bot_id, event_payload, error_message, next_retry_at)
  VALUES (
    p_bot_id,
    p_event_payload,
    p_error_message,
    now() + interval '1 minute'  -- Первая попытка через 1 минуту
  );
END;
$$;
-- Comment
COMMENT ON FUNCTION cron_retry_webhook_failed_events IS 'Retries failed webhook events with exponential backoff (1m, 2m, 4m, 8m, 16m)';
COMMENT ON FUNCTION enqueue_webhook_retry IS 'Adds a failed webhook event to the retry queue';
