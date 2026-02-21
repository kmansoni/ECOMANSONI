-- ============================================================================
-- PROFESSIONAL IMPRESSION TRACKING SYSTEM
-- Объединяет лучшие практики: Progressive Disclosure + IntersectionObserver
-- + Server request_id + Idempotent Upsert + ML-ready Interactions
-- ============================================================================

-- ============================================================================
-- 1. УЛУЧШЕНИЕ reel_impressions: дедупликация + batch correlation
-- ============================================================================

-- Уникальный constraint: не дублировать impressions в одном request batch
CREATE UNIQUE INDEX IF NOT EXISTS ux_reel_impressions_request_dedupe
  ON public.reel_impressions(request_id, user_id, reel_id)
  WHERE request_id IS NOT NULL AND user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_reel_impressions_request_dedupe_anon
  ON public.reel_impressions(request_id, session_id, reel_id)
  WHERE request_id IS NOT NULL AND user_id IS NULL AND session_id IS NOT NULL;

-- Индекс для частотной капитализации (freq-cap)
CREATE INDEX IF NOT EXISTS idx_reel_impressions_user_reel_time
  ON public.reel_impressions(user_id, reel_id, created_at DESC)
  WHERE user_id IS NOT NULL;

COMMENT ON INDEX ux_reel_impressions_request_dedupe IS 
  'Предотвращает дубли impression в одном batch (request_id). Для refetch - новый request_id.';

