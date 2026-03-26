-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- =============================================================================
-- ECOMANSONI Livestream Platform — Модераторы прямого эфира
-- Миграция: 20260308000007_livestream_moderators.sql
-- Назначение: Гранулярные права модераторов для конкретной livestream-сессии
--
-- Архитектурные решения:
--   - permissions TEXT[]: гранулярная модель, не роли. Текущие допустимые права:
--     delete_message, ban_user, pin_message, manage_questions.
--     Расширяется без миграции (app-level validation).
--   - UNIQUE (session_id, user_id): модератор назначается однократно.
--   - granted_by: аудит-trail — кто назначил модератора (хост или суперхост).
--   - RLS: хост управляет, модераторы видят свою запись и список коллег.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.live_moderators (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   BIGINT      NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  permissions  TEXT[]      NOT NULL DEFAULT ARRAY['delete_message', 'ban_user'],
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (session_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Документирование колонок
-- ---------------------------------------------------------------------------
COMMENT ON TABLE  public.live_moderators               IS 'Модераторы прямого эфира с гранулярными правами';
COMMENT ON COLUMN public.live_moderators.id            IS 'UUID PK';
COMMENT ON COLUMN public.live_moderators.session_id    IS 'FK → live_sessions.id (BIGINT)';
COMMENT ON COLUMN public.live_moderators.user_id       IS 'Назначенный модератор';
COMMENT ON COLUMN public.live_moderators.granted_by    IS 'Хост, назначивший модератора';
COMMENT ON COLUMN public.live_moderators.permissions   IS 'Массив разрешений: delete_message|ban_user|pin_message|manage_questions';
COMMENT ON COLUMN public.live_moderators.created_at    IS 'Время назначения модератора';

-- ---------------------------------------------------------------------------
-- Индексы
-- ---------------------------------------------------------------------------

-- Проверка модераторских прав при действиях в чате
CREATE INDEX IF NOT EXISTS idx_live_moderators_session_user
  ON public.live_moderators (session_id, user_id);

-- Список сессий, где пользователь — модератор
CREATE INDEX IF NOT EXISTS idx_live_moderators_user_id
  ON public.live_moderators (user_id);

-- GIN для проверки конкретного permission: 'delete_message' = ANY(permissions)
CREATE INDEX IF NOT EXISTS idx_live_moderators_permissions_gin
  ON public.live_moderators USING GIN (permissions);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.live_moderators ENABLE ROW LEVEL SECURITY;

-- Хост видит всех модераторов своей сессии
CREATE POLICY "live_moderators_select_host"
  ON public.live_moderators
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  );

-- Модератор видит других модераторов той же сессии (для координации)
CREATE POLICY "live_moderators_select_moderator"
  ON public.live_moderators
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_moderators lm2
      WHERE lm2.session_id = session_id
        AND lm2.user_id = auth.uid()
    )
  );

-- Только хост назначает модераторов
CREATE POLICY "live_moderators_insert_host"
  ON public.live_moderators
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
    AND auth.uid() = granted_by
  );

-- Хост обновляет права (расширяет/сужает permissions)
CREATE POLICY "live_moderators_update_host"
  ON public.live_moderators
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  );

-- Хост снимает модератора
CREATE POLICY "live_moderators_delete_host"
  ON public.live_moderators
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  );
