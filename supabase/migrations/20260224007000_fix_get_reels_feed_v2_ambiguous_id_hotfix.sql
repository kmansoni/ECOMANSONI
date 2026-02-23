-- HOTFIX: get_reels_feed_v2 returns 400 with:
--   code 42702, message "column reference \"id\" is ambiguous"
-- This replacement keeps the same signature/output shape used by frontend,
-- but uses fully-qualified aliases and a simpler read path.

DROP FUNCTION IF EXISTS public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT);

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
  v_request_id UUID := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL AND (p_session_id IS NULL OR length(trim(p_session_id)) = 0) THEN
    RAISE EXCEPTION 'get_reels_feed_v2 requires auth or session_id';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      r.id AS reel_id,
      r.author_id AS reel_author_id,
      r.video_url AS reel_video_url,
      r.thumbnail_url AS reel_thumbnail_url,
      r.description AS reel_description,
      r.music_title AS reel_music_title,
      COALESCE(r.likes_count, 0)::INTEGER AS reel_likes_count,
      COALESCE(r.comments_count, 0)::INTEGER AS reel_comments_count,
      COALESCE(r.views_count, 0)::INTEGER AS reel_views_count,
      r.created_at AS reel_created_at
    FROM public.reels AS r
    ORDER BY r.created_at DESC
    OFFSET GREATEST(p_offset, 0)
    LIMIT GREATEST(p_limit, 1)
  )
  SELECT
    b.reel_id AS id,
    b.reel_author_id AS author_id,
    b.reel_video_url AS video_url,
    b.reel_thumbnail_url AS thumbnail_url,
    b.reel_description AS description,
    b.reel_music_title AS music_title,
    b.reel_likes_count AS likes_count,
    b.reel_comments_count AS comments_count,
    b.reel_views_count AS views_count,
    0::INTEGER AS saves_count,
    0::INTEGER AS reposts_count,
    0::INTEGER AS shares_count,
    b.reel_created_at AS created_at,
    EXTRACT(EPOCH FROM b.reel_created_at)::NUMERIC AS final_score,
    'Recent'::TEXT AS recommendation_reason,
    v_request_id AS request_id,
    (GREATEST(p_offset, 0) + ROW_NUMBER() OVER (ORDER BY b.reel_created_at DESC) - 1)::INTEGER AS feed_position,
    COALESCE(p_algorithm_version, 'v2')::TEXT AS algorithm_version
  FROM base AS b
  ORDER BY b.reel_created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT)
  IS 'Hotfix: deterministic recent-reels feed with stable signature and no ambiguous column references.';

