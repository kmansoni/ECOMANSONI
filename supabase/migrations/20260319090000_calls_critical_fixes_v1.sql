-- =============================================================================
-- 20260319090000_calls_critical_fixes_v1.sql
-- Исправление критических и высоких проблем модуля звонков
-- Аудит: CALLS_MODULE_AUDIT_REPORT.md
-- Автор: security-hardening pass 2026-03-19
-- =============================================================================

BEGIN;

-- =============================================================================
-- FIX D-01 (CRITICAL): call_type CHECK constraint не принимает 'voice'
-- Проблема: оригинальная таблица calls имеет CHECK (call_type IN ('audio','video')),
--   но RPC call_create_v1() принимает 'voice'/'video'. При вставке с call_type='voice'
--   происходит нарушение CHECK constraint → ошибка 23514.
-- Решение: расширить CHECK constraint, добавив 'voice'; функцию тоже исправить
--   чтобы принимала все три значения ('audio','voice','video').
-- =============================================================================

DO $$
BEGIN
  -- Удаляем старый constraint если существует (оба возможных имени)
  ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_call_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  -- Добавляем расширенный constraint с идемпотентным именем
  ALTER TABLE public.calls
    ADD CONSTRAINT calls_call_type_check
    CHECK (call_type IN ('audio', 'voice', 'video'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Исправляем функцию call_create_v1: принимаем 'audio', 'voice', 'video';
-- добавляем advisory lock для атомарного busy-check (fix D-02)
CREATE OR REPLACE FUNCTION public.call_create_v1(
  p_callee_id      uuid,
  p_call_type      text,
  p_signaling_data jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call_id  uuid;
  v_caller_id uuid := auth.uid();
  v_busy     boolean;
BEGIN
  -- Базовая валидация
  IF p_callee_id IS NULL OR p_callee_id = v_caller_id THEN
    RAISE EXCEPTION 'invalid_callee' USING errcode = '22023';
  END IF;

  -- FIX D-01: принимаем 'audio', 'voice' и 'video'
  IF p_call_type NOT IN ('audio', 'voice', 'video') THEN
    RAISE EXCEPTION 'invalid_call_type' USING errcode = '22023';
  END IF;

  -- FIX D-02 (CRITICAL): advisory lock устраняет race condition busy-check.
  -- Два одновременных вызова для одного callee_id будут сериализованы.
  -- hashtext() детерминирован в пределах одной версии PG; коллизии возможны,
  -- но вероятность пренебрежимо мала для данного use-case.
  PERFORM pg_advisory_xact_lock(hashtext('call_create:' || p_callee_id::text));

  -- Busy-check ПОСЛЕ блокировки (теперь атомарен)
  SELECT EXISTS(
    SELECT 1 FROM public.calls
    WHERE (caller_id = p_callee_id OR callee_id = p_callee_id)
      AND state IN ('ringing', 'active')
  ) INTO v_busy;

  IF v_busy THEN
    RAISE EXCEPTION 'callee_busy' USING errcode = '42501';
  END IF;

  -- Вставляем звонок
  INSERT INTO public.calls (caller_id, callee_id, call_type, signaling_data)
  VALUES (v_caller_id, p_callee_id, p_call_type, p_signaling_data)
  RETURNING id INTO v_call_id;

  -- Публикуем событие
  PERFORM public.publish_call_event(
    v_call_id,
    'call.created',
    jsonb_build_object(
      'call_id',   v_call_id,
      'caller_id', v_caller_id,
      'callee_id', p_callee_id,
      'call_type', p_call_type
    )
  );

  RETURN v_call_id;
END;
$$;

-- =============================================================================
-- FIX D-03 (CRITICAL): REVOKE authenticated → call RPCs заблокированы
-- Миграция 20260313184432 отозвала EXECUTE у role authenticated для всех call_*
-- RPCs. Клиент вызывает их напрямую через supabase.rpc(...) с JWT-токеном
-- authenticated. Без GRANT вызовы возвращают ошибку permission denied.
-- Решение: явно вернуть GRANT EXECUTE на все клиентские RPC.
-- =============================================================================

-- call_create_v1 — клиентский RPC
GRANT EXECUTE ON FUNCTION public.call_create_v1(uuid, text, jsonb) TO authenticated;

-- call_accept_v1 — клиентский RPC
GRANT EXECUTE ON FUNCTION public.call_accept_v1(uuid, jsonb) TO authenticated;

-- call_decline_v1 — клиентский RPC (параметра signaling_data нет, сигнатура uuid)
GRANT EXECUTE ON FUNCTION public.call_decline_v1(uuid) TO authenticated;

-- call_cancel_v1 — клиентский RPC
GRANT EXECUTE ON FUNCTION public.call_cancel_v1(uuid) TO authenticated;

-- call_end_v1 — клиентский RPC
GRANT EXECUTE ON FUNCTION public.call_end_v1(uuid, text) TO authenticated;

-- call_process_timeouts_v1 остаётся service_role (вызывается фоновым воркером)
-- check_missed_calls остаётся service_role

-- =============================================================================
-- FIX D-05 (HIGH): video_calls.status нет CHECK constraint
-- Таблица создана с комментарием в коде, но без фактического DB constraint.
-- Любое произвольное значение status проходит без ошибки → нарушение инварианта
-- конечного автомата. Добавляем CHECK идемпотентно.
-- =============================================================================

DO $$
BEGIN
  ALTER TABLE public.video_calls
    ADD CONSTRAINT video_calls_status_check
    CHECK (status IN ('ringing', 'answered', 'declined', 'ended', 'missed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Также добавляем CHECK constraint на call_type в video_calls (нет в оригинале)
DO $$
BEGIN
  ALTER TABLE public.video_calls
    ADD CONSTRAINT video_calls_call_type_check
    CHECK (call_type IN ('audio', 'video', 'voice'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- FIX D-07 (HIGH): нет FK constraints на auth.users
-- caller_id / callee_id — uuid-поля без ссылочной целостности.
-- При удалении пользователя из auth.users записи звонков «висят» с битыми ID.
-- Решение: добавить FK с ON DELETE SET NULL / ON DELETE CASCADE в зависимости
-- от бизнес-требований. Используем DO-блок с проверкой существования, чтобы
-- миграция была идемпотентна.
-- ВНИМАНИЕ: FK на auth.users требует прав на схему auth; в Supabase это работает
-- т.к. service_role имеет доступ. Используем ON DELETE SET NULL чтобы не потерять
-- историю звонков при удалении аккаунта (GDPR-safe: ID анонимизируется,
-- данные звонка остаются для биллинга/аудита).
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'calls_caller_id_fkey'
      AND table_schema = 'public'
      AND table_name = 'calls'
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_caller_id_fkey
      FOREIGN KEY (caller_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'calls_callee_id_fkey'
      AND table_schema = 'public'
      AND table_name = 'calls'
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_callee_id_fkey
      FOREIGN KEY (callee_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'video_calls_caller_id_fkey'
      AND table_schema = 'public'
      AND table_name = 'video_calls'
  ) THEN
    ALTER TABLE public.video_calls
      ADD CONSTRAINT video_calls_caller_id_fkey
      FOREIGN KEY (caller_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'video_calls_callee_id_fkey'
      AND table_schema = 'public'
      AND table_name = 'video_calls'
  ) THEN
    ALTER TABLE public.video_calls
      ADD CONSTRAINT video_calls_callee_id_fkey
      FOREIGN KEY (callee_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

-- =============================================================================
-- FIX D-06 (HIGH): двойная публикация missed-событий в call_process_timeouts_v1
-- Проблема: второй INSERT выбирает все `state='missed' AND ended_at >= now()-5s`
-- что включает звонки из предыдущих запусков функции (если они попали в окно
-- 5 секунд). При высокой частоте вызовов (каждую секунду) → дублирующиеся
-- события call.missed в delivery_outbox.
-- Решение: использовать RETURNING из CTE чтобы публиковать только те ID,
-- которые были реально обновлены текущим вызовом.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.call_process_timeouts_v1()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- CTE с RETURNING гарантирует публикацию только для реально обновлённых строк.
  -- FOR UPDATE SKIP LOCKED: параллельные воркеры не блокируют друг друга.
  WITH expired AS (
    SELECT c.id
    FROM public.calls c
    WHERE c.state = 'ringing'
      AND c.expires_at < now()
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.calls c
    SET state      = 'missed',
        ended_at   = now(),
        end_reason = 'timeout'
    FROM expired e
    WHERE c.id = e.id
    RETURNING c.id
  )
  -- Публикуем события только для строк из текущего UPDATE (нет дублей)
  INSERT INTO public.delivery_outbox (topic, aggregate_id, event_type, payload)
  SELECT
    'call',
    u.id,
    'call.missed',
    jsonb_build_object('call_id', u.id, 'missed_at', now())
  FROM updated u;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

-- Восстанавливаем права (hardening migration сбросила их на service_role)
REVOKE ALL ON FUNCTION public.call_process_timeouts_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.call_process_timeouts_v1() TO service_role;

-- =============================================================================
-- FIX D-11 (MEDIUM): updated_at в calls может быть NULL
-- Колонка добавлена через ADD COLUMN IF NOT EXISTS с DEFAULT now() в миграции
-- 20260224, но существующие строки получили NULL (DEFAULT применяется только
-- к новым вставкам, не к существующим строкам). Триггер set_calls_updated_at
-- заполняет поле при UPDATE, но строки без единственного UPDATE остаются NULL.
-- Решение: бэкфилл + SET NOT NULL.
-- =============================================================================

-- Бэкфилл: используем created_at как наилучшее приближение для старых строк
UPDATE public.calls
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Теперь безопасно выставить NOT NULL
ALTER TABLE public.calls
  ALTER COLUMN updated_at SET NOT NULL;

-- Убеждаемся что DEFAULT корректен (на случай если сброшен)
ALTER TABLE public.calls
  ALTER COLUMN updated_at SET DEFAULT now();

-- =============================================================================
-- FIX D-12 (MEDIUM): check_missed_calls() без SKIP LOCKED
-- Оригинальная функция делает plain UPDATE без блокировки. При параллельном
-- запуске (pg_cron + ручной вызов) оба процесса могут выбрать одни и те же
-- строки → конкурирующие UPDATE → deadlock или двойное обновление.
-- Решение: переписываем через CTE с FOR UPDATE SKIP LOCKED.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_missed_calls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- FOR UPDATE SKIP LOCKED: параллельные вызовы пропускают уже заблокированные строки
  WITH ringing_expired AS (
    SELECT vc.id
    FROM public.video_calls vc
    WHERE vc.status = 'ringing'
      AND vc.created_at < now() - interval '60 seconds'
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.video_calls vc
  SET status   = 'missed',
      ended_at = now()
  FROM ringing_expired re
  WHERE vc.id = re.id;
END;
$$;

-- check_missed_calls вызывается фоновым воркером — права остаются service_role
REVOKE ALL ON FUNCTION public.check_missed_calls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_missed_calls() TO service_role;

-- =============================================================================
-- Итоговая верификация (выполняется внутри транзакции — если что-то не так,
-- весь блок откатится)
-- =============================================================================

DO $$
DECLARE
  v_constraint_count integer;
BEGIN
  -- Убеждаемся что call_type CHECK добавлен в calls
  SELECT COUNT(*) INTO v_constraint_count
  FROM information_schema.table_constraints
  WHERE constraint_name = 'calls_call_type_check'
    AND table_schema = 'public'
    AND table_name = 'calls';

  IF v_constraint_count = 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED: calls_call_type_check не существует';
  END IF;

  -- Убеждаемся что video_calls_status_check добавлен
  SELECT COUNT(*) INTO v_constraint_count
  FROM information_schema.table_constraints
  WHERE constraint_name = 'video_calls_status_check'
    AND table_schema = 'public'
    AND table_name = 'video_calls';

  IF v_constraint_count = 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED: video_calls_status_check не существует';
  END IF;

  -- Убеждаемся что updated_at NOT NULL
  IF EXISTS (
    SELECT 1 FROM public.calls WHERE updated_at IS NULL LIMIT 1
  ) THEN
    RAISE EXCEPTION 'VERIFY FAILED: calls.updated_at содержит NULL после бэкфилла';
  END IF;

  RAISE NOTICE 'calls_critical_fixes_v1: все проверки пройдены успешно';
END $$;

COMMIT;