-- ============================================================================
-- 2. IDEMPOTENT IMPRESSION RECORDING (conflict-safe)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_reel_impression_v2(
  p_reel_id UUID,
  p_session_id TEXT DEFAULT NULL,
  p_request_id UUID DEFAULT NULL,
  p_position INTEGER DEFAULT NULL,
  p_source TEXT DEFAULT 'reels',
  p_algorithm_version TEXT DEFAULT NULL,
  p_score NUMERIC DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL AND (p_session_id IS NULL OR length(trim(p_session_id)) = 0) THEN
    RAISE EXCEPTION 'record_reel_impression_v2 requires auth or session_id';
  END IF;

  -- Idempotent insert: ON CONFLICT DO NOTHING
  -- При refetch с тем же request_id - тихо игнорируем (клиент может повторять)
  -- Используем динамический подход: вставка с обработкой конфликтов для auth/anon
  IF v_user_id IS NOT NULL THEN
    -- Authenticated user: используем ux_reel_impressions_request_dedupe
    INSERT INTO public.reel_impressions(
      user_id,
      session_id,
      reel_id,
      request_id,
      position,
      source,
      algorithm_version,
      score
    )
    VALUES (
      v_user_id,
      NULL,
      p_reel_id,
      p_request_id,
      p_position,
      p_source,
      p_algorithm_version,
      p_score
    )
    ON CONFLICT ON CONSTRAINT ux_reel_impressions_request_dedupe 
      DO NOTHING;
  ELSE
    -- Anonymous user: используем ux_reel_impressions_request_dedupe_anon
    INSERT INTO public.reel_impressions(
      user_id,
      session_id,
      reel_id,
      request_id,
      position,
      source,
      algorithm_version,
      score
    )
    VALUES (
      NULL,
      p_session_id,
      p_reel_id,
      p_request_id,
      p_position,
      p_source,
      p_algorithm_version,
      p_score
    )
    ON CONFLICT ON CONSTRAINT ux_reel_impressions_request_dedupe_anon 
      DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_reel_impression_v2(UUID, TEXT, UUID, INTEGER, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_reel_impression_v2(UUID, TEXT, UUID, INTEGER, TEXT, TEXT, NUMERIC) TO anon;

COMMENT ON FUNCTION public.record_reel_impression_v2 IS 
  'Idempotent impression tracking. ON CONFLICT DO NOTHING предотвращает дубли при refetch/retry.';

-- ============================================================================
-- 3. PROGRESSIVE DISCLOSURE LAYER 1: "VIEWED" (started watching >2sec)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_reel_viewed(
  p_reel_id UUID,
  p_session_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL AND (p_session_id IS NULL OR length(trim(p_session_id)) = 0) THEN
    RAISE EXCEPTION 'record_reel_viewed requires auth or session_id';
  END IF;

  -- Upsert в user_reel_interactions: ставим viewed = true
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.user_reel_interactions(
      user_id, 
      reel_id, 
      viewed, 
      first_view_at, 
      last_interaction_at
    )
    VALUES (
      v_user_id,
      p_reel_id,
      true,
      now(),
      now()
    )
    ON CONFLICT (user_id, reel_id) 
    DO UPDATE SET 
      viewed = true,
      last_interaction_at = now();
  ELSE
    -- Анонимные пользователи: session-based tracking (опционально)
    -- Можно добавить отдельную таблицу anonymous_reel_interactions если нужно
    -- Для упрощения - пропускаем или логируем в reel_views
    NULL;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_reel_viewed(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_reel_viewed(UUID, TEXT) TO anon;

COMMENT ON FUNCTION public.record_reel_viewed IS 
  'Progressive Layer 1: Пользователь начал смотреть (viewed >2 sec). Upsert в user_reel_interactions.';

-- ============================================================================
-- 4. PROGRESSIVE DISCLOSURE LAYER 2: "WATCHED" (completion >50%)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_reel_watched(
  p_reel_id UUID,
  p_watch_duration_seconds INTEGER,
  p_reel_duration_seconds INTEGER,
  p_session_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_completion_rate NUMERIC(5,2);
  v_is_rewatch BOOLEAN := false;
  v_existing_views INTEGER := 0;
BEGIN
  IF v_user_id IS NULL AND (p_session_id IS NULL OR length(trim(p_session_id)) = 0) THEN
    RAISE EXCEPTION 'record_reel_watched requires auth or session_id';
  END IF;

  -- Расчет completion_rate
  IF p_reel_duration_seconds > 0 THEN
    v_completion_rate := (p_watch_duration_seconds::NUMERIC / p_reel_duration_seconds::NUMERIC) * 100;
  ELSE
    v_completion_rate := 0;
  END IF;

  IF v_user_id IS NOT NULL THEN
    -- Проверяем, был ли уже viewed (для rewatch detection)
    SELECT COALESCE(rewatch_count, 0) INTO v_existing_views
    FROM public.user_reel_interactions
    WHERE user_id = v_user_id AND reel_id = p_reel_id;

    IF FOUND THEN
      v_is_rewatch := true;
    END IF;

    -- Upsert с обновлением watch metrics
    INSERT INTO public.user_reel_interactions(
      user_id,
      reel_id,
      viewed,
      watch_duration_seconds,
      reel_duration_seconds,
      completion_rate,
      rewatched,
      rewatch_count,
      first_view_at,
      last_interaction_at
    )
    VALUES (
      v_user_id,
      p_reel_id,
      true,
      p_watch_duration_seconds,
      p_reel_duration_seconds,
      v_completion_rate,
      v_is_rewatch,
      CASE WHEN v_is_rewatch THEN 1 ELSE 0 END,
      now(),
      now()
    )
    ON CONFLICT (user_id, reel_id)
    DO UPDATE SET
      watch_duration_seconds = GREATEST(
        public.user_reel_interactions.watch_duration_seconds,
        EXCLUDED.watch_duration_seconds
      ),
      completion_rate = GREATEST(
        public.user_reel_interactions.completion_rate,
        EXCLUDED.completion_rate
      ),
      rewatched = CASE 
        WHEN public.user_reel_interactions.viewed THEN true 
        ELSE false 
      END,
      rewatch_count = CASE
        WHEN public.user_reel_interactions.viewed 
          THEN public.user_reel_interactions.rewatch_count + 1
        ELSE 0
      END,
      last_interaction_at = now();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_reel_watched(UUID, INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_reel_watched(UUID, INTEGER, INTEGER, TEXT) TO anon;

COMMENT ON FUNCTION public.record_reel_watched IS 
  'Progressive Layer 2: Пользователь досмотрел >50% (watched). Обновляет completion_rate, rewatch_count.';

-- ============================================================================
-- 5. UPDATE INTERACTION: SHORT SKIP (negative signal)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_reel_skip(
  p_reel_id UUID,
  p_skipped_at_second INTEGER,
  p_reel_duration_seconds INTEGER,
  p_session_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_quick_skip BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL AND (p_session_id IS NULL OR length(trim(p_session_id)) = 0) THEN
    RAISE EXCEPTION 'record_reel_skip requires auth or session_id';
  END IF;

  -- Quick skip detection: скипнули за <2 секунды
  IF p_skipped_at_second < 2 THEN
    v_is_quick_skip := true;
  END IF;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.user_reel_interactions(
      user_id,
      reel_id,
      skipped_quickly,
      skipped_at_second,
      reel_duration_seconds,
      first_view_at,
      last_interaction_at
    )
    VALUES (
      v_user_id,
      p_reel_id,
      v_is_quick_skip,
      p_skipped_at_second,
      p_reel_duration_seconds,
      now(),
      now()
    )
    ON CONFLICT (user_id, reel_id)
    DO UPDATE SET
      skipped_quickly = EXCLUDED.skipped_quickly,
      skipped_at_second = EXCLUDED.skipped_at_second,
      last_interaction_at = now();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_reel_skip(UUID, INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_reel_skip(UUID, INTEGER, INTEGER, TEXT) TO anon;

COMMENT ON FUNCTION public.record_reel_skip IS 
  'Negative signal: Пользователь скипнул reel (особенно <2 sec = quick skip). Влияет на персонализацию.';

-- ============================================================================
-- 6. МОДИФИКАЦИЯ get_reels_feed_v2: генерация request_id + return metadata
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_reels_feed_v2(
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_session_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  reel_id UUID,
  author_id UUID,
  author_username TEXT,
  author_avatar_url TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  music_title TEXT,
  music_artist TEXT,
  music_url TEXT,
  duration_seconds INTEGER,
  likes_count INTEGER,
  comments_count INTEGER,
  views_count INTEGER,
  saves_count INTEGER,
  reposts_count INTEGER,
  shares_count INTEGER,
  created_at TIMESTAMPTZ,
  is_liked BOOLEAN,
  is_saved BOOLEAN,
  is_reposted BOOLEAN,
  moderation_status TEXT,
  channel_id UUID,
  channel_name TEXT,
  is_nsfw BOOLEAN,
  is_graphic_violence BOOLEAN,
  is_political_extremism BOOLEAN,
  -- NEW: metadata для impression tracking
  request_id UUID,
  feed_position INTEGER,
  algorithm_version TEXT,
  final_score NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_user_id UUID;
  v_generated_request_id UUID;
  v_algo_version TEXT;
BEGIN
  v_user_id := auth.uid();
  v_generated_request_id := gen_random_uuid();
  v_algo_version := 'v2.1_60tiktok_40instagram';
  -- Временная таблица с scored reels
  CREATE TEMP TABLE IF NOT EXISTS temp_scored_reels (
    reel_id UUID,
    author_id UUID,
    video_url TEXT,
    thumbnail_url TEXT,
    description TEXT,
    music_title TEXT,
    music_artist TEXT,
    music_url TEXT,
    duration_seconds INTEGER,
    likes_count INTEGER,
    comments_count INTEGER,
    views_count INTEGER,
    saves_count INTEGER,
    reposts_count INTEGER,
    shares_count INTEGER,
    created_at TIMESTAMPTZ,
    moderation_status TEXT,
    channel_id UUID,
    is_nsfw BOOLEAN,
    is_graphic_violence BOOLEAN,
    is_political_extremism BOOLEAN,
    final_score NUMERIC
  ) ON COMMIT DROP;

  -- Основной запрос: фильтрация + scoring (60/40 blend)
  INSERT INTO temp_scored_reels
  SELECT
    r.id AS reel_id,
    r.author_id,
    r.video_url,
    r.thumbnail_url,
    r.description,
    r.music_title,
    r.music_artist,
    r.music_url,
    r.duration_seconds,
    r.likes_count,
    r.comments_count,
    r.views_count,
    r.saves_count,
    r.reposts_count,
    r.shares_count,
    r.created_at,
    r.moderation_status,
    r.channel_id,
    r.is_nsfw,
    r.is_graphic_violence,
    r.is_political_extremism,
    -- SCORING: 60% TikTok + 40% Instagram
    (
      0.6 * (
        -- TikTok-style: completion_rate > engagement > recency
        COALESCE(
          (SELECT AVG(completion_rate) FROM public.user_reel_interactions WHERE reel_id = r.id AND completion_rate > 0),
          0
        ) * 0.40 +
        ((r.likes_count * 3 + r.saves_count * 5 + r.shares_count * 8 + r.reposts_count * 10 + r.comments_count * 4)::NUMERIC / GREATEST(r.views_count, 1)) * 100 * 0.35 +
        (EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600)^(-0.3) * 0.25
      )
      +
      0.4 * (
        -- Instagram-style: engagement ratio + virality
        ((r.likes_count * 2 + r.saves_count * 4 + r.shares_count * 6 + r.comments_count * 3)::NUMERIC / GREATEST(r.views_count, 1)) * 100 * 0.50 +
        (EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600)^(-0.4) * 0.30 +
        (r.views_count::NUMERIC / GREATEST(EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600, 1)) * 0.20
      )
    ) AS final_score
  FROM public.reels r
  WHERE
    r.moderation_status != 'blocked'
    AND (
      v_user_id IS NULL 
      OR r.author_id <> v_user_id -- Не показываем свои reels в main feed
    )
    AND (
      r.channel_id IS NULL
      OR public.is_channel_member(r.channel_id, v_user_id)
    )
    AND (
      (r.is_nsfw = false AND r.is_graphic_violence = false AND r.is_political_extremism = false)
      OR (r.channel_id IS NOT NULL) -- В закрытых каналах можно sensitive content
    )
    -- Frequency capping: не показываем reel, если юзер его видел в последние 7 дней
    AND (
      v_user_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.reel_impressions ri
        WHERE ri.user_id = v_user_id
          AND ri.reel_id = r.id
          AND ri.created_at > NOW() - INTERVAL '7 days'
      )
    )
  ORDER BY final_score DESC
  LIMIT p_limit
  OFFSET p_offset;

  -- Return с metadata
  RETURN QUERY
  SELECT
    tsr.reel_id,
    tsr.author_id,
    p.username AS author_username,
    p.avatar_url AS author_avatar_url,
    tsr.video_url,
    tsr.thumbnail_url,
    tsr.description,
    tsr.music_title,
    tsr.music_artist,
    tsr.music_url,
    tsr.duration_seconds,
    tsr.likes_count,
    tsr.comments_count,
    tsr.views_count,
    tsr.saves_count,
    tsr.reposts_count,
    tsr.shares_count,
    tsr.created_at,
    EXISTS(SELECT 1 FROM public.reel_likes rl WHERE rl.reel_id = tsr.reel_id AND rl.user_id = v_user_id) AS is_liked,
    EXISTS(SELECT 1 FROM public.reel_saves rs WHERE rs.reel_id = tsr.reel_id AND rs.user_id = v_user_id) AS is_saved,
    EXISTS(SELECT 1 FROM public.reel_reposts rr WHERE rr.reel_id = tsr.reel_id AND rr.user_id = v_user_id) AS is_reposted,
    tsr.moderation_status,
    tsr.channel_id,
    ch.name AS channel_name,
    tsr.is_nsfw,
    tsr.is_graphic_violence,
    tsr.is_political_extremism,
    -- Metadata для impression tracking
    v_generated_request_id AS request_id,
    (p_offset + ROW_NUMBER() OVER (ORDER BY tsr.final_score DESC) - 1)::INTEGER AS feed_position,
    v_algo_version AS algorithm_version,
    tsr.final_score
  FROM temp_scored_reels tsr
  LEFT JOIN public.profiles p ON p.id = tsr.author_id
  LEFT JOIN public.channels ch ON ch.id = tsr.channel_id
  ORDER BY tsr.final_score DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT) TO anon;

COMMENT ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT) IS 
  'UPGRADED: Генерирует request_id для batch correlation + возвращает algorithm_version, final_score, feed_position.';

-- ============================================================================
-- 7. HELPER: Batch impression insert (опционально, для client bulk insert)
-- ============================================================================

-- Если клиент хочет отправлять batch impressions одним вызовом (опционально)
-- Можно использовать для оптимизации сети: insert 10 impressions одним RPC call

CREATE OR REPLACE FUNCTION public.record_reel_impressions_batch(
  p_impressions JSONB -- массив: [{reel_id, request_id, position, score, algorithm_version}, ...]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_impression JSONB;
BEGIN
  FOR v_impression IN SELECT * FROM jsonb_array_elements(p_impressions)
  LOOP
    PERFORM public.record_reel_impression_v2(
      (v_impression->>'reel_id')::UUID,
      NULL, -- session_id (TODO: если надо поддержку анонимов - добавить в JSONB)
      (v_impression->>'request_id')::UUID,
      (v_impression->>'position')::INTEGER,
      'reels',
      v_impression->>'algorithm_version',
      (v_impression->>'score')::NUMERIC
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_reel_impressions_batch(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_reel_impressions_batch(JSONB) TO anon;

COMMENT ON FUNCTION public.record_reel_impressions_batch IS 
  'OPTIONAL: Batch insert для оптимизации сети. Клиент может отправить массив impressions одним вызовом.';

-- ============================================================================
-- MIGRATION COMPLETE
-- Теперь фронтенд может:
-- 1. Получать request_id + metadata из get_reels_feed_v2
-- 2. Использовать IntersectionObserver (50%+ viewport, 1+ sec) для impression
-- 3. Вызывать record_reel_impression_v2 (idempotent, безопасно для retry)
-- 4. Прогрессивно отправлять: viewed (>2s), watched (>50%), skip (negative)
-- 5. Batch insert через record_reel_impressions_batch (опционально)
-- ============================================================================
