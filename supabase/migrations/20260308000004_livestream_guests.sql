-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- =============================================================================
-- ECOMANSONI Livestream Platform — Live Guests (Совместные эфиры / Live Rooms)
-- Миграция: 20260308000004_livestream_guests.sql
-- Назначение: Управление гостями совместных эфиров (Live Rooms, до 4 участников)
--
-- Архитектурные решения:
--   - session_id BIGINT (live_sessions.id = BIGSERIAL) — критически важно.
--   - slot_position 1–4: физические слоты в 2x2 видеогриде Live Room.
--   - UNIQUE (session_id, user_id): один пользователь — одна запись на сессию.
--     Повторные приглашения — UPDATE, не INSERT (идемпотентность).
--   - status state-machine: invited → accepted/declined; accepted → joined → left/kicked.
--   - RLS: хост видит всех, гость видит только себя, зрители видят только joined.
--   - Index (session_id, status) — горячий путь: получить список активных гостей.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.live_guests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     BIGINT      NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status         TEXT        NOT NULL DEFAULT 'invited'
                               CHECK (status IN ('invited', 'accepted', 'declined', 'joined', 'left', 'kicked')),
  invited_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at      TIMESTAMPTZ,
  left_at        TIMESTAMPTZ,
  slot_position  INTEGER     CHECK (slot_position BETWEEN 1 AND 4),

  UNIQUE (session_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Документирование колонок
-- ---------------------------------------------------------------------------
COMMENT ON TABLE  public.live_guests                IS 'Гости совместных эфиров (Live Rooms) — до 4 слотов';
COMMENT ON COLUMN public.live_guests.id             IS 'UUID PK записи';
COMMENT ON COLUMN public.live_guests.session_id     IS 'FK → live_sessions.id (BIGINT)';
COMMENT ON COLUMN public.live_guests.user_id        IS 'FK → auth.users.id — приглашённый пользователь';
COMMENT ON COLUMN public.live_guests.status         IS 'Состояние стейт-машины: invited→accepted/declined→joined→left/kicked';
COMMENT ON COLUMN public.live_guests.invited_at     IS 'Время отправки приглашения хостом';
COMMENT ON COLUMN public.live_guests.joined_at      IS 'Фактическое время подключения видеопотока';
COMMENT ON COLUMN public.live_guests.left_at        IS 'Время отключения (добровольного или kicked)';
COMMENT ON COLUMN public.live_guests.slot_position  IS 'Позиция в 2x2 видеогриде (1–4); NULL до join';

-- ---------------------------------------------------------------------------
-- Индексы
-- ---------------------------------------------------------------------------

-- Горячий путь: активные гости сессии (joined)
CREATE INDEX IF NOT EXISTS idx_live_guests_session_status
  ON public.live_guests (session_id, status);

-- Запросы истории приглашений по пользователю
CREATE INDEX IF NOT EXISTS idx_live_guests_user_status
  ON public.live_guests (user_id, status);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.live_guests ENABLE ROW LEVEL SECURITY;

-- Хост сессии видит всех гостей своей сессии
CREATE POLICY "live_guests_select_host"
  ON public.live_guests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  );

-- Гость видит только свою запись
CREATE POLICY "live_guests_select_self"
  ON public.live_guests
  FOR SELECT
  USING (auth.uid() = user_id);

-- Зрители видят только joined гостей (публичная информация о видеогриде)
CREATE POLICY "live_guests_select_viewers_joined"
  ON public.live_guests
  FOR SELECT
  USING (status = 'joined');

-- Только хост может приглашать гостей (INSERT)
CREATE POLICY "live_guests_insert_host"
  ON public.live_guests
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  );

-- Хост может менять статус (kick, update slot) и гость может принять/отклонить
CREATE POLICY "live_guests_update_host_or_self"
  ON public.live_guests
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  );

-- Хост может удалять записи о гостях
CREATE POLICY "live_guests_delete_host"
  ON public.live_guests
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  );
