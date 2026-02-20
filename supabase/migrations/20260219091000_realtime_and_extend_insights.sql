-- Enable realtime for new settings/branded tables and extend creator insights

-- =====================================================
-- Realtime publication
-- =====================================================

DO $$
BEGIN
  -- user_settings
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_settings;
  EXCEPTION WHEN duplicate_object THEN
    -- already added
    NULL;
  END;

  -- branded_content_approved_authors
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.branded_content_approved_authors;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- =====================================================
-- Extend get_creator_insights
-- Adds: likes_total, comments_total, views_non_followers, top_reels, followers_gender
-- =====================================================

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

  -- Top reels by views in window (computed from reel_views)
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

  -- Follower gender distribution (aggregated)
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
    'followers_gender', v_followers_gender
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_creator_insights(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_creator_insights(INT) TO authenticated;
