-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- =============================================================================
-- ECOMANSONI Livestream Platform — Баны в чате прямого эфира
-- Миграция: 20260308000006_livestream_chat_bans.sql
-- Назначение: Per-session баны пользователей в чате (временные и постоянные)
--
-- Архитектурные решения:
--   - UNIQUE (session_id, user_id): один активный бан на пользователя за сессию.
--     Повторный бан обновляет expires_at (ON CONFLICT DO UPDATE).
--   - duration_minutes NULL = permanent ban на время сессии.
--   - expires_at рассчитывается триггером при INSERT: created_at + duration_minutes.
--   - check_chat_ban() RPC учитывает expires_at для истёкших временных банов.
--   - banned_by не обязан быть хостом — модераторы (live_moderators) тоже банят.
--   - RLS: только хост и модераторы (через live_moderators) могут управлять банами.
--     Читать бан может сам забаненный (чтобы показать ему причину).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.live_chat_bans (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       BIGINT      NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_by        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason           TEXT,
  duration_minutes INTEGER,    -- NULL = permanent на эту сессию
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ, -- рассчитывается триггером

  UNIQUE (session_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Документирование колонок
-- ---------------------------------------------------------------------------
COMMENT ON TABLE  public.live_chat_bans                  IS 'Баны пользователей в чате конкретного эфира';
COMMENT ON COLUMN public.live_chat_bans.id               IS 'UUID PK записи бана';
COMMENT ON COLUMN public.live_chat_bans.session_id       IS 'FK → live_sessions.id (BIGINT)';
COMMENT ON COLUMN public.live_chat_bans.user_id          IS 'Забаненный пользователь';
COMMENT ON COLUMN public.live_chat_bans.banned_by        IS 'Кто выдал бан (хост или модератор)';
COMMENT ON COLUMN public.live_chat_bans.reason           IS 'Причина бана (отображается пользователю)';
COMMENT ON COLUMN public.live_chat_bans.duration_minutes IS 'Длительность в минутах; NULL = до конца сессии';
COMMENT ON COLUMN public.live_chat_bans.created_at       IS 'Время выдачи бана';
COMMENT ON COLUMN public.live_chat_bans.expires_at       IS 'Вычисляемое время истечения: created_at + duration_minutes * interval; NULL для постоянных';

-- ---------------------------------------------------------------------------
-- Индексы
-- ---------------------------------------------------------------------------

-- Горячий путь: проверка бана при отправке сообщения
CREATE INDEX IF NOT EXISTS idx_live_chat_bans_session_user
  ON public.live_chat_bans (session_id, user_id);

-- Для RPC get_active_bans по сессии
CREATE INDEX IF NOT EXISTS idx_live_chat_bans_session_id
  ON public.live_chat_bans (session_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.live_chat_bans ENABLE ROW LEVEL SECURITY;

-- Хост сессии видит все баны
CREATE POLICY "live_chat_bans_select_host"
  ON public.live_chat_bans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  );

-- Модератор видит баны своей сессии
CREATE POLICY "live_chat_bans_select_moderator"
  ON public.live_chat_bans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_moderators lm
      WHERE lm.session_id = session_id
        AND lm.user_id = auth.uid()
    )
  );

-- Забаненный видит свою запись (причину)
CREATE POLICY "live_chat_bans_select_self"
  ON public.live_chat_bans
  FOR SELECT
  USING (auth.uid() = user_id);

-- Хост может банить
CREATE POLICY "live_chat_bans_insert_host"
  ON public.live_chat_bans
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
    AND auth.uid() = banned_by
  );

-- Модератор с правом ban_user может банить
CREATE POLICY "live_chat_bans_insert_moderator"
  ON public.live_chat_bans
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_moderators lm
      WHERE lm.session_id = session_id
        AND lm.user_id = auth.uid()
        AND 'ban_user' = ANY(lm.permissions)
    )
    AND auth.uid() = banned_by
  );

-- Хост может снять бан (DELETE)
CREATE POLICY "live_chat_bans_delete_host"
  ON public.live_chat_bans
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  );

-- Модератор с ban_user может снять бан
CREATE POLICY "live_chat_bans_delete_moderator"
  ON public.live_chat_bans
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.live_moderators lm
      WHERE lm.session_id = session_id
        AND lm.user_id = auth.uid()
        AND 'ban_user' = ANY(lm.permissions)
    )
  );
