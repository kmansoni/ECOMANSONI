-- =============================================================================
-- ECOMANSONI Livestream Platform — RPC-функции и Триггеры
-- Миграция: 20260308000011_livestream_functions_triggers.sql
-- Назначение: Серверная бизнес-логика livestream-подсистемы
--
-- Архитектурные решения:
--   - Все функции SECURITY DEFINER с явным search_path = public, pg_catalog.
--     Без этого злоумышленник может shadowing через враждебные схемы.
--   - increment/decrement — FOR UPDATE advisory lock через pg_advisory_xact_lock
--     для предотвращения race condition при одновременных join/leave (10k+ зрителей).
--   - rotate_stream_key: единственная транзакция — деактивирует старые, создаёт новый.
--     Возвращает новый ключ (вызывающая сторона — только сам пользователь через RLS).
--   - check_chat_ban: учитывает expires_at (временные баны), возвращает BOOLEAN.
--     Не раскрывает причину бана анонимным клиентам.
--   - Триггер на INSERT live_viewers: вызывает increment_viewer_count.
--   - Триггер на DELETE/UPDATE left_at live_viewers: вызывает decrement_viewer_count.
--   - Триггер на live_sessions.status → 'ended': инициирует compute_session_analytics.
--   - Триггер на INSERT live_chat_bans: устанавливает expires_at.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. get_active_livestreams(p_limit, p_offset)
-- ---------------------------------------------------------------------------
-- Возвращает список активных стримов с информацией о стримере.
-- Используется в discovery feed (authenticated + anon).
-- Защита: возвращает только is_public=true и status='live'.
-- Безопасность: не раскрывает livekit_room_sid / stream_key_id анонимам.

