-- =============================================================================
-- ECOMANSONI Livestream Platform — Напоминания о запланированных эфирах
-- Миграция: 20260308000010_livestream_schedule_reminders.sql
-- Назначение: Подписка пользователей на напоминание перед запланированным стримом
--
-- Архитектурные решения:
--   - UNIQUE (session_id, user_id): один reminder на пользователя на сессию.
--   - notify_at: Edge Function scheduler (pg_cron / external cron) выбирает строки
--     WHERE notified = false AND notify_at <= now() — INDEX ONLY SCAN по partial index.
--   - notified: флаг предотвращает повторную отправку при retry вызова.
--     Обновляется атомарно с UPDATE ... RETURNING для идемпотентного dequeue.
--   - RLS: пользователь управляет только своими напоминаниями.
--   - ON DELETE CASCADE: при удалении сессии или пользователя — чистим ремайндеры.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.live_schedule_reminders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  BIGINT      NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notify_at   TIMESTAMPTZ NOT NULL,
  notified    BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (session_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Документирование колонок
-- ---------------------------------------------------------------------------
COMMENT ON TABLE  public.live_schedule_reminders              IS 'Пользовательские напоминания о запланированных эфирах';
COMMENT ON COLUMN public.live_schedule_reminders.id           IS 'UUID PK';
COMMENT ON COLUMN public.live_schedule_reminders.session_id   IS 'FK → live_sessions.id (BIGINT)';
COMMENT ON COLUMN public.live_schedule_reminders.user_id      IS 'FK → auth.users.id — кому отправить напоминание';
COMMENT ON COLUMN public.live_schedule_reminders.notify_at    IS 'Когда отправить уведомление (обычно scheduled_at - 5 минут)';
COMMENT ON COLUMN public.live_schedule_reminders.notified     IS 'true = уведомление уже отправлено';
COMMENT ON COLUMN public.live_schedule_reminders.created_at   IS 'Время создания подписки на напоминание';

-- ---------------------------------------------------------------------------
-- Индексы
-- ---------------------------------------------------------------------------

-- Hot-path cron-worker: выборка pending напоминаний без сканирования отправленных
CREATE INDEX IF NOT EXISTS idx_live_schedule_reminders_pending
  ON public.live_schedule_reminders (notify_at)
  WHERE notified = false;

-- Пользователь — список своих активных напоминаний
CREATE INDEX IF NOT EXISTS idx_live_schedule_reminders_user_id
  ON public.live_schedule_reminders (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.live_schedule_reminders ENABLE ROW LEVEL SECURITY;

-- Пользователь видит только свои напоминания
CREATE POLICY "live_schedule_reminders_select_self"
  ON public.live_schedule_reminders
  FOR SELECT
  USING (auth.uid() = user_id);

-- Пользователь создаёт напоминание для себя
CREATE POLICY "live_schedule_reminders_insert_self"
  ON public.live_schedule_reminders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Пользователь может обновить своё напоминание (изменить notify_at)
CREATE POLICY "live_schedule_reminders_update_self"
  ON public.live_schedule_reminders
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Пользователь может отменить напоминание
CREATE POLICY "live_schedule_reminders_delete_self"
  ON public.live_schedule_reminders
  FOR DELETE
  USING (auth.uid() = user_id);
