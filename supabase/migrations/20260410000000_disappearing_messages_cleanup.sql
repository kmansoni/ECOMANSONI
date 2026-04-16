-- ============================================================================
-- Disappearing messages cleanup (B-076 server-side)
--
-- Миграция 20260229000001 добавила колонки disappear_at и индекс, но не
-- сервер-функцию удаления. Без неё сообщения остаются в БД навсегда —
-- клиент просто скрывает их локально. Это утечка приватности.
--
-- Эта миграция добавляет:
--   1. Функцию cleanup_expired_disappearing_messages() — удаляет протухшие
--      сообщения из messages / group_chat_messages / channel_messages.
--   2. pg_cron job каждую минуту (idempotent).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.cleanup_expired_disappearing_messages()
RETURNS TABLE (
  messages_deleted BIGINT,
  group_messages_deleted BIGINT,
  channel_messages_deleted BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_messages BIGINT := 0;
  v_group BIGINT := 0;
  v_channel BIGINT := 0;
BEGIN
  -- Direct messages
  WITH d AS (
    DELETE FROM public.messages
    WHERE disappear_at IS NOT NULL
      AND disappear_at <= NOW()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_messages FROM d;

  -- Group chat messages (если колонки есть — таблица из того же релиза)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'group_chat_messages'
      AND column_name = 'disappear_at'
  ) THEN
    WITH d AS (
      DELETE FROM public.group_chat_messages
      WHERE disappear_at IS NOT NULL
        AND disappear_at <= NOW()
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_group FROM d;
  END IF;

  -- Channel messages
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'channel_messages'
      AND column_name = 'disappear_at'
  ) THEN
    WITH d AS (
      DELETE FROM public.channel_messages
      WHERE disappear_at IS NOT NULL
        AND disappear_at <= NOW()
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_channel FROM d;
  END IF;

  RETURN QUERY SELECT v_messages, v_group, v_channel;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_disappearing_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_disappearing_messages() TO service_role;

-- Idempotent schedule — каждую минуту. Индексы idx_messages_disappear_at
-- уже существуют (миграция 20260229000001).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'messenger-disappear-cleanup') THEN
    PERFORM cron.schedule(
      'messenger-disappear-cleanup',
      '* * * * *',
      $cron$SELECT public.cleanup_expired_disappearing_messages()$cron$
    );
  END IF;
END $do$;

COMMENT ON FUNCTION public.cleanup_expired_disappearing_messages() IS
  'Удаляет протухшие сообщения из messages / group_chat_messages / channel_messages. Планируется pg_cron каждую минуту (messenger-disappear-cleanup).';