CREATE OR REPLACE FUNCTION public.get_active_livestreams(
  p_limit  INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  session_id         BIGINT,
  title              TEXT,
  description        TEXT,
  category           TEXT,
  thumbnail_url      TEXT,
  viewer_count       INT,
  creator_id         UUID,
  creator_username   TEXT,
  creator_avatar_url TEXT,
  started_at         TIMESTAMPTZ,
  tags               TEXT[],
  language           TEXT,
  is_mature_content  BOOLEAN,
  ingest_protocol    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
BEGIN
  -- Защита от DoS через огромный LIMIT
  IF p_limit > 100 THEN
    p_limit := 100;
  END IF;
  IF p_limit < 1 THEN
    p_limit := 20;
  END IF;
  IF p_offset < 0 THEN
    p_offset := 0;
  END IF;

  RETURN QUERY
  SELECT
    ls.id              AS session_id,
    ls.title,
    ls.description,
    ls.category,
    ls.thumbnail_url,
    ls.viewer_count_current AS viewer_count,
    ls.creator_id,
    p.username         AS creator_username,
    p.avatar_url       AS creator_avatar_url,
    ls.started_at,
    ls.tags,
    ls.language,
    ls.is_mature_content,
    ls.ingest_protocol
  FROM public.live_sessions ls
  JOIN public.profiles p ON p.id = ls.creator_id
  WHERE ls.status = 'live'
    AND ls.is_public = true
    AND ls.moderation_status IN ('green', 'borderline')
  ORDER BY ls.viewer_count_current DESC, ls.started_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_active_livestreams(INT, INT)
  IS 'Discovery feed активных публичных стримов, отсортированных по числу зрителей';

-- ---------------------------------------------------------------------------
-- 2. get_livestream_stats(p_session_id)
-- ---------------------------------------------------------------------------
-- Возвращает статистику стрима — только хосту или всем (по is_public).
-- Объединяет live_sessions + live_session_analytics в один запрос.

CREATE OR REPLACE FUNCTION public.get_livestream_stats(
  p_session_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
DECLARE
  v_result JSONB;
  v_creator_id UUID;
  v_is_public BOOLEAN;
BEGIN
  -- Читаем базовые флаги
  SELECT creator_id, is_public
  INTO v_creator_id, v_is_public
  FROM public.live_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % not found', p_session_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Только хост или публичный стрим
  IF NOT v_is_public AND v_creator_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied to session stats'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'session_id',             ls.id,
    'status',                 ls.status,
    'viewer_count_current',   ls.viewer_count_current,
    'viewer_count_peak',      ls.viewer_count_peak,
    'message_count',          ls.message_count,
    'started_at',             ls.started_at,
    'ended_at',               ls.ended_at,
    'actual_start_at',        ls.actual_start_at,
    'actual_end_at',          ls.actual_end_at,
    'max_viewers',            ls.max_viewers,
    'total_viewers',          ls.total_viewers,
    -- analytics (может быть NULL если ещё не вычислена)
    'analytics',              CASE
                                WHEN lsa.session_id IS NOT NULL THEN
                                  jsonb_build_object(
                                    'peak_viewers',             lsa.peak_viewers,
                                    'total_unique_viewers',     lsa.total_unique_viewers,
                                    'total_chat_messages',      lsa.total_chat_messages,
                                    'total_reactions',          lsa.total_reactions,
                                    'total_donations_amount',   lsa.total_donations_amount,
                                    'total_donations_count',    lsa.total_donations_count,
                                    'total_gifts_count',        lsa.total_gifts_count,
                                    'avg_watch_duration_sec',   lsa.avg_watch_duration_sec,
                                    'new_followers',            lsa.new_followers_during_stream,
                                    'shares_count',             lsa.shares_count,
                                    'computed_at',              lsa.computed_at
                                  )
                                ELSE NULL
                              END
  )
  INTO v_result
  FROM public.live_sessions ls
  LEFT JOIN public.live_session_analytics lsa ON lsa.session_id = ls.id
  WHERE ls.id = p_session_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_livestream_stats(BIGINT)
  IS 'Полная статистика стрима для хоста (объединяет live_sessions + live_session_analytics)';

-- ---------------------------------------------------------------------------
-- 3. increment_viewer_count(p_session_id)
-- ---------------------------------------------------------------------------
-- Атомарный инкремент счётчика зрителей.
-- Использует advisory lock для предотвращения race condition при burst (10k join/сек).

CREATE OR REPLACE FUNCTION public.increment_viewer_count(
  p_session_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Advisory xact lock на session_id — гарантирует упорядоченность инкрементов
  PERFORM pg_advisory_xact_lock(p_session_id);

  UPDATE public.live_sessions
  SET
    viewer_count_current = viewer_count_current + 1,
    -- Обновляем peak атомарно
    viewer_count_peak = GREATEST(viewer_count_peak, viewer_count_current + 1),
    max_viewers        = GREATEST(max_viewers, viewer_count_current + 1),
    updated_at         = now()
  WHERE id = p_session_id
    AND status = 'live';
END;
$$;

COMMENT ON FUNCTION public.increment_viewer_count(BIGINT)
  IS 'Атомарный инкремент viewer_count_current с обновлением пика (advisory lock)';

-- ---------------------------------------------------------------------------
-- 4. decrement_viewer_count(p_session_id)
-- ---------------------------------------------------------------------------
-- Атомарный декремент с защитой от отрицательных значений.

CREATE OR REPLACE FUNCTION public.decrement_viewer_count(
  p_session_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(p_session_id);

  UPDATE public.live_sessions
  SET
    viewer_count_current = GREATEST(0, viewer_count_current - 1),
    updated_at           = now()
  WHERE id = p_session_id
    AND status IN ('live', 'ended');
END;
$$;

COMMENT ON FUNCTION public.decrement_viewer_count(BIGINT)
  IS 'Атомарный декремент viewer_count_current, не опускается ниже 0 (advisory lock)';

-- ---------------------------------------------------------------------------
-- 5. update_peak_viewers(p_session_id, p_current_viewers)
-- ---------------------------------------------------------------------------
-- Обновляет пик зрителей если p_current_viewers > viewer_count_peak.
-- Вызывается из Edge Function после получения события presence.

CREATE OR REPLACE FUNCTION public.update_peak_viewers(
  p_session_id       BIGINT,
  p_current_viewers  INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF p_current_viewers < 0 THEN
    RAISE EXCEPTION 'p_current_viewers cannot be negative'
      USING ERRCODE = '22003';
  END IF;

  UPDATE public.live_sessions
  SET
    viewer_count_peak = GREATEST(viewer_count_peak, p_current_viewers),
    max_viewers       = GREATEST(max_viewers,       p_current_viewers),
    updated_at        = now()
  WHERE id = p_session_id;
END;
$$;

COMMENT ON FUNCTION public.update_peak_viewers(BIGINT, INT)
  IS 'Обновляет peak_viewers если текущее значение превышает сохранённый пик';

-- ---------------------------------------------------------------------------
-- 6. check_chat_ban(p_session_id, p_user_id)
-- ---------------------------------------------------------------------------
-- Проверяет, забанен ли пользователь в чате сессии.
-- Учитывает expires_at: истёкший временный бан = не забанен.
-- Возвращает BOOLEAN. Не раскрывает детали бана анонимам.

CREATE OR REPLACE FUNCTION public.check_chat_ban(
  p_session_id BIGINT,
  p_user_id    UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
DECLARE
  v_banned BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.live_chat_bans
    WHERE session_id = p_session_id
      AND user_id    = p_user_id
      AND (expires_at IS NULL OR expires_at > now())
  )
  INTO v_banned;

  RETURN v_banned;
END;
$$;

COMMENT ON FUNCTION public.check_chat_ban(BIGINT, UUID)
  IS 'Проверка активного бана пользователя в чате (с учётом expires_at)';

-- ---------------------------------------------------------------------------
-- 7. rotate_stream_key(p_user_id)
-- ---------------------------------------------------------------------------
-- Деактивирует все активные ключи пользователя и создаёт новый.
-- Выполняется в одной транзакции — нет точки, когда пользователь без ключа.
-- Возвращает новый stream_key TEXT.
-- Только пользователь может ротировать СВОЙ ключ (RLS + явная проверка).

CREATE OR REPLACE FUNCTION public.rotate_stream_key(
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_new_key TEXT;
BEGIN
  -- Только сам пользователь (или service_role)
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Cannot rotate stream key for another user'
      USING ERRCODE = '42501';
  END IF;

  -- Деактивируем все активные ключи пользователя
  UPDATE public.live_stream_keys
  SET is_active = false
  WHERE user_id  = p_user_id
    AND is_active = true;

  -- Генерируем новый уникальный ключ: UUID + 16 hex bytes для энтропии
  v_new_key := gen_random_uuid()::text || '-' || encode(gen_random_bytes(12), 'hex');

  -- Создаём новый ключ
  INSERT INTO public.live_stream_keys (user_id, stream_key, name, is_active)
  VALUES (p_user_id, v_new_key, 'Default', true);

  RETURN v_new_key;
END;
$$;

COMMENT ON FUNCTION public.rotate_stream_key(UUID)
  IS 'Ротация stream key: деактивирует старые, создаёт новый. Атомарно. Возвращает новый ключ.';

-- ---------------------------------------------------------------------------
-- 8. compute_session_analytics(p_session_id)
-- ---------------------------------------------------------------------------
-- Вычисляет и сохраняет агрегированную аналитику для завершённой сессии.
-- Вызывается триггером при status → 'ended'.
-- UPSERT в live_session_analytics.

CREATE OR REPLACE FUNCTION public.compute_session_analytics(
  p_session_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_peak_viewers           INTEGER;
  v_total_unique_viewers   INTEGER;
  v_total_chat_messages    INTEGER;
  v_total_donations_amount NUMERIC(12,2);
  v_total_donations_count  INTEGER;
  v_avg_watch_duration     INTEGER;
BEGIN
  -- Пик зрителей из live_sessions (уже ведётся через increment триггер)
  SELECT viewer_count_peak, max_viewers
  INTO v_peak_viewers, v_peak_viewers
  FROM public.live_sessions
  WHERE id = p_session_id;

  -- Уникальные зрители
  SELECT COUNT(DISTINCT viewer_id)
  INTO v_total_unique_viewers
  FROM public.live_viewers
  WHERE session_id = p_session_id;

  -- Сообщения в чате
  SELECT COUNT(*)
  INTO v_total_chat_messages
  FROM public.live_chat_messages
  WHERE session_id = p_session_id
    AND is_hidden_by_creator = false
    AND is_auto_hidden = false;

  -- Донаты (session_id в live_donations хранится как UUID — совместимость с существующей схемой)
  -- NOTE: live_donations.session_id не имеет FK в существующей схеме, cast через text
  SELECT
    COALESCE(SUM(ld.amount), 0),
    COUNT(*)
  INTO v_total_donations_amount, v_total_donations_count
  FROM public.live_donations ld
  WHERE ld.session_id::text = p_session_id::text;

  -- Средняя длительность просмотра
  SELECT COALESCE(AVG(watch_duration_seconds)::INTEGER, 0)
  INTO v_avg_watch_duration
  FROM public.live_viewers
  WHERE session_id = p_session_id
    AND watch_duration_seconds > 0;

  -- UPSERT аналитики
  INSERT INTO public.live_session_analytics (
    session_id,
    peak_viewers,
    total_unique_viewers,
    total_chat_messages,
    total_donations_amount,
    total_donations_count,
    avg_watch_duration_sec,
    computed_at
  )
  VALUES (
    p_session_id,
    COALESCE(v_peak_viewers, 0),
    COALESCE(v_total_unique_viewers, 0),
    COALESCE(v_total_chat_messages, 0),
    COALESCE(v_total_donations_amount, 0),
    COALESCE(v_total_donations_count, 0),
    COALESCE(v_avg_watch_duration, 0),
    now()
  )
  ON CONFLICT (session_id) DO UPDATE
    SET
      peak_viewers            = EXCLUDED.peak_viewers,
      total_unique_viewers    = EXCLUDED.total_unique_viewers,
      total_chat_messages     = EXCLUDED.total_chat_messages,
      total_donations_amount  = EXCLUDED.total_donations_amount,
      total_donations_count   = EXCLUDED.total_donations_count,
      avg_watch_duration_sec  = EXCLUDED.avg_watch_duration_sec,
      computed_at             = EXCLUDED.computed_at;

  -- Синхронизируем avg_watch_duration_sec в основную таблицу
  UPDATE public.live_sessions
  SET avg_watch_duration_sec = COALESCE(v_avg_watch_duration, 0),
      updated_at             = now()
  WHERE id = p_session_id;

EXCEPTION
  WHEN OTHERS THEN
    -- Логируем но не бросаем — аналитика не должна крашить завершение сессии
    RAISE WARNING 'compute_session_analytics failed for session %: %', p_session_id, SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.compute_session_analytics(BIGINT)
  IS 'Агрегирует аналитику завершённой сессии и сохраняет через UPSERT в live_session_analytics';

-- =============================================================================
-- ТРИГГЕРНЫЕ ФУНКЦИИ
-- =============================================================================

-- ---------------------------------------------------------------------------
-- T1. trg_fn_live_viewers_increment
-- ---------------------------------------------------------------------------
-- Вызывается при INSERT в live_viewers → инкрементируем счётчик сессии.

CREATE OR REPLACE FUNCTION public.trg_fn_live_viewers_increment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  PERFORM public.increment_viewer_count(NEW.session_id);
  -- Обновляем total_viewers (уникальные) через дополнительный UPDATE
  UPDATE public.live_sessions
  SET total_viewers = (
        SELECT COUNT(DISTINCT viewer_id)
        FROM public.live_viewers
        WHERE session_id = NEW.session_id
      ),
      updated_at = now()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_viewers_on_insert ON public.live_viewers;

CREATE TRIGGER trg_live_viewers_on_insert
  AFTER INSERT ON public.live_viewers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_live_viewers_increment();

-- ---------------------------------------------------------------------------
-- T2. trg_fn_live_viewers_decrement
-- ---------------------------------------------------------------------------
-- Вызывается при DELETE livp в live_viewers → декрементируем счётчик.
-- UPDATE left_at не триггерит декремент (зритель ещё «присутствует»).

CREATE OR REPLACE FUNCTION public.trg_fn_live_viewers_decrement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  PERFORM public.decrement_viewer_count(OLD.session_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_viewers_on_delete ON public.live_viewers;

CREATE TRIGGER trg_live_viewers_on_delete
  AFTER DELETE ON public.live_viewers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_live_viewers_decrement();

-- ---------------------------------------------------------------------------
-- T3. trg_fn_live_sessions_status_ended
-- ---------------------------------------------------------------------------
-- Вызывается при UPDATE live_sessions когда status меняется на 'ended'.
-- Запускает compute_session_analytics в DEFERRED манере.
-- NOTE: Вычисление аналитики тяжёлое — в production лучше делегировать
--       в Edge Function / background job. Здесь оставлено для MVP.

CREATE OR REPLACE FUNCTION public.trg_fn_live_sessions_status_ended()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Только при переходе в 'ended'
  IF OLD.status != 'ended' AND NEW.status = 'ended' THEN
    -- Устанавливаем actual_end_at если не задан
    IF NEW.actual_end_at IS NULL THEN
      NEW.actual_end_at := now();
    END IF;
    -- Запускаем вычисление аналитики (может занять несколько мс)
    PERFORM public.compute_session_analytics(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_sessions_on_status_ended ON public.live_sessions;

CREATE TRIGGER trg_live_sessions_on_status_ended
  BEFORE UPDATE OF status ON public.live_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_live_sessions_status_ended();

-- ---------------------------------------------------------------------------
-- T4. trg_fn_live_chat_bans_set_expires
-- ---------------------------------------------------------------------------
-- Вычисляет expires_at при INSERT в live_chat_bans.
-- expires_at = created_at + duration_minutes * INTERVAL '1 minute'
-- Если duration_minutes IS NULL → expires_at остаётся NULL (permanent).

CREATE OR REPLACE FUNCTION public.trg_fn_live_chat_bans_set_expires()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.duration_minutes IS NOT NULL AND NEW.duration_minutes > 0 THEN
    NEW.expires_at := NEW.created_at + (NEW.duration_minutes * INTERVAL '1 minute');
  ELSE
    -- Permanent ban или некорректное значение → NULL
    NEW.expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_chat_bans_on_insert ON public.live_chat_bans;

CREATE TRIGGER trg_live_chat_bans_on_insert
  BEFORE INSERT ON public.live_chat_bans
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_live_chat_bans_set_expires();

-- =============================================================================
-- GRANT EXECUTE для аутентифицированных пользователей
-- (anon может только get_active_livestreams и check_chat_ban)
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_active_livestreams(INT, INT)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_livestream_stats(BIGINT)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_viewer_count(BIGINT)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_viewer_count(BIGINT)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_peak_viewers(BIGINT, INT)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_chat_ban(BIGINT, UUID)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_stream_key(UUID)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_session_analytics(BIGINT)    TO authenticated;
