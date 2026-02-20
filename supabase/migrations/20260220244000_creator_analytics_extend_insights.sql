-- ============================================================================
-- STEP 7: Creator analytics (hooks / trends / frequency) via get_creator_insights
--
-- Extends existing RPC public.get_creator_insights(p_days)
-- Adds:
--  - hook_score (early retention proxy), completion/rewatch/skip rates
--  - posting_frequency (reels/day, reels/week, avg gap hours)
--  - trend_alignment (trending hashtags/topics/audio usage)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_creator_insights(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_since TIMESTAMPTZ;

  v_views_total BIGINT;
  v_views_non_followers BIGINT;
  v_followers_total BIGINT;
  v_followers_gained BIGINT;
  v_non_followers_pct NUMERIC;
  v_reels_total BIGINT;
  v_views_by_day JSONB;
  v_views_by_hour JSONB;
  v_likes_total BIGINT;
  v_comments_total BIGINT;
  v_top_reels JSONB;
  v_followers_gender JSONB;

  -- New: creator quality signals
  v_avg_completion NUMERIC;
  v_avg_watch_seconds NUMERIC;
  v_rewatch_rate NUMERIC;
  v_skip_quickly_rate NUMERIC;
  v_hook_score NUMERIC;

  -- New: posting frequency
  v_reels_in_window BIGINT;
  v_reels_per_day NUMERIC;
  v_reels_per_week NUMERIC;
  v_avg_gap_hours NUMERIC;

  -- New: trend alignment
  v_trending_hashtag_reels BIGINT;
  v_trending_topic_reels BIGINT;
  v_trending_audio_reels BIGINT;
  v_trending_hashtag_pct NUMERIC;
  v_trending_topic_pct NUMERIC;
  v_trending_audio_pct NUMERIC;
  v_top_trending_hashtags JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_since := now() - make_interval(days => GREATEST(1, p_days));

  SELECT COUNT(*)
    INTO v_followers_total
  FROM public.followers
  WHERE following_id = v_uid;

  SELECT COUNT(*)
    INTO v_followers_gained
  FROM public.followers
  WHERE following_id = v_uid
    AND created_at >= v_since;

  SELECT COUNT(*)
    INTO v_reels_total
  FROM public.reels
  WHERE author_id = v_uid;

  SELECT COUNT(*)
    INTO v_views_total
  FROM public.reel_views rv
  JOIN public.reels r ON r.id = rv.reel_id
  WHERE r.author_id = v_uid
    AND COALESCE(rv.viewed_at, now()) >= v_since;

  SELECT COUNT(*)
    INTO v_views_non_followers
  FROM public.reel_views rv
  JOIN public.reels r ON r.id = rv.reel_id
  WHERE r.author_id = v_uid
    AND COALESCE(rv.viewed_at, now()) >= v_since
    AND (
      rv.user_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.followers f
        WHERE f.following_id = v_uid
          AND f.follower_id = rv.user_id
      )
    );

  v_non_followers_pct := CASE
    WHEN v_views_total = 0 THEN 0
    ELSE ROUND((v_views_non_followers::NUMERIC * 100.0) / v_views_total::NUMERIC, 1)
  END;

  -- Likes on reels in window
  SELECT COUNT(*)
    INTO v_likes_total
  FROM public.reel_likes rl
  JOIN public.reels r ON r.id = rl.reel_id
  WHERE r.author_id = v_uid
    AND COALESCE(rl.created_at, now()) >= v_since;

  -- Comments on reels in window
  SELECT COUNT(*)
    INTO v_comments_total
  FROM public.reel_comments rc
  JOIN public.reels r ON r.id = rc.reel_id
  WHERE r.author_id = v_uid
    AND rc.created_at >= v_since;

  -- Views by day
  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('day', day::TEXT, 'views', views) ORDER BY day), '[]'::JSONB)
    INTO v_views_by_day
  FROM (
    SELECT DATE_TRUNC('day', COALESCE(rv.viewed_at, now())) AS day,
           COUNT(*)::INT AS views
    FROM public.reel_views rv
    JOIN public.reels r ON r.id = rv.reel_id
    WHERE r.author_id = v_uid
      AND COALESCE(rv.viewed_at, now()) >= v_since
    GROUP BY 1
  ) t;

  -- Views by hour
  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('hour', hour_of_day, 'views', views) ORDER BY hour_of_day), '[]'::JSONB)
    INTO v_views_by_hour
  FROM (
    SELECT EXTRACT(HOUR FROM COALESCE(rv.viewed_at, now()))::INT AS hour_of_day,
           COUNT(*)::INT AS views
    FROM public.reel_views rv
    JOIN public.reels r ON r.id = rv.reel_id
    WHERE r.author_id = v_uid
      AND COALESCE(rv.viewed_at, now()) >= v_since
    GROUP BY 1
  ) t;

  -- Top reels by views in window
  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'reel_id', reel_id,
        'views', views,
        'likes_count', likes_count,
        'comments_count', comments_count,
        'created_at', created_at,
        'thumbnail_url', thumbnail_url,
        'description', description
      )
      ORDER BY views DESC
    ),
    '[]'::JSONB
  )
  INTO v_top_reels
  FROM (
    SELECT r.id AS reel_id,
           COUNT(rv.id)::INT AS views,
           COALESCE(r.likes_count, 0)::INT AS likes_count,
           COALESCE(r.comments_count, 0)::INT AS comments_count,
           r.created_at AS created_at,
           r.thumbnail_url AS thumbnail_url,
           r.description AS description
    FROM public.reels r
    LEFT JOIN public.reel_views rv
      ON rv.reel_id = r.id
      AND COALESCE(rv.viewed_at, now()) >= v_since
    WHERE r.author_id = v_uid
    GROUP BY r.id, r.likes_count, r.comments_count, r.created_at, r.thumbnail_url, r.description
    ORDER BY views DESC
    LIMIT 5
  ) t;

  -- Follower gender distribution
  SELECT JSONB_BUILD_OBJECT(
    'male', COALESCE(SUM(CASE WHEN lower(p.gender) IN ('male','m','м','мужчина') THEN 1 ELSE 0 END), 0),
    'female', COALESCE(SUM(CASE WHEN lower(p.gender) IN ('female','f','ж','женщина') THEN 1 ELSE 0 END), 0),
    'unknown', COALESCE(SUM(CASE WHEN p.gender IS NULL OR trim(p.gender) = '' OR lower(p.gender) NOT IN ('male','m','м','мужчина','female','f','ж','женщина') THEN 1 ELSE 0 END), 0)
  )
  INTO v_followers_gender
  FROM public.followers f
  LEFT JOIN public.profiles p
    ON p.user_id = f.follower_id
  WHERE f.following_id = v_uid;

  -- ================================
  -- New: creator quality / hooks
  -- ================================

  -- Aggregate viewer interactions on creator reels in the window
  SELECT
    COALESCE(AVG(NULLIF(uri.completion_rate, 0)), 0),
    COALESCE(AVG(NULLIF(uri.watch_duration_seconds, 0)), 0),
    COALESCE(AVG(CASE WHEN uri.rewatch_count > 0 OR uri.rewatched THEN 1.0 ELSE 0.0 END), 0),
    COALESCE(AVG(CASE WHEN uri.skipped_quickly OR COALESCE(uri.skipped_at_second, 999999) < 2 THEN 1.0 ELSE 0.0 END), 0)
  INTO
    v_avg_completion,
    v_avg_watch_seconds,
    v_rewatch_rate,
    v_skip_quickly_rate
  FROM public.user_reel_interactions uri
  JOIN public.reels r ON r.id = uri.reel_id
  WHERE r.author_id = v_uid
    AND uri.last_interaction_at >= v_since
    AND uri.viewed = true;

  -- Hook score: early retention proxy (0..100)
  -- - penalize quick skips
  -- - reward completion + rewatches
  v_hook_score := LEAST(
    100.0,
    GREATEST(
      0.0,
      (100.0 * (1.0 - v_skip_quickly_rate)) * 0.55
      + LEAST(v_avg_completion, 100.0) * 0.35
      + (v_rewatch_rate * 100.0) * 0.10
    )
  );

  -- ================================
  -- New: posting frequency
  -- ================================

  SELECT COUNT(*)
    INTO v_reels_in_window
  FROM public.reels
  WHERE author_id = v_uid
    AND created_at >= v_since;

  v_reels_per_day := ROUND(v_reels_in_window::NUMERIC / GREATEST(1, p_days)::NUMERIC, 3);
  v_reels_per_week := ROUND(v_reels_per_day * 7.0, 3);

  -- Average gap between reels (hours)
  SELECT COALESCE(AVG(gap_hours), NULL)
    INTO v_avg_gap_hours
  FROM (
    SELECT EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at))) / 3600.0 AS gap_hours
    FROM public.reels
    WHERE author_id = v_uid
      AND created_at >= v_since
  ) t
  WHERE gap_hours IS NOT NULL AND gap_hours >= 0;

  -- ================================
  -- New: trend alignment
  -- ================================

  -- Trending hashtags used in creator reels
  SELECT COUNT(DISTINCT r.id)
    INTO v_trending_hashtag_reels
  FROM public.reels r
  JOIN public.reel_hashtags rh ON rh.reel_id = r.id
  JOIN public.hashtags h ON h.id = rh.hashtag_id
  WHERE r.author_id = v_uid
    AND r.created_at >= v_since
    AND h.is_trending = true;

  -- Trending topics used
  SELECT COUNT(DISTINCT r.id)
    INTO v_trending_topic_reels
  FROM public.reels r
  JOIN public.reel_trending_topics rtt ON rtt.reel_id = r.id
  JOIN public.trending_topics tt ON tt.id = rtt.topic_id
  WHERE r.author_id = v_uid
    AND r.created_at >= v_since
    AND tt.is_active = true;

  -- Trending audio used
  SELECT COUNT(DISTINCT r.id)
    INTO v_trending_audio_reels
  FROM public.reels r
  JOIN public.reel_audio_tracks rat ON rat.reel_id = r.id
  JOIN public.audio_tracks at ON at.id = rat.audio_track_id
  WHERE r.author_id = v_uid
    AND r.created_at >= v_since
    AND at.is_trending = true;

  v_trending_hashtag_pct := CASE WHEN v_reels_in_window = 0 THEN 0 ELSE ROUND((v_trending_hashtag_reels::NUMERIC * 100.0) / v_reels_in_window::NUMERIC, 1) END;
  v_trending_topic_pct := CASE WHEN v_reels_in_window = 0 THEN 0 ELSE ROUND((v_trending_topic_reels::NUMERIC * 100.0) / v_reels_in_window::NUMERIC, 1) END;
  v_trending_audio_pct := CASE WHEN v_reels_in_window = 0 THEN 0 ELSE ROUND((v_trending_audio_reels::NUMERIC * 100.0) / v_reels_in_window::NUMERIC, 1) END;

  -- Top trending hashtags used (last p_days)
  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'hashtag', hashtag,
        'trend_level', trend_level,
        'uses', uses
      )
      ORDER BY uses DESC
    ),
    '[]'::JSONB
  )
  INTO v_top_trending_hashtags
  FROM (
    SELECT h.hashtag,
           h.trend_level,
           COUNT(*)::INT AS uses
    FROM public.reels r
    JOIN public.reel_hashtags rh ON rh.reel_id = r.id
    JOIN public.hashtags h ON h.id = rh.hashtag_id
    WHERE r.author_id = v_uid
      AND r.created_at >= v_since
      AND h.is_trending = true
    GROUP BY h.hashtag, h.trend_level
    ORDER BY uses DESC
    LIMIT 10
  ) t;

  RETURN JSONB_BUILD_OBJECT(
    'days', GREATEST(1, p_days),
    'since', v_since,
    'views_total', v_views_total,
    'views_non_followers', v_views_non_followers,
    'views_non_followers_pct', v_non_followers_pct,
    'followers_total', v_followers_total,
    'followers_gained', v_followers_gained,
    'reels_total', v_reels_total,
    'likes_total', v_likes_total,
    'comments_total', v_comments_total,
    'views_by_day', v_views_by_day,
    'views_by_hour', v_views_by_hour,
    'top_reels', v_top_reels,
    'followers_gender', v_followers_gender,

    'creator_quality', JSONB_BUILD_OBJECT(
      'hook_score', ROUND(v_hook_score, 1),
      'avg_completion_rate', ROUND(COALESCE(v_avg_completion, 0), 2),
      'avg_watch_duration_seconds', ROUND(COALESCE(v_avg_watch_seconds, 0), 2),
      'rewatch_rate', ROUND(COALESCE(v_rewatch_rate, 0) * 100.0, 1),
      'skip_quickly_rate', ROUND(COALESCE(v_skip_quickly_rate, 0) * 100.0, 1)
    ),

    'posting_frequency', JSONB_BUILD_OBJECT(
      'reels_in_window', v_reels_in_window,
      'reels_per_day', v_reels_per_day,
      'reels_per_week', v_reels_per_week,
      'avg_gap_hours', CASE WHEN v_avg_gap_hours IS NULL THEN NULL ELSE ROUND(v_avg_gap_hours, 2) END
    ),

    'trend_alignment', JSONB_BUILD_OBJECT(
      'trending_hashtag_reels', v_trending_hashtag_reels,
      'trending_hashtag_pct', v_trending_hashtag_pct,
      'trending_topic_reels', v_trending_topic_reels,
      'trending_topic_pct', v_trending_topic_pct,
      'trending_audio_reels', v_trending_audio_reels,
      'trending_audio_pct', v_trending_audio_pct,
      'top_trending_hashtags', v_top_trending_hashtags
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_creator_insights(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_creator_insights(INT) TO authenticated;

COMMENT ON FUNCTION public.get_creator_insights IS
  'Creator insights + analytics: adds hook score, completion/rewatch/skip rates, posting frequency, trend alignment (hashtags/topics/audio).';
