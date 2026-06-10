-- =========================================================================
-- Fix existing RPC ambiguity without rewriting historical migrations
-- Generated from corrected function bodies so production receives fixes via a new migration.
-- =========================================================================

-- Source: 20260221143000_get_reels_feed_v2_fallback_and_visibility.sql
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


-- Source: 20260223180000_chat_seq_ack_inbox_audit_v3.sql
CREATE OR REPLACE FUNCTION public.chat_get_inbox_v2(
  p_limit INTEGER DEFAULT 100,
  p_cursor_seq BIGINT DEFAULT NULL
)
RETURNS TABLE (
  conversation_id UUID,
  updated_at TIMESTAMPTZ,
  last_seq BIGINT,
  last_message_id UUID,
  last_sender_id UUID,
  last_preview_text TEXT,
  last_created_at TIMESTAMPTZ,
  unread_count BIGINT,
  participants JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM public.rpc_audit_write_v1('chat_get_inbox_v2', NULL, NULL, NULL, 'ok', NULL);

  RETURN QUERY
  WITH my_convs AS (
    SELECT cp.conversation_id
    FROM public.conversation_participants cp
    WHERE cp.user_id = v_user
  ),
  roll AS (
    SELECT
      c.id AS conversation_id,
      c.updated_at,
      COALESCE(cs.last_seq, 0) AS last_seq,
      cs.last_message_id,
      cs.last_sender_id,
      cs.last_preview_text,
      cs.last_created_at,
      COALESCE(cur.read_up_to_seq, 0) AS read_up_to_seq
    FROM my_convs mc
    JOIN public.conversations c ON c.id = mc.conversation_id
    LEFT JOIN public.conversation_state cs ON cs.conversation_id = c.id
    LEFT JOIN public.conversation_cursors cur
      ON cur.conversation_id = c.id
     AND cur.user_id = v_user
    WHERE (p_cursor_seq IS NULL OR COALESCE(cs.last_seq, 0) < p_cursor_seq)
    ORDER BY COALESCE(cs.last_seq, 0) DESC, c.updated_at DESC
    LIMIT v_lim
  ),
  parts AS (
    SELECT
      cp.conversation_id,
      jsonb_agg(
        jsonb_build_object(
          'user_id', cp.user_id,
          'profile', jsonb_build_object(
            'display_name', pr.display_name,
            'avatar_url', pr.avatar_url
          )
        )
        ORDER BY cp.user_id
      ) AS participants
    FROM public.conversation_participants cp
    LEFT JOIN public.profiles pr ON pr.user_id = cp.user_id
    WHERE cp.conversation_id IN (SELECT r.conversation_id FROM roll r)
    GROUP BY cp.conversation_id
  )
  SELECT
    r.conversation_id,
    r.updated_at,
    r.last_seq,
    r.last_message_id,
    r.last_sender_id,
    r.last_preview_text,
    r.last_created_at,
    GREATEST(r.last_seq - r.read_up_to_seq, 0) AS unread_count,
    COALESCE(p.participants, '[]'::jsonb) AS participants
  FROM roll r
  LEFT JOIN parts p ON p.conversation_id = r.conversation_id
  ORDER BY r.last_seq DESC, r.updated_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_get_inbox_v2(INTEGER, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_get_inbox_v2(INTEGER, BIGINT) TO authenticated;


-- Source: 20260224095000_chat_hotfix_send_message_v1_unique_index_detection.sql
CREATE OR REPLACE FUNCTION public.send_message_v1(
  p_conversation_id UUID,
  p_client_msg_id UUID,
  p_body TEXT
)
RETURNS TABLE (
  message_id UUID,
  seq BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_variable
DECLARE
  initiator UUID := auth.uid();
  trimmed TEXT;
  inserted_id UUID;
  inserted_seq BIGINT;
  has_unique_idempotency_index BOOLEAN := EXISTS (
    SELECT 1
    FROM pg_class ic
    JOIN pg_namespace n ON n.oid = ic.relnamespace
    JOIN pg_index ix ON ix.indexrelid = ic.oid
    WHERE n.nspname = 'public'
      AND ic.relname = 'idx_messages_conv_sender_client_msg'
      AND ix.indisunique = true
  );

  payload JSONB;
  kind TEXT;
  final_content TEXT;
  final_media_url TEXT;
  final_media_type TEXT;
  final_duration INTEGER;
  final_shared_post UUID;
  final_shared_reel UUID;
BEGIN
  IF initiator IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_conversation' USING ERRCODE = '22023';
  END IF;

  IF p_client_msg_id IS NULL THEN
    RAISE EXCEPTION 'invalid_client_msg_id' USING ERRCODE = '22023';
  END IF;

  IF p_body IS NULL THEN
    RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
  END IF;

  trimmed := btrim(p_body);
  IF length(trimmed) < 1 OR length(trimmed) > 4000 THEN
    RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = initiator
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  PERFORM public.chat_rate_limit_check_v1('msg_send', 60, 60);

  SELECT m.id, m.seq
    INTO inserted_id, inserted_seq
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_id = initiator
    AND m.client_msg_id = p_client_msg_id
  LIMIT 1;

  IF inserted_id IS NOT NULL THEN
    message_id := inserted_id;
    seq := inserted_seq;
    RETURN NEXT;
    RETURN;
  END IF;

  BEGIN
    IF left(trimmed, 1) = '{' THEN
      payload := trimmed::jsonb;
    ELSE
      payload := NULL;
    END IF;
  EXCEPTION
    WHEN others THEN
      payload := NULL;
  END;

  final_content := trimmed;
  final_media_url := NULL;
  final_media_type := NULL;
  final_duration := NULL;
  final_shared_post := NULL;
  final_shared_reel := NULL;

  IF payload IS NOT NULL THEN
    kind := coalesce(payload->>'kind', '');

    IF kind = 'text' THEN
      final_content := coalesce(payload->>'text', '');
      final_content := btrim(final_content);

    ELSIF kind = 'media' THEN
      final_media_type := btrim(coalesce(payload->>'media_type', ''));
      final_media_url := btrim(coalesce(payload->>'media_url', ''));
      final_content := btrim(coalesce(payload->>'text', ''));
      final_duration := NULLIF((payload->>'duration_seconds')::int, 0);

      IF final_content = '' THEN
        final_content := 'рџ“Ћ';
      END IF;

      IF final_media_type NOT IN ('image','video','voice','video_circle') THEN
        RAISE EXCEPTION 'invalid_media_type' USING ERRCODE = '22023';
      END IF;

      IF length(final_media_url) < 1 OR length(final_media_url) > 2048 THEN
        RAISE EXCEPTION 'invalid_media_url' USING ERRCODE = '22023';
      END IF;

    ELSIF kind = 'share_post' THEN
      final_shared_post := (payload->>'post_id')::uuid;
      final_content := btrim(coalesce(payload->>'text', 'рџ“Њ РџРѕСЃС‚'));

    ELSIF kind = 'share_reel' THEN
      final_shared_reel := (payload->>'reel_id')::uuid;
      final_content := btrim(coalesce(payload->>'text', 'рџЋ¬ Р РёР»СЃ'));

    END IF;

    IF final_content IS NULL OR length(btrim(final_content)) < 1 OR length(final_content) > 4000 THEN
      RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF has_unique_idempotency_index THEN
    INSERT INTO public.messages(
      conversation_id,
      sender_id,
      content,
      client_msg_id,
      media_url,
      media_type,
      duration_seconds,
      shared_post_id,
      shared_reel_id
    )
    VALUES (
      p_conversation_id,
      initiator,
      final_content,
      p_client_msg_id,
      final_media_url,
      final_media_type,
      final_duration,
      final_shared_post,
      final_shared_reel
    )
    ON CONFLICT (conversation_id, sender_id, client_msg_id)
      WHERE client_msg_id IS NOT NULL
    DO NOTHING
    RETURNING id, seq INTO inserted_id, inserted_seq;
  ELSE
    INSERT INTO public.messages(
      conversation_id,
      sender_id,
      content,
      client_msg_id,
      media_url,
      media_type,
      duration_seconds,
      shared_post_id,
      shared_reel_id
    )
    VALUES (
      p_conversation_id,
      initiator,
      final_content,
      p_client_msg_id,
      final_media_url,
      final_media_type,
      final_duration,
      final_shared_post,
      final_shared_reel
    )
    RETURNING id, seq INTO inserted_id, inserted_seq;
  END IF;

  IF inserted_id IS NULL THEN
    SELECT m.id, m.seq
      INTO inserted_id, inserted_seq
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id = initiator
      AND m.client_msg_id = p_client_msg_id
    LIMIT 1;
  END IF;

  IF inserted_id IS NULL THEN
    RAISE EXCEPTION 'send_failed' USING ERRCODE = 'P0001';
  END IF;

  message_id := inserted_id;
  seq := inserted_seq;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.send_message_v1(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message_v1(UUID, UUID, TEXT) TO authenticated;


-- Source: 20260224154000_req_0140_call_signaling_state_machine.sql
create or replace function public.call_process_timeouts_v1()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    select c_expired.id
    from public.calls c_expired
    where c_expired.state = 'ringing'
      and c_expired.expires_at < now()
    for update skip locked
  )
  update public.calls c
  set state = 'missed',
      ended_at = now(),
      end_reason = 'timeout'
  from expired e
  where c.id = e.id;

  get diagnostics v_count = row_count;

  -- Publish events for missed calls
  insert into public.delivery_outbox (topic, aggregate_id, event_type, payload)
  select 'call', c.id, 'call.missed', jsonb_build_object('call_id', c.id, 'missed_at', now())
  from public.calls c
  where c.state = 'missed' and c.ended_at >= now() - interval '5 seconds';

  return v_count;
end;
$$;
-- Grant execute to authenticated users
grant execute on function public.call_create_v1(uuid, text, jsonb) to authenticated;
grant execute on function public.call_accept_v1(uuid, jsonb) to authenticated;
grant execute on function public.call_decline_v1(uuid) to authenticated;
grant execute on function public.call_cancel_v1(uuid) to authenticated;
grant execute on function public.call_end_v1(uuid, text) to authenticated;
-- Grant timeout processor to service_role only
revoke all on function public.call_process_timeouts_v1() from public;


-- Source: 20260224162000_phase1_i_echo_chamber_limiter.sql
CREATE OR REPLACE FUNCTION public.batch_analyze_diversity_v1(
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  user_id UUID,
  is_echo_chamber BOOLEAN,
  author_diversity_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Analyze active users (had impressions in last 24h)
  RETURN QUERY
  WITH active_users AS (
    SELECT DISTINCT ri.user_id
    FROM public.reel_impressions ri
    WHERE ri.viewed_at > NOW() - INTERVAL '24 hours'
      AND ri.user_id IS NOT NULL
    LIMIT p_limit
  )
  SELECT 
    au.user_id,
    analyze_user_diversity_v1(au.user_id) AS is_echo_chamber,
    (SELECT ucd.author_diversity_score FROM public.user_consumption_diversity ucd WHERE ucd.user_id = au.user_id)
  FROM active_users au;
END;
$$;
COMMENT ON FUNCTION batch_analyze_diversity_v1 IS


-- Source: 20260530050000_story_analytics.sql
CREATE OR REPLACE FUNCTION public.get_story_analytics_v1(
  p_creator_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH story_stats AS (
    SELECT
      COUNT(DISTINCT sv.story_id) AS total_stories,
      COUNT(sv.id) AS total_views,
      COUNT(DISTINCT sv.viewer_id) AS unique_viewers,
      COUNT(sr.id) AS total_replies,
      COUNT(str.id) AS total_reactions,
      COUNT(spv.id) AS poll_responses,
      COUNT(sqa.id) AS quiz_responses,
      COUNT(sesv.id) AS slider_interactions
    FROM public.stories s
    LEFT JOIN public.story_views sv ON sv.story_id = s.id AND sv.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    LEFT JOIN public.story_replies sr ON sr.story_id = s.id AND sr.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    LEFT JOIN public.story_reactions str ON str.story_id = s.id AND str.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    LEFT JOIN public.story_poll_votes spv ON spv.poll_id IN (SELECT sp.id FROM story_polls sp WHERE sp.story_id = s.id) AND spv.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    LEFT JOIN public.story_emoji_slider_votes sesv ON sesv.slider_id IN (SELECT ses.id FROM story_emoji_sliders ses WHERE ses.story_id = s.id) AND sesv.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    WHERE s.author_id = p_creator_id
  )
  SELECT jsonb_build_object(
    'total_stories', COALESCE(total_stories, 0),
    'total_views', COALESCE(total_views, 0),
    'unique_viewers', COALESCE(unique_viewers, 0),
    'total_replies', COALESCE(total_replies, 0),
    'total_reactions', COALESCE(total_reactions, 0),
    'poll_responses', COALESCE(poll_responses, 0),
    'quiz_responses', COALESCE(quiz_responses, 0),
    'slider_interactions', COALESCE(slider_interactions, 0),
    'completion_rate', CASE WHEN total_views > 0 THEN ROUND((unique_viewers::NUMERIC / total_views::NUMERIC) * 100, 2) ELSE 0 END,
    'interactions_per_story', CASE WHEN total_stories > 0 THEN ROUND((total_replies + total_reactions + poll_responses + quiz_responses + slider_interactions)::NUMERIC / total_stories, 2) ELSE 0 END
  ) INTO v_result
  FROM story_stats;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_story_analytics_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_story_analytics_v1(UUID, INTEGER) TO authenticated, service_role;


-- Source: 20260530070000_content_type_breakdown.sql
CREATE OR REPLACE FUNCTION public.get_interactions_by_type_v1(
  p_creator_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH interactions AS (
    -- Reels interactions
    SELECT 
      'reels' AS content_type,
      COALESCE(SUM(rm.likes + rm.comments + rm.saves + rm.shares), 0) AS interactions
    FROM public.reels r
    LEFT JOIN public.reel_metrics rm ON rm.reel_id = r.id
    WHERE r.author_id = p_creator_id
    AND r.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    
    UNION ALL
    
    -- Posts interactions
    SELECT 
      'posts' AS content_type,
      COALESCE(SUM(likes_count + comments_count + saves_count), 0) AS interactions
    FROM public.posts p
    WHERE p.author_id = p_creator_id
    AND p.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    
    UNION ALL
    
    -- Stories interactions (replies + reactions + poll votes + quiz answers)
    SELECT 
      'stories' AS content_type,
      COALESCE(COUNT(sr.id) + COUNT(str.id) + COUNT(spv.id), 0) AS interactions
    FROM public.stories s
    LEFT JOIN public.story_replies sr ON sr.story_id = s.id AND sr.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    LEFT JOIN public.story_reactions str ON str.story_id = s.id AND str.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    LEFT JOIN public.story_poll_votes spv ON spv.poll_id IN (SELECT sp.id FROM story_polls sp WHERE sp.story_id = s.id) AND spv.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    WHERE s.author_id = p_creator_id
    
    UNION ALL
    
    -- Live interactions
    SELECT 
      'live' AS content_type,
      COALESCE(SUM(COALESCE(comment_count, 0) + COALESCE(share_count, 0)), 0) AS interactions
    FROM public.live_sessions l
    WHERE l.creator_id = p_creator_id
    AND l.started_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', content_type,
      'interactions', interactions
    )
  ) INTO v_result
  FROM interactions;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION public.get_interactions_by_type_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_interactions_by_type_v1(UUID, INTEGER) TO authenticated, service_role;


