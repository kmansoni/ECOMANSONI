-- ============================================================================
-- REELS RANKING V3 — Алгоритмическое ранжирование ленты
-- Полный пайплайн: engagement × recency × affinity × cold-start - penalties
-- 7 CTE: impressions → negatives → candidates → scored → ranked → exploration → final
-- Fallback strategy: freq cap off → recency-only при нехватке кандидатов
-- Idempotent: безопасно накатывать повторно
--
-- Fixes v3:
--   Bug 1: IF/ELSIF вместо sequential RETURN QUERY (accumulation fix)
--   Bug 2: exploration_pool исключает ranked_pool (дедупликация)
--   Bug 3: candidates ORDER BY r.created_at DESC перед LIMIT 500
--   Bug 4: удалён dead WHERE (raw_affinity IS NOT NULL OR = 0)
--   Bug 5: recency fallback теперь фильтрует negative_items
--   Bug 6: ranked/exploration LIMIT покрывает offset для корректной пагинации
-- ============================================================================

-- ── 1. Дополнительные индексы ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_reel_impressions_user_reel_recent
  ON public.reel_impressions (user_id, reel_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_interactions_user_negative
  ON public.user_reel_interactions (user_id, reel_id)
  WHERE hidden = true OR reported = true OR skipped_quickly = true;

-- ── 2. Пересоздание get_reels_feed_v2 с полным ранжированием ───────────────

DROP FUNCTION IF EXISTS public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.get_reels_feed_v2(
  p_limit             INTEGER DEFAULT 50,
  p_offset            INTEGER DEFAULT 0,
  p_session_id        TEXT    DEFAULT NULL,
  p_exploration_ratio NUMERIC DEFAULT 0.20,
  p_recency_days      INTEGER DEFAULT 30,
  p_freq_cap_hours    INTEGER DEFAULT 6,
  p_algorithm_version TEXT    DEFAULT 'v2'
)
RETURNS TABLE (
  id                    UUID,
  author_id             UUID,
  video_url             TEXT,
  thumbnail_url         TEXT,
  description           TEXT,
  music_title           TEXT,
  likes_count           INTEGER,
  comments_count        INTEGER,
  views_count           INTEGER,
  saves_count           INTEGER,
  reposts_count         INTEGER,
  shares_count          INTEGER,
  created_at            TIMESTAMPTZ,
  final_score           NUMERIC,
  recommendation_reason TEXT,
  request_id            UUID,
  feed_position         INTEGER,
  algorithm_version     TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id          UUID    := auth.uid();
  v_request_id       UUID    := gen_random_uuid();
  v_limit            INTEGER := GREATEST(p_limit, 1);
  v_offset           INTEGER := GREATEST(p_offset, 0);
  v_recency_days     INTEGER := GREATEST(p_recency_days, 1);
  v_freq_cap_hours   INTEGER := GREATEST(p_freq_cap_hours, 0);
  v_explore_ratio    NUMERIC;
  v_ranked_count     INTEGER;
  v_explore_count    INTEGER;
  v_has_affinity     BOOLEAN;
  v_candidate_count  INTEGER;
  v_no_fc_count      INTEGER;
BEGIN
  -- ── Определяем exploration ratio ──────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM public.user_author_affinity
    WHERE user_id = v_user_id
    LIMIT 1
  ) INTO v_has_affinity;

  IF v_user_id IS NULL THEN
    -- Анонимный пользователь → весь фид = exploration (ranked_pool пустой)
    v_explore_ratio := 1.0;
  ELSIF NOT v_has_affinity THEN
    -- Новый пользователь без affinity → повышенный exploration
    v_explore_ratio := GREATEST(COALESCE(p_exploration_ratio, 0.20), 0.30);
  ELSE
    v_explore_ratio := LEAST(GREATEST(COALESCE(p_exploration_ratio, 0.20), 0.0), 1.0);
  END IF;

  v_ranked_count  := CEIL(v_limit * (1.0 - v_explore_ratio))::INTEGER;
  v_explore_count := v_limit - v_ranked_count;

  -- ══════════════════════════════════════════════════════════════════════════
  -- Pre-check: подсчёт кандидатов ДО RETURN QUERY (Bug 1 fix)
  -- Быстрый COUNT — использует индексы, не загружает данные
  -- ══════════════════════════════════════════════════════════════════════════
  SELECT COUNT(*) INTO v_candidate_count
  FROM public.reels r
  WHERE r.moderation_status != 'blocked'
    AND r.is_nsfw = false
    AND r.is_graphic_violence = false
    AND r.is_political_extremism = false
    AND r.created_at > now() - INTERVAL '90 days'
    AND r.id NOT IN (
      SELECT uri.reel_id
      FROM public.user_reel_interactions uri
      WHERE uri.user_id = v_user_id
        AND (uri.hidden = true OR uri.reported = true)
      UNION
      SELECT urf.reel_id
      FROM public.user_reel_feedback urf
      WHERE urf.user_id = v_user_id
        AND urf.feedback = 'not_interested'
    )
    AND r.id NOT IN (
      SELECT ri.reel_id
      FROM public.reel_impressions ri
      WHERE v_freq_cap_hours > 0
        AND (
          (v_user_id IS NOT NULL AND ri.user_id = v_user_id)
          OR
          (v_user_id IS NULL AND p_session_id IS NOT NULL AND ri.session_id = p_session_id)
        )
        AND ri.created_at > now() - make_interval(hours => v_freq_cap_hours)
    );

  -- ══════════════════════════════════════════════════════════════════════════
  -- Ветка 1: Достаточно кандидатов ИЛИ пагинация → полный пайплайн
  -- (Bug 1 fix: IF/ELSIF — только ОДНА ветка выполняется)
  -- ══════════════════════════════════════════════════════════════════════════
  IF v_candidate_count >= 5 OR v_offset > 0 THEN

    RETURN QUERY
    WITH
    -- CTE 1: Freq cap — рилы, показанные за последние N часов
    recent_impressions AS (
      SELECT DISTINCT ri.reel_id
      FROM public.reel_impressions ri
      WHERE v_freq_cap_hours > 0
        AND (
          (v_user_id IS NOT NULL AND ri.user_id = v_user_id)
          OR
          (v_user_id IS NULL AND p_session_id IS NOT NULL AND ri.session_id = p_session_id)
        )
        AND ri.created_at > now() - make_interval(hours => v_freq_cap_hours)
    ),

    -- CTE 2: Негативные сигналы — полное исключение (hidden, reported, not_interested)
    negative_items AS (
      SELECT DISTINCT uri.reel_id
      FROM public.user_reel_interactions uri
      WHERE uri.user_id = v_user_id
        AND (uri.hidden = true OR uri.reported = true)
      UNION
      SELECT DISTINCT urf.reel_id
      FROM public.user_reel_feedback urf
      WHERE urf.user_id = v_user_id
        AND urf.feedback = 'not_interested'
    ),

    -- CTE 3: Отфильтрованные кандидаты (модерация + freq cap + negative + свежесть)
    -- Bug 3 fix: ORDER BY r.created_at DESC перед LIMIT 500
    candidates AS (
      SELECT
        r.id,
        r.author_id,
        r.video_url,
        r.thumbnail_url,
        r.description,
        r.music_title,
        COALESCE(r.likes_count, 0)    AS likes_count,
        COALESCE(r.comments_count, 0) AS comments_count,
        COALESCE(r.views_count, 0)    AS views_count,
        COALESCE(r.saves_count, 0)    AS saves_count,
        COALESCE(r.reposts_count, 0)  AS reposts_count,
        COALESCE(r.shares_count, 0)   AS shares_count,
        r.created_at,
        EXTRACT(EPOCH FROM now() - r.created_at) / 3600.0 AS age_hours,
        COALESCE(ua.affinity_score, 0) AS raw_affinity
      FROM public.reels r
      LEFT JOIN public.user_author_affinity ua
        ON ua.user_id = v_user_id AND ua.author_id = r.author_id
      WHERE r.moderation_status != 'blocked'
        AND r.is_nsfw = false
        AND r.is_graphic_violence = false
        AND r.is_political_extremism = false
        AND r.created_at > now() - INTERVAL '90 days'
        AND r.id NOT IN (SELECT ni.reel_id FROM negative_items ni)
        AND r.id NOT IN (SELECT rci.reel_id FROM recent_impressions rci)
      ORDER BY r.created_at DESC
      LIMIT 500
    ),

    -- CTE 4: Скоринг — engagement × recency × affinity × cold_start - skip_penalty
    scored AS (
      SELECT
        c.*,
        (
          LN(1 + c.views_count)    * 0.5 +
          LN(1 + c.likes_count)    * 2.0 +
          LN(1 + c.comments_count) * 3.0 +
          LN(1 + c.saves_count)    * 5.0 +
          LN(1 + c.shares_count)   * 6.0 +
          LN(1 + c.reposts_count)  * 4.0
        ) AS engagement_score,

        EXP(-0.693 * c.age_hours / (v_recency_days * 24)) AS recency_decay,

        LEAST(GREATEST(c.raw_affinity, 0), 1.0) * 0.3 AS affinity_boost,

        CASE
          WHEN c.views_count < 100
          THEN 0.5 * (1.0 - c.views_count / 100.0)
          ELSE 0
        END AS cold_start_boost,

        COALESCE(
          (SELECT -2.0 FROM public.user_reel_interactions si
           WHERE si.user_id = v_user_id
             AND si.reel_id = c.id
             AND si.skipped_quickly = true
           LIMIT 1),
          0
        ) AS skip_penalty,

        CASE
          WHEN c.views_count < 100
            THEN 'NewContent'
          WHEN c.raw_affinity > 0.5
            THEN 'FollowingAuthor'
          WHEN c.views_count > 1000 AND c.age_hours < 24
            THEN 'TrendingNow'
          ELSE 'PersonalizedForYou'
        END AS reason
      FROM candidates c
    ),

    -- CTE 5: Ранжированный пул — топ по score, max 3 рила от одного автора
    -- Bug 4 fix: удалён dead WHERE clause (raw_affinity всегда NOT NULL из-за COALESCE)
    ranked_pool AS (
      SELECT
        s.id,
        s.author_id,
        s.video_url,
        s.thumbnail_url,
        s.description,
        s.music_title,
        s.likes_count,
        s.comments_count,
        s.views_count,
        s.saves_count,
        s.reposts_count,
        s.shares_count,
        s.created_at,
        (
          s.engagement_score
          * s.recency_decay
          * (1.0 + s.affinity_boost)
          * (1.0 + s.cold_start_boost)
          + s.skip_penalty
        )::NUMERIC AS computed_score,
        s.reason,
        ROW_NUMBER() OVER (
          PARTITION BY s.author_id
          ORDER BY (
            s.engagement_score
            * s.recency_decay
            * (1.0 + s.affinity_boost)
            * (1.0 + s.cold_start_boost)
            + s.skip_penalty
          ) DESC
        ) AS author_rank
      FROM scored s
    ),

    -- CTE 6: Exploration пул — случайные рилы от неизвестных авторов
    -- Bug 2 fix: исключаем рилы, уже попавшие в ranked_pool
    -- Bug 6 fix: LIMIT покрывает offset для корректной пагинации
    exploration_pool AS (
      SELECT
        s.id,
        s.author_id,
        s.video_url,
        s.thumbnail_url,
        s.description,
        s.music_title,
        s.likes_count,
        s.comments_count,
        s.views_count,
        s.saves_count,
        s.reposts_count,
        s.shares_count,
        s.created_at,
        (
          s.engagement_score
          * s.recency_decay
          * (1.0 + s.cold_start_boost)
          + s.skip_penalty
        )::NUMERIC AS computed_score,
        'Exploration'::TEXT AS reason
      FROM scored s
      WHERE NOT EXISTS (
        SELECT 1 FROM public.user_author_affinity eua
        WHERE eua.user_id = v_user_id AND eua.author_id = s.author_id
      )
      AND s.id NOT IN (
        SELECT rp.id FROM ranked_pool rp WHERE rp.author_rank <= 3
      )
      ORDER BY RANDOM()
      LIMIT v_explore_count + v_offset
    ),

    -- CTE 7: Финальная лента — UNION ranked + exploration
    -- Bug 6 fix: ranked LIMIT покрывает offset
    final_feed AS (
      (
        SELECT
          rp.id, rp.author_id, rp.video_url, rp.thumbnail_url, rp.description,
          rp.music_title, rp.likes_count, rp.comments_count, rp.views_count,
          rp.saves_count, rp.reposts_count, rp.shares_count, rp.created_at,
          rp.computed_score, rp.reason
        FROM ranked_pool rp
        WHERE rp.author_rank <= 3
        ORDER BY rp.computed_score DESC
        LIMIT v_ranked_count + v_offset
      )
      UNION ALL
      (
        SELECT
          ep.id, ep.author_id, ep.video_url, ep.thumbnail_url, ep.description,
          ep.music_title, ep.likes_count, ep.comments_count, ep.views_count,
          ep.saves_count, ep.reposts_count, ep.shares_count, ep.created_at,
          ep.computed_score, ep.reason
        FROM exploration_pool ep
      )
    )
    SELECT
      ff.id,
      ff.author_id,
      ff.video_url,
      ff.thumbnail_url,
      ff.description,
      ff.music_title,
      ff.likes_count::INTEGER,
      ff.comments_count::INTEGER,
      ff.views_count::INTEGER,
      ff.saves_count::INTEGER,
      ff.reposts_count::INTEGER,
      ff.shares_count::INTEGER,
      ff.created_at,
      ff.computed_score AS final_score,
      ff.reason AS recommendation_reason,
      v_request_id AS request_id,
      (ROW_NUMBER() OVER (ORDER BY ff.computed_score DESC) - 1)::INTEGER AS feed_position,
      COALESCE(p_algorithm_version, 'v2')::TEXT AS algorithm_version
    FROM final_feed ff
    ORDER BY ff.computed_score DESC
    OFFSET v_offset
    LIMIT v_limit;

  ELSE
    -- ════════════════════════════════════════════════════════════════════════
    -- Ветка 2: Мало кандидатов с freq cap → пробуем без freq cap
    -- ════════════════════════════════════════════════════════════════════════
    SELECT COUNT(*) INTO v_no_fc_count
    FROM public.reels r
    WHERE r.moderation_status != 'blocked'
      AND r.is_nsfw = false
      AND r.is_graphic_violence = false
      AND r.is_political_extremism = false
      AND r.created_at > now() - INTERVAL '90 days'
      AND r.id NOT IN (
        SELECT uri.reel_id
        FROM public.user_reel_interactions uri
        WHERE uri.user_id = v_user_id
          AND (uri.hidden = true OR uri.reported = true)
        UNION
        SELECT urf.reel_id
        FROM public.user_reel_feedback urf
        WHERE urf.user_id = v_user_id
          AND urf.feedback = 'not_interested'
      );

    IF v_no_fc_count >= 5 THEN

      RETURN QUERY
      WITH
      negative_items_fb AS (
        SELECT DISTINCT uri.reel_id
        FROM public.user_reel_interactions uri
        WHERE uri.user_id = v_user_id
          AND (uri.hidden = true OR uri.reported = true)
        UNION
        SELECT DISTINCT urf.reel_id
        FROM public.user_reel_feedback urf
        WHERE urf.user_id = v_user_id
          AND urf.feedback = 'not_interested'
      ),
      -- Bug 3 fix (аналогично): ORDER BY перед LIMIT 500
      candidates_no_fc AS (
        SELECT
          r.id,
          r.author_id,
          r.video_url,
          r.thumbnail_url,
          r.description,
          r.music_title,
          COALESCE(r.likes_count, 0)    AS likes_count,
          COALESCE(r.comments_count, 0) AS comments_count,
          COALESCE(r.views_count, 0)    AS views_count,
          COALESCE(r.saves_count, 0)    AS saves_count,
          COALESCE(r.reposts_count, 0)  AS reposts_count,
          COALESCE(r.shares_count, 0)   AS shares_count,
          r.created_at,
          EXTRACT(EPOCH FROM now() - r.created_at) / 3600.0 AS age_hours
        FROM public.reels r
        WHERE r.moderation_status != 'blocked'
          AND r.is_nsfw = false
          AND r.is_graphic_violence = false
          AND r.is_political_extremism = false
          AND r.created_at > now() - INTERVAL '90 days'
          AND r.id NOT IN (SELECT nfb.reel_id FROM negative_items_fb nfb)
        ORDER BY r.created_at DESC
        LIMIT 500
      ),
      scored_no_fc AS (
        SELECT
          cnf.*,
          (
            LN(1 + cnf.views_count)    * 0.5 +
            LN(1 + cnf.likes_count)    * 2.0 +
            LN(1 + cnf.comments_count) * 3.0 +
            LN(1 + cnf.saves_count)    * 5.0 +
            LN(1 + cnf.shares_count)   * 6.0 +
            LN(1 + cnf.reposts_count)  * 4.0
          )
          * EXP(-0.693 * cnf.age_hours / (v_recency_days * 24))
          AS computed_score
        FROM candidates_no_fc cnf
      )
      SELECT
        snf.id,
        snf.author_id,
        snf.video_url,
        snf.thumbnail_url,
        snf.description,
        snf.music_title,
        snf.likes_count::INTEGER,
        snf.comments_count::INTEGER,
        snf.views_count::INTEGER,
        snf.saves_count::INTEGER,
        snf.reposts_count::INTEGER,
        snf.shares_count::INTEGER,
        snf.created_at,
        snf.computed_score::NUMERIC AS final_score,
        'FallbackNoFreqCap'::TEXT AS recommendation_reason,
        v_request_id AS request_id,
        (ROW_NUMBER() OVER (ORDER BY snf.computed_score DESC) - 1)::INTEGER AS feed_position,
        COALESCE(p_algorithm_version, 'v2')::TEXT AS algorithm_version
      FROM scored_no_fc snf
      ORDER BY snf.computed_score DESC
      LIMIT v_limit;

    ELSE
      -- ══════════════════════════════════════════════════════════════════════
      -- Ветка 3: Совсем мало кандидатов → простой recency fallback
      -- Bug 5 fix: фильтрация negative_items в recency fallback
      -- ══════════════════════════════════════════════════════════════════════
      RETURN QUERY
      SELECT
        r.id,
        r.author_id,
        r.video_url,
        r.thumbnail_url,
        r.description,
        r.music_title,
        COALESCE(r.likes_count, 0)::INTEGER,
        COALESCE(r.comments_count, 0)::INTEGER,
        COALESCE(r.views_count, 0)::INTEGER,
        COALESCE(r.saves_count, 0)::INTEGER,
        COALESCE(r.reposts_count, 0)::INTEGER,
        COALESCE(r.shares_count, 0)::INTEGER,
        r.created_at,
        (EXTRACT(EPOCH FROM r.created_at) / 1000000.0)::NUMERIC AS final_score,
        'FallbackRecency'::TEXT AS recommendation_reason,
        v_request_id AS request_id,
        (ROW_NUMBER() OVER (ORDER BY r.created_at DESC) - 1)::INTEGER AS feed_position,
        COALESCE(p_algorithm_version, 'v2')::TEXT AS algorithm_version
      FROM public.reels r
      WHERE r.moderation_status != 'blocked'
        AND r.is_nsfw = false
        AND r.is_graphic_violence = false
        AND r.is_political_extremism = false
        AND r.id NOT IN (
          SELECT uri.reel_id
          FROM public.user_reel_interactions uri
          WHERE uri.user_id = v_user_id
            AND (uri.hidden = true OR uri.reported = true)
          UNION
          SELECT urf.reel_id
          FROM public.user_reel_feedback urf
          WHERE urf.user_id = v_user_id
            AND urf.feedback = 'not_interested'
        )
      ORDER BY r.created_at DESC
      LIMIT v_limit;

    END IF;
  END IF;
END;
$$;

-- ── 3. Разрешения ──────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT) TO authenticated, anon;
