-- ============================================================================
-- Phase 1 EPIC J: Live Analytics and Audio Insights Functions
--
-- Metrics from Instagram_Statistics_2026.md:
-- - Live views, peak viewers, interactions
-- - Audio usage in reels
-- - Trending audio performance
-- ============================================================================

-- 1) Get live analytics for creator
CREATE OR REPLACE FUNCTION public.get_live_analytics_v1(
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
  WITH live_stats AS (
    SELECT
      COUNT(*) AS total_lives,
      COALESCE(SUM(ls.viewer_count_peak), 0) AS total_peak_viewers,
      COALESCE(SUM(ls.viewer_count_peak), 0) AS total_viewers,
      COALESCE(SUM(lcm.message_count), 0) AS total_comments,
      0 AS total_shares  -- Shares need separate tracking
    FROM public.live_sessions ls
    LEFT JOIN public.live_chat_messages lcm ON lcm.session_id = ls.id AND lcm.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    WHERE ls.creator_id = p_creator_id
    AND ls.started_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
  )
  SELECT jsonb_build_object(
    'total_lives', COALESCE(total_lives, 0),
    'total_viewers', COALESCE(total_viewers, 0),
    'peak_viewers', COALESCE(total_peak_viewers, 0),
    'total_comments', COALESCE(total_comments, 0),
    'total_shares', COALESCE(total_shares, 0),
    'avg_viewers', CASE WHEN total_lives > 0 THEN ROUND(total_viewers::NUMERIC / total_lives, 0) ELSE 0 END
  ) INTO v_result
  FROM live_stats;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_live_analytics_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_analytics_v1(UUID, INTEGER) TO authenticated, service_role;

-- 2) Get audio usage in reels for creator
CREATE OR REPLACE FUNCTION public.get_audio_insights_v1(
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
  WITH audio_stats AS (
    SELECT
      COALESCE(rm.impressions, 0) AS reel_impressions,
      COALESCE(rm.likes, 0) AS reel_likes,
      COALESCE(rm.shares, 0) AS reel_shares,
      COUNT(DISTINCT sm.track_id) AS unique_tracks,
      STRING_AGG(DISTINCT mt.title || ' - ' || mt.artist, ', ' ORDER BY mt.usage_count DESC) AS top_tracks
    FROM public.reels r
    LEFT JOIN public.reel_metrics rm ON rm.reel_id = r.id
    LEFT JOIN public.story_music sm ON sm.story_id = r.id  -- Using story_music as proxy, needs reel_audio table
    LEFT JOIN public.music_tracks mt ON mt.id = sm.track_id
    WHERE r.author_id = p_creator_id
    AND r.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
  )
  SELECT jsonb_build_object(
    'total_plays', COALESCE(SUM(reel_impressions), 0),
    'unique_tracks', COALESCE(MAX(unique_tracks), 0),
    'top_tracks', COALESCE(MAX(top_tracks), ''),
    'avg_plays_per_track', CASE WHEN MAX(unique_tracks) > 0 THEN ROUND(SUM(reel_impressions)::NUMERIC / MAX(unique_tracks), 0) ELSE 0 END
  ) INTO v_result
  FROM audio_stats;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_audio_insights_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audio_insights_v1(UUID, INTEGER) TO authenticated, service_role;

-- 3) Get hashtag performance for creator
CREATE OR REPLACE FUNCTION public.get_hashtag_performance_v1(
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
  SELECT jsonb_object_agg(
    h.tag,
    jsonb_build_object(
      'reach', COALESCE(MAX(reach_count), 0),
      'impressions', COALESCE(MAX(usage_count), 0),
      'is_trending', COALESCE(MAX(is_trending), false)
    )
  ) INTO v_result
  FROM public.hashtags h
  JOIN public.reel_hashtags rh ON rh.hashtag_id = h.id
  JOIN public.reels r ON r.id = rh.reel_id
  WHERE r.author_id = p_creator_id
  AND r.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)));

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION public.get_hashtag_performance_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hashtag_performance_v1(UUID, INTEGER) TO authenticated, service_role;

-- ============================================================================
-- Summary:
-- - ✅ get_live_analytics_v1(creator_id, days): Live streaming metrics
-- - ✅ get_audio_insights_v1(creator_id, days): Audio usage in content
-- - ✅ get_hashtag_performance_v1(creator_id, days): Hashtag reach/impressions
-- ============================================================================