-- =============================================================================
-- 20260319110000_unify_call_tables_v1.sql
-- Унификация двух несвязанных систем звонков: video_calls → calls
--
-- Проблема: в БД существуют две независимые таблицы с одинаковой семантикой:
--   • public.calls — создана первой, используется DB RPCs (call_create_v1 и др.)
--   • public.video_calls — создана позже, используется всем клиентским кодом
--   Нет синхронизации, нет единого источника истины.
--
-- Решение:
--   1. Добавить в calls недостающие колонки для полной совместимости с
--      клиентским кодом (duration_seconds, ice_restart_count, updated_at,
--      calls_v2_room_id, calls_v2_join_token, signaling_data уже есть).
--   2. Перенести данные из video_calls в calls (mapping статусов).
--   3. Переименовать video_calls в video_calls_legacy (не удалять — у неё FK).
--   4. Создать view public.video_calls над calls с псевдонимами колонок.
--   5. Добавить INSTEAD OF триггеры для записи через view.
--
-- Откат: возможен вручную через video_calls_legacy.
-- =============================================================================

BEGIN;

-- ─── 1. Добавить недостающие колонки в calls ──────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS duration_seconds  INTEGER,
  ADD COLUMN IF NOT EXISTS ice_restart_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS calls_v2_room_id   TEXT,
  ADD COLUMN IF NOT EXISTS calls_v2_join_token TEXT;

-- Расширяем CHECK-статус: добавляем 'answered' как синоним 'active' в status
-- (видео-клиент пишет 'answered'; DB RPCs ожидают 'active' — сохраняем оба)
DO $$
BEGIN
  ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.calls
    ADD CONSTRAINT calls_status_check
    CHECK (status IN ('calling', 'ringing', 'active', 'answered', 'ended', 'declined', 'missed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Индексы для скорости (идемпотентны)
CREATE INDEX IF NOT EXISTS idx_calls_calls_v2_room_id
  ON public.calls (calls_v2_room_id) WHERE calls_v2_room_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calls_updated_at
  ON public.calls (updated_at);

-- Триггер updated_at для calls (если ещё нет)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_calls_updated_at'
      AND event_object_schema = 'public'
      AND event_object_table = 'calls'
  ) THEN
    CREATE TRIGGER update_calls_updated_at
    BEFORE UPDATE ON public.calls
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ─── 2. Перенести данные из video_calls в calls ────────────────────────────────
-- Вставляем только строки, которых ещё нет в calls (по id).

INSERT INTO public.calls (
  id, caller_id, callee_id, conversation_id,
  call_type, status,
  started_at, ended_at, duration_seconds,
  ice_restart_count, created_at, updated_at,
  calls_v2_room_id, calls_v2_join_token
)
SELECT
  vc.id,
  vc.caller_id,
  vc.callee_id,
  vc.conversation_id,
  CASE
    WHEN vc.call_type = 'voice' THEN 'voice'
    WHEN vc.call_type = 'video' THEN 'video'
    ELSE 'audio'
  END AS call_type,
  CASE
    WHEN vc.status = 'answered' THEN 'answered'  -- kept as-is; view maps back
    WHEN vc.status = 'ringing'  THEN 'ringing'
    WHEN vc.status = 'declined' THEN 'declined'
    WHEN vc.status = 'ended'    THEN 'ended'
    WHEN vc.status = 'missed'   THEN 'missed'
    ELSE 'ended'
  END AS status,
  vc.started_at,
  vc.ended_at,
  vc.duration_seconds,
  COALESCE(vc.ice_restart_count, 0),
  vc.created_at,
  vc.updated_at,
  vc.calls_v2_room_id,
  vc.calls_v2_join_token
FROM public.video_calls vc
WHERE NOT EXISTS (
  SELECT 1 FROM public.calls c WHERE c.id = vc.id
);

-- ─── 3. Переименовать video_calls → video_calls_legacy ────────────────────────
-- NOT DROP: таблица video_call_signals имеет FK на video_calls.
-- Переименование сохраняет FK цепочку; view затем воссоздаёт имя video_calls.

ALTER TABLE IF EXISTS public.video_calls RENAME TO video_calls_legacy;

-- Переименуем индексы, иначе CREATE VIEW ниже не конфликтует с именами
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'video_calls_legacy'
  LOOP
    EXECUTE format('ALTER INDEX IF EXISTS public.%I RENAME TO %I',
      r.indexname,
      replace(r.indexname, 'video_calls', 'video_calls_legacy_'));
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── 4. Создать view video_calls над calls ─────────────────────────────────────
-- View проецирует колонки calls на имена, которые ожидает клиентский код.

CREATE VIEW public.video_calls AS
SELECT
  c.id,
  c.caller_id,
  c.callee_id,
  c.conversation_id,
  c.call_type,
  c.status,
  c.started_at,
  c.ended_at,
  c.duration_seconds,
  c.ice_restart_count,
  c.signaling_data,
  c.created_at,
  c.updated_at,
  c.calls_v2_room_id,
  c.calls_v2_join_token
FROM public.calls c;

-- RLS на view: Postgres применяет RLS вызывающей функции/view; убедимся что
-- security_invoker = true чтобы RLS политики calls применялись к view
ALTER VIEW public.video_calls SET (security_invoker = true);

-- ─── 5. INSTEAD OF триггеры: INSERT / UPDATE / DELETE через view ───────────────

CREATE OR REPLACE FUNCTION public.video_calls_view_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.calls (
    id, caller_id, callee_id, conversation_id,
    call_type, status,
    started_at, ended_at, duration_seconds,
    ice_restart_count, updated_at,
    calls_v2_room_id, calls_v2_join_token, signaling_data
  )
  VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    NEW.caller_id,
    NEW.callee_id,
    NEW.conversation_id,
    COALESCE(NEW.call_type, 'audio'),
    COALESCE(NEW.status, 'ringing'),
    NEW.started_at,
    NEW.ended_at,
    NEW.duration_seconds,
    COALESCE(NEW.ice_restart_count, 0),
    COALESCE(NEW.updated_at, now()),
    NEW.calls_v2_room_id,
    NEW.calls_v2_join_token,
    NEW.signaling_data
  )
  RETURNING id INTO NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.video_calls_view_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.calls
  SET
    status              = COALESCE(NEW.status, OLD.status),
    started_at          = COALESCE(NEW.started_at, OLD.started_at),
    ended_at            = COALESCE(NEW.ended_at, OLD.ended_at),
    duration_seconds    = COALESCE(NEW.duration_seconds, OLD.duration_seconds),
    ice_restart_count   = COALESCE(NEW.ice_restart_count, OLD.ice_restart_count),
    calls_v2_room_id    = COALESCE(NEW.calls_v2_room_id, OLD.calls_v2_room_id),
    calls_v2_join_token = COALESCE(NEW.calls_v2_join_token, OLD.calls_v2_join_token),
    signaling_data      = COALESCE(NEW.signaling_data, OLD.signaling_data),
    updated_at          = now()
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.video_calls_view_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Soft-delete: mark as ended instead of hard DELETE to preserve history
  UPDATE public.calls
  SET status = 'ended', ended_at = COALESCE(ended_at, now()), updated_at = now()
  WHERE id = OLD.id AND status NOT IN ('ended', 'missed', 'declined');
  RETURN OLD;
END;
$$;

CREATE TRIGGER video_calls_instead_of_insert
  INSTEAD OF INSERT ON public.video_calls
  FOR EACH ROW EXECUTE FUNCTION public.video_calls_view_insert();

CREATE TRIGGER video_calls_instead_of_update
  INSTEAD OF UPDATE ON public.video_calls
  FOR EACH ROW EXECUTE FUNCTION public.video_calls_view_update();

CREATE TRIGGER video_calls_instead_of_delete
  INSTEAD OF DELETE ON public.video_calls
  FOR EACH ROW EXECUTE FUNCTION public.video_calls_view_delete();

-- ─── 6. Realtime: добавить calls в publication (если ещё нет) ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;
END $$;

-- Гранты на view для ролей (наследует от calls благодаря security_invoker)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_calls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_calls TO service_role;

-- ─── 7. Обновить RPCs: grant на calls ─────────────────────────────────────────
-- check_missed_calls теперь должна работать с calls вместо video_calls
CREATE OR REPLACE FUNCTION public.check_missed_calls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.calls
  SET status = 'missed', ended_at = now(), updated_at = now()
  WHERE status = 'ringing'
    AND created_at < now() - interval '60 seconds';
END;
$$;

REVOKE ALL ON FUNCTION public.check_missed_calls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_missed_calls() TO service_role;

COMMIT;
