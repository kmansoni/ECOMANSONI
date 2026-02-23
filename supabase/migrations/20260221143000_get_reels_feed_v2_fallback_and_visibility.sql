-- ============================================================================
-- PATCH: get_reels_feed_v2 fallback (no-empty) + channel visibility alignment
--
-- Why:
--  - After restoring back-compat in 20260221140000, the earlier no-empty
--    fallback (20260221090000) is no longer guaranteed to be active.
--  - The feed's channel visibility logic should match get_user_reels_v1:
--      * Public channels are visible to everyone
--      * Private channels are visible only to members
--      * Sensitive content is visible only inside private channels to members
--
-- What:
--  - Keeps the current RPC signature + return shape (including telemetry
--    metadata: request_id/feed_position/algorithm_version)
--  - Adds a fallback pass when the strict pass returns 0 rows (only for first
--    page) by disabling freq-cap while keeping all other gates.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_reels_feed_v2(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_session_id TEXT DEFAULT NULL,
  p_exploration_ratio NUMERIC DEFAULT 0.20,
  p_recency_days INTEGER DEFAULT 30,
  p_freq_cap_hours INTEGER DEFAULT 6,
  p_algorithm_version TEXT DEFAULT 'v2'
)
RETURNS TABLE (
  id UUID,
  author_id UUID,
  video_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  music_title TEXT,
  likes_count INTEGER,
  comments_count INTEGER,
  views_count INTEGER,
  saves_count INTEGER,
  reposts_count INTEGER,
  shares_count INTEGER,
  created_at TIMESTAMPTZ,
  final_score NUMERIC,
  recommendation_reason TEXT,
  -- telemetry metadata
  request_id UUID,
  feed_position INTEGER,
  algorithm_version TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_exploitation_limit INTEGER;
  v_exploration_limit INTEGER;
  v_request_id UUID := gen_random_uuid();
  v_algo_version TEXT := COALESCE(p_algorithm_version, 'v2');

  v_effective_freq_cap_hours INTEGER := COALESCE(p_freq_cap_hours, 6);
  v_effective_recency_days INTEGER := COALESCE(p_recency_days, 30);

  v_rows INTEGER := 0;
BEGIN
  IF v_user_id IS NULL AND (p_session_id IS NULL OR length(trim(p_session_id)) = 0) THEN
    RAISE EXCEPTION 'get_reels_feed_v2 requires auth or session_id';
  END IF;

  v_exploitation_limit := GREATEST(0, FLOOR(COALESCE(p_limit, 50) * (1 - COALESCE(p_exploration_ratio, 0.20))));
  v_exploration_limit := GREATEST(0, COALESCE(p_limit, 50) - v_exploitation_limit);

  -- Pass 1 (strict): respect freq-cap
  RETURN QUERY
  WITH viewer AS (
    SELECT
      v_user_id AS user_id,
      CASE WHEN v_user_id IS NULL THEN p_session_id ELSE NULL END AS session_id
  ),
  feedback AS (
    SELECT f.reel_id, f.feedback
    FROM public.user_reel_feedback f
    JOIN viewer v ON (
      (v.user_id IS NOT NULL AND f.user_id = v.user_id)
      OR
      (v.user_id IS NULL AND f.user_id IS NULL AND f.session_id = v.session_id)
    )
  ),
  blocked AS (
    SELECT reel_id
    FROM feedback
    WHERE feedback = 'not_interested'
  ),
  recent_impressions AS (
    SELECT i.reel_id
    FROM public.reel_impressions i
    JOIN viewer v ON (
      (v.user_id IS NOT NULL AND i.user_id = v.user_id)
      OR
      (v.user_id IS NULL AND i.user_id IS NULL AND i.session_id = v.session_id)
    )
    WHERE v_effective_freq_cap_hours > 0
      AND i.created_at >= now() - make_interval(hours => v_effective_freq_cap_hours)
    GROUP BY i.reel_id
  ),
  recent_author_impressions AS (
    SELECT r.author_id, COUNT(*)::INTEGER AS impressions_24h
    FROM public.reel_impressions i
    JOIN public.reels r ON r.id = i.reel_id
    JOIN viewer v ON (
      (v.user_id IS NOT NULL AND i.user_id = v.user_id)
      OR
      (v.user_id IS NULL AND i.user_id IS NULL AND i.session_id = v.session_id)
    )
    WHERE i.created_at >= now() - interval '24 hours'
    GROUP BY r.author_id
  ),
  affinities AS (
    SELECT ua.author_id, ua.affinity_score
    FROM public.user_author_affinity ua
    WHERE v_user_id IS NOT NULL AND ua.user_id = v_user_id
  ),
  following AS (
    SELECT f.following_id
    FROM public.followers f
    WHERE v_user_id IS NOT NULL AND f.follower_id = v_user_id
  ),
  candidates AS (
    SELECT
      r.id,
      r.author_id,
      r.video_url,
      r.thumbnail_url,
      r.description,
      r.music_title,
      r.likes_count,
      r.comments_count,
      r.views_count,
      COALESCE(r.saves_count, 0) AS saves_count,
      COALESCE(r.reposts_count, 0) AS reposts_count,
      COALESCE(r.shares_count, 0) AS shares_count,
      r.created_at,

      COALESCE((
        SELECT AVG(uri.completion_rate)
        FROM public.user_reel_interactions uri
        WHERE uri.reel_id = r.id AND uri.completion_rate > 0
      ), 0.0) AS global_completion_rate,

      COALESCE((SELECT affinity_score FROM affinities a WHERE a.author_id = r.author_id), 0.0) AS affinity_score,
      CASE WHEN EXISTS (SELECT 1 FROM following f WHERE f.following_id = r.author_id) THEN 1 ELSE 0 END AS is_following,
      COALESCE((SELECT feedback FROM feedback fb WHERE fb.reel_id = r.id), NULL) AS explicit_feedback,
      COALESCE((SELECT impressions_24h FROM recent_author_impressions rai WHERE rai.author_id = r.author_id), 0) AS author_impressions_24h,

      COALESCE(public.get_hashtag_boost_score(r.id), 0.0) AS hashtag_boost,
      COALESCE(public.get_audio_boost_score(r.id), 0.0) AS audio_boost,
      COALESCE(public.get_topic_boost_score(r.id), 0.0) AS topic_boost,

      (100.0 * EXP(-EXTRACT(EPOCH FROM (now() - r.created_at)) / 86400.0)) AS recency_score,
      COALESCE(public.calculate_virality_score(r.id), 0.0) AS virality_score,

      r.channel_id,
      COALESCE(ch.is_public, false) AS channel_is_public,
      COALESCE(r.moderation_status, 'approved') AS moderation_status,
      COALESCE(r.is_nsfw, false) AS is_nsfw,
      COALESCE(r.is_graphic_violence, false) AS is_graphic_violence,
      COALESCE(r.is_political_extremism, false) AS is_political_extremism

    FROM public.reels r
    LEFT JOIN public.channels ch ON ch.id = r.channel_id
    WHERE r.created_at >= now() - (v_effective_recency_days || ' days')::INTERVAL
      AND r.id NOT IN (SELECT reel_id FROM blocked)
      AND r.id NOT IN (SELECT reel_id FROM recent_impressions)
      AND (v_user_id IS NULL OR r.author_id <> v_user_id)

      AND COALESCE(r.moderation_status, 'approved') <> 'blocked'

      -- Visibility + sensitive gating (aligned with get_user_reels_v1)
      AND (
        (
          COALESCE(r.is_nsfw, false) = false
          AND COALESCE(r.is_graphic_violence, false) = false
          AND COALESCE(r.is_political_extremism, false) = false
          AND (
            r.channel_id IS NULL
            OR COALESCE(ch.is_public, false) = true
            OR (v_user_id IS NOT NULL AND public.is_channel_member(r.channel_id, v_user_id))
          )
        )
        OR
        (
          (
            COALESCE(r.is_nsfw, false) = true
            OR COALESCE(r.is_graphic_violence, false) = true
            OR COALESCE(r.is_political_extremism, false) = true
          )
          AND r.channel_id IS NOT NULL
          AND COALESCE(ch.is_public, false) = false
          AND v_user_id IS NOT NULL
          AND public.is_channel_member(r.channel_id, v_user_id)
        )
      )
  ),
  scored AS (
    SELECT
      c.*,
      LEAST(
        100.0,
        (
          public.calculate_advanced_engagement_score(
            c.likes_count,
            c.comments_count,
            c.views_count,
            c.saves_count,
            c.shares_count,
            c.reposts_count,
            GREATEST(LEAST(c.global_completion_rate, 100.0) / 100.0, 0.20)
          ) / 10.0
        ) * 100.0
      ) AS engagement_score,

      LEAST(100.0,
        (LEAST(c.global_completion_rate, 100.0) * 0.40) +
        (LEAST(c.virality_score, 100.0) * 0.20) +
        (LEAST((
          public.calculate_advanced_engagement_score(
            c.likes_count,
            c.comments_count,
            c.views_count,
            c.saves_count,
            c.shares_count,
            c.reposts_count,
            GREATEST(LEAST(c.global_completion_rate, 100.0) / 100.0, 0.20)
          ) / 10.0
        ) * 100.0, 100.0) * 0.30) +
        (LEAST(c.recency_score, 100.0) * 0.10)
      ) AS tiktok_quality_score,

      LEAST(100.0,
        (LEAST(c.affinity_score * 2.0, 80.0)) +
        (CASE WHEN c.is_following = 1 THEN 30.0 ELSE 0.0 END)
      ) AS instagram_personal_score,

      LEAST(100.0, (c.hashtag_boost + c.audio_boost + c.topic_boost) / 6.0) AS trend_boost_score,
      CASE WHEN c.explicit_feedback = 'interested' THEN 40.0 ELSE 0.0 END AS feedback_boost,
      LEAST(40.0, c.author_impressions_24h::NUMERIC * 4.0) AS author_penalty

    FROM candidates c
  ),
  exploitation AS (
    SELECT
      s.*,
      (
        (s.tiktok_quality_score * 0.60) +
        (s.instagram_personal_score * 0.40) +
        (s.trend_boost_score * 0.15) +
        s.feedback_boost -
        s.author_penalty
      ) AS final_score,
      CASE
        WHEN s.explicit_feedback = 'interested' THEN 'Explicit: interested'
        WHEN s.is_following = 1 THEN 'Following'
        WHEN s.affinity_score > 20 THEN 'High affinity'
        WHEN s.trend_boost_score > 20 THEN 'Trending boost'
        WHEN s.virality_score > 50 THEN 'Virality'
        ELSE 'Discovery'
      END AS recommendation_reason
    FROM scored s
    ORDER BY (
      (s.tiktok_quality_score * 0.60) +
      (s.instagram_personal_score * 0.40) +
      (s.trend_boost_score * 0.15) +
      s.feedback_boost -
      s.author_penalty
    ) DESC
    LIMIT v_exploitation_limit
    OFFSET GREATEST(0, COALESCE(p_offset, 0))
  ),
  exploration AS (
    SELECT
      s.*,
      (
        (s.tiktok_quality_score * 0.55) +
        (s.instagram_personal_score * 0.25) +
        (s.trend_boost_score * 0.25) +
        s.feedback_boost -
        s.author_penalty
      ) AS final_score,
      'Exploration' AS recommendation_reason
    FROM scored s
    WHERE s.id NOT IN (SELECT e.id FROM exploitation e)
      AND (s.tiktok_quality_score + s.trend_boost_score) >= 20.0
    ORDER BY random()
    LIMIT v_exploration_limit
  ),
  combined AS (
    SELECT
      e.id,
      e.author_id,
      e.video_url,
      e.thumbnail_url,
      e.description,
      e.music_title,
      e.likes_count,
      e.comments_count,
      e.views_count,
      e.saves_count,
      e.reposts_count,
      e.shares_count,
      e.created_at,
      e.final_score,
      e.recommendation_reason
    FROM exploitation e

    UNION ALL

    SELECT
      x.id,
      x.author_id,
      x.video_url,
      x.thumbnail_url,
      x.description,
      x.music_title,
      x.likes_count,
      x.comments_count,
      x.views_count,
      x.saves_count,
      x.reposts_count,
      x.shares_count,
      x.created_at,
      x.final_score,
      x.recommendation_reason
    FROM exploration x
  )
  SELECT
    c.id,
    c.author_id,
    c.video_url,
    c.thumbnail_url,
    c.description,
    c.music_title,
    c.likes_count,
    c.comments_count,
    c.views_count,
    c.saves_count,
    c.reposts_count,
    c.shares_count,
    c.created_at,
    c.final_score,
    c.recommendation_reason,
    v_request_id AS request_id,
    (GREATEST(0, COALESCE(p_offset, 0)) + ROW_NUMBER() OVER (ORDER BY c.final_score DESC) - 1)::INTEGER AS feed_position,
    v_algo_version AS algorithm_version
  FROM combined c
  ORDER BY c.final_score DESC
  LIMIT COALESCE(p_limit, 50);

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Pass 2 (fallback): if strict pass yields empty on the first page, disable freq-cap.
  IF v_rows = 0 AND v_effective_freq_cap_hours > 0 AND GREATEST(0, COALESCE(p_offset, 0)) = 0 THEN
    v_effective_freq_cap_hours := 0;
    v_effective_recency_days := GREATEST(v_effective_recency_days, 365);

    RETURN QUERY
    WITH viewer AS (
      SELECT
        v_user_id AS user_id,
        CASE WHEN v_user_id IS NULL THEN p_session_id ELSE NULL END AS session_id
    ),
    feedback AS (
      SELECT f.reel_id, f.feedback
      FROM public.user_reel_feedback f
      JOIN viewer v ON (
        (v.user_id IS NOT NULL AND f.user_id = v.user_id)
        OR
        (v.user_id IS NULL AND f.user_id IS NULL AND f.session_id = v.session_id)
      )
    ),
    blocked AS (
      SELECT reel_id
      FROM feedback
      WHERE feedback = 'not_interested'
    ),
    recent_impressions AS (
      SELECT i.reel_id
      FROM public.reel_impressions i
      JOIN viewer v ON (
        (v.user_id IS NOT NULL AND i.user_id = v.user_id)
        OR
        (v.user_id IS NULL AND i.user_id IS NULL AND i.session_id = v.session_id)
      )
      WHERE v_effective_freq_cap_hours > 0
        AND i.created_at >= now() - make_interval(hours => v_effective_freq_cap_hours)
      GROUP BY i.reel_id
    ),
    recent_author_impressions AS (
      SELECT r.author_id, COUNT(*)::INTEGER AS impressions_24h
      FROM public.reel_impressions i
      JOIN public.reels r ON r.id = i.reel_id
      JOIN viewer v ON (
        (v.user_id IS NOT NULL AND i.user_id = v.user_id)
        OR
        (v.user_id IS NULL AND i.user_id IS NULL AND i.session_id = v.session_id)
      )
      WHERE i.created_at >= now() - interval '24 hours'
      GROUP BY r.author_id
    ),
    affinities AS (
      SELECT ua.author_id, ua.affinity_score
      FROM public.user_author_affinity ua
      WHERE v_user_id IS NOT NULL AND ua.user_id = v_user_id
    ),
    following AS (
      SELECT f.following_id
      FROM public.followers f
      WHERE v_user_id IS NOT NULL AND f.follower_id = v_user_id
    ),
    candidates AS (
      SELECT
        r.id,
        r.author_id,
        r.video_url,
        r.thumbnail_url,
        r.description,
        r.music_title,
        r.likes_count,
        r.comments_count,
        r.views_count,
        COALESCE(r.saves_count, 0) AS saves_count,
        COALESCE(r.reposts_count, 0) AS reposts_count,
        COALESCE(r.shares_count, 0) AS shares_count,
        r.created_at,

        COALESCE((
          SELECT AVG(uri.completion_rate)
          FROM public.user_reel_interactions uri
          WHERE uri.reel_id = r.id AND uri.completion_rate > 0
        ), 0.0) AS global_completion_rate,

        COALESCE((SELECT affinity_score FROM affinities a WHERE a.author_id = r.author_id), 0.0) AS affinity_score,
        CASE WHEN EXISTS (SELECT 1 FROM following f WHERE f.following_id = r.author_id) THEN 1 ELSE 0 END AS is_following,
        COALESCE((SELECT feedback FROM feedback fb WHERE fb.reel_id = r.id), NULL) AS explicit_feedback,
        COALESCE((SELECT impressions_24h FROM recent_author_impressions rai WHERE rai.author_id = r.author_id), 0) AS author_impressions_24h,

        COALESCE(public.get_hashtag_boost_score(r.id), 0.0) AS hashtag_boost,
        COALESCE(public.get_audio_boost_score(r.id), 0.0) AS audio_boost,
        COALESCE(public.get_topic_boost_score(r.id), 0.0) AS topic_boost,

        (100.0 * EXP(-EXTRACT(EPOCH FROM (now() - r.created_at)) / 86400.0)) AS recency_score,
        COALESCE(public.calculate_virality_score(r.id), 0.0) AS virality_score,

        r.channel_id,
        COALESCE(ch.is_public, false) AS channel_is_public,
        COALESCE(r.moderation_status, 'approved') AS moderation_status,
        COALESCE(r.is_nsfw, false) AS is_nsfw,
        COALESCE(r.is_graphic_violence, false) AS is_graphic_violence,
        COALESCE(r.is_political_extremism, false) AS is_political_extremism

      FROM public.reels r
      LEFT JOIN public.channels ch ON ch.id = r.channel_id
      WHERE r.created_at >= now() - (v_effective_recency_days || ' days')::INTERVAL
        AND r.id NOT IN (SELECT reel_id FROM blocked)
        AND r.id NOT IN (SELECT reel_id FROM recent_impressions)
        AND (v_user_id IS NULL OR r.author_id <> v_user_id)

        AND COALESCE(r.moderation_status, 'approved') <> 'blocked'

        AND (
          (
            COALESCE(r.is_nsfw, false) = false
            AND COALESCE(r.is_graphic_violence, false) = false
            AND COALESCE(r.is_political_extremism, false) = false
            AND (
              r.channel_id IS NULL
              OR COALESCE(ch.is_public, false) = true
              OR (v_user_id IS NOT NULL AND public.is_channel_member(r.channel_id, v_user_id))
            )
          )
          OR
          (
            (
              COALESCE(r.is_nsfw, false) = true
              OR COALESCE(r.is_graphic_violence, false) = true
              OR COALESCE(r.is_political_extremism, false) = true
            )
            AND r.channel_id IS NOT NULL
            AND COALESCE(ch.is_public, false) = false
            AND v_user_id IS NOT NULL
            AND public.is_channel_member(r.channel_id, v_user_id)
          )
        )
    ),
    scored AS (
      SELECT
        c.*,
        LEAST(
          100.0,
          (
            public.calculate_advanced_engagement_score(
              c.likes_count,
              c.comments_count,
              c.views_count,
              c.saves_count,
              c.shares_count,
              c.reposts_count,
              GREATEST(LEAST(c.global_completion_rate, 100.0) / 100.0, 0.20)
            ) / 10.0
          ) * 100.0
        ) AS engagement_score,

        LEAST(100.0,
          (LEAST(c.global_completion_rate, 100.0) * 0.40) +
          (LEAST(c.virality_score, 100.0) * 0.20) +
          (LEAST((
            public.calculate_advanced_engagement_score(
              c.likes_count,
              c.comments_count,
              c.views_count,
              c.saves_count,
              c.shares_count,
              c.reposts_count,
              GREATEST(LEAST(c.global_completion_rate, 100.0) / 100.0, 0.20)
            ) / 10.0
          ) * 100.0, 100.0) * 0.30) +
          (LEAST(c.recency_score, 100.0) * 0.10)
        ) AS tiktok_quality_score,

        LEAST(100.0,
          (LEAST(c.affinity_score * 2.0, 80.0)) +
          (CASE WHEN c.is_following = 1 THEN 30.0 ELSE 0.0 END)
        ) AS instagram_personal_score,

        LEAST(100.0, (c.hashtag_boost + c.audio_boost + c.topic_boost) / 6.0) AS trend_boost_score,
        CASE WHEN c.explicit_feedback = 'interested' THEN 40.0 ELSE 0.0 END AS feedback_boost,
        LEAST(40.0, c.author_impressions_24h::NUMERIC * 4.0) AS author_penalty

      FROM candidates c
    ),
    exploitation AS (
      SELECT
        s.*,
        (
          (s.tiktok_quality_score * 0.60) +
          (s.instagram_personal_score * 0.40) +
          (s.trend_boost_score * 0.15) +
          s.feedback_boost -
          s.author_penalty
        ) AS final_score,
        CASE
          WHEN s.explicit_feedback = 'interested' THEN 'Explicit: interested'
          WHEN s.is_following = 1 THEN 'Following'
          WHEN s.affinity_score > 20 THEN 'High affinity'
          WHEN s.trend_boost_score > 20 THEN 'Trending boost'
          WHEN s.virality_score > 50 THEN 'Virality'
          ELSE 'Discovery'
        END AS recommendation_reason
      FROM scored s
      ORDER BY (
        (s.tiktok_quality_score * 0.60) +
        (s.instagram_personal_score * 0.40) +
        (s.trend_boost_score * 0.15) +
        s.feedback_boost -
        s.author_penalty
      ) DESC
      LIMIT v_exploitation_limit
      OFFSET 0
    ),
    exploration AS (
      SELECT
        s.*,
        (
          (s.tiktok_quality_score * 0.55) +
          (s.instagram_personal_score * 0.25) +
          (s.trend_boost_score * 0.25) +
          s.feedback_boost -
          s.author_penalty
        ) AS final_score,
        'Exploration' AS recommendation_reason
      FROM scored s
      WHERE s.id NOT IN (SELECT e.id FROM exploitation e)
        AND (s.tiktok_quality_score + s.trend_boost_score) >= 20.0
      ORDER BY random()
      LIMIT v_exploration_limit
    ),
    combined AS (
      SELECT
        e.id,
        e.author_id,
        e.video_url,
        e.thumbnail_url,
        e.description,
        e.music_title,
        e.likes_count,
        e.comments_count,
        e.views_count,
        e.saves_count,
        e.reposts_count,
        e.shares_count,
        e.created_at,
        e.final_score,
        e.recommendation_reason
      FROM exploitation e

      UNION ALL

      SELECT
        x.id,
        x.author_id,
        x.video_url,
        x.thumbnail_url,
        x.description,
        x.music_title,
        x.likes_count,
        x.comments_count,
        x.views_count,
        x.saves_count,
        x.reposts_count,
        x.shares_count,
        x.created_at,
        x.final_score,
        x.recommendation_reason
      FROM exploration x
    )
    SELECT
      c.id,
      c.author_id,
      c.video_url,
      c.thumbnail_url,
      c.description,
      c.music_title,
      c.likes_count,
      c.comments_count,
      c.views_count,
      c.saves_count,
      c.reposts_count,
      c.shares_count,
      c.created_at,
      c.final_score,
      c.recommendation_reason,
      v_request_id AS request_id,
      (ROW_NUMBER() OVER (ORDER BY c.final_score DESC) - 1)::INTEGER AS feed_position,
      v_algo_version AS algorithm_version
    FROM combined c
    ORDER BY c.final_score DESC
    LIMIT COALESCE(p_limit, 50);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT) IS
  'Main Reels feed ranking RPC (v2): back-compat signature + moderation/channel visibility + telemetry metadata + no-empty fallback (first page).';

