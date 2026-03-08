 -- =============================================================================
-- ECOMANSONI Livestream Platform — Расширение таблицы live_viewers
-- Миграция: 20260308000012_livestream_viewers_extend.sql
-- Назначение: Добавление недостающих колонок и уникального ограничения
--             в таблицу live_viewers для поддержки LiveKit webhook интеграции.
--
-- Контекст:
--   Исходная таблица live_viewers (20260224300000) имеет минимальную схему.
--   Gateway и edge functions требуют:
--     - is_active (BOOLEAN): отслеживание текущего присутствия в LiveKit-комнате
--     - participant_sid (TEXT): LiveKit SID участника (для disconnect correlation)
--     - UNIQUE (session_id, viewer_id): необходим для UPSERT onConflict
--
-- Безопасность:
--   - ADD COLUMN IF NOT EXISTS — идемпотентно, безопасно для повторного применения
--   - UNIQUE INDEX IF NOT EXISTS — не блокирует таблицу если уже существует
--   - Существующие данные: is_active=true по дефолту (ретроактивно корректно,
--     т.к. записи без left_at считаются активными)
-- =============================================================================

-- is_active: флаг текущего присутствия в LiveKit-комнате.
-- true  = participant joined, ещё не покинул комнату.
-- false = participant left (left_at установлен).
-- Обновляется gateway при participant_left webhook.
ALTER TABLE public.live_viewers
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.live_viewers.is_active
  IS 'true = зритель в комнате, false = покинул (left_at установлен)';

-- participant_sid: LiveKit SID участника.
-- Используется для корреляции между идентификатором пользователя и track SID.
-- NULL = участник ещё не подключился к LiveKit (только зарегистрирован).
ALTER TABLE public.live_viewers
  ADD COLUMN IF NOT EXISTS participant_sid TEXT;

COMMENT ON COLUMN public.live_viewers.participant_sid
  IS 'LiveKit participant SID — для трек-корреляции и egress-идентификации';

-- UNIQUE INDEX: один зритель — одна активная запись на сессию.
-- Необходим для UPSERT с onConflict: 'session_id,viewer_id'.
-- Используется в tokens.ts и live-webhook edge function.
-- CONCURRENTLY не применяем — миграция выполняется до первого запуска сервиса.
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_viewers_session_viewer_unique
  ON public.live_viewers (session_id, viewer_id);

COMMENT ON INDEX public.idx_live_viewers_session_viewer_unique
  IS 'Уникальность (session_id, viewer_id) — основа UPSERT семантики при регистрации зрителя';

-- Обновляем существующие записи у которых left_at IS NOT NULL но is_active=true
-- (ретроактивная корректность для случаев downgrade/rollback)
UPDATE public.live_viewers
  SET is_active = false
  WHERE left_at IS NOT NULL
    AND is_active = true;
