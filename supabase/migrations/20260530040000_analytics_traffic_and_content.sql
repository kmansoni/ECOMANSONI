-- ============================================================================
-- Phase 1 EPIC J: Additional Analytics Functions (Traffic, Content Breakdown)
--
-- Provides missing metrics from Instagram_Statistics_2026.md:
-- - Traffic sources (feed, reels, explore, search)
-- - Content type breakdown
-- - Language preferences
-- - Days of week activity
-- ============================================================================

-- 1) Get traffic source breakdown for creator content
CREATE OR REPLACE FUNCTION public.get_traffic_sources_v1(
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
  WITH source_counts AS (
    SELECT 
      COALESCE(re.metadata->>'source_pool', 'unknown') AS source,
      COUNT(*) AS cnt
    FROM public.ranking_explanations re
    JOIN public.reels r ON r.id = re.reel_id
    WHERE r.author_id = p_creator_id
    AND re.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    GROUP BY source
  ),
  total AS (
    SELECT SUM(cnt) AS total_cnt FROM source_counts
  )
  SELECT jsonb_object_agg(
    source,
    ROUND((100.0 * cnt / COALESCE((SELECT total_cnt FROM total), 1)), 1)
  ) INTO v_result
  FROM source_counts;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION public.get_traffic_sources_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_traffic_sources_v1(UUID, INTEGER) TO authenticated, service_role;

-- 2) Get content type breakdown for creator
CREATE OR REPLACE FUNCTION public.get_content_type_breakdown_v1(
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
  WITH type_metrics AS (
    SELECT 
      r.type AS content_type,
      COUNT(*) AS item_count,
      COALESCE(SUM(rm.impressions), 0) AS total_impressions,
      COALESCE(SUM(rm.likes + rm.comments + rm.saves + rm.shares), 0) AS total_interactions
    FROM public.reels r
    LEFT JOIN public.reel_metrics rm ON rm.reel_id = r.id
    WHERE r.author_id = p_creator_id
    AND r.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    GROUP BY r.type
  ),
  totals AS (
    SELECT SUM(total_interactions)::NUMERIC AS all_interactions FROM type_metrics WHERE all_interactions > 0
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', content_type,
      'reach', total_impressions,
      'interactions', total_interactions,
      'posts', item_count,
      'er', CASE WHEN total_impressions > 0 THEN ROUND((total_interactions::NUMERIC / total_impressions::NUMERIC) * 100, 2) ELSE 0 END
    )
  ) INTO v_result
  FROM type_metrics;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION public.get_content_type_breakdown_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_content_type_breakdown_v1(UUID, INTEGER) TO authenticated, service_role;

-- 3) Get language preferences of audience
CREATE OR REPLACE FUNCTION public.get_audience_languages_v1(
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
    COALESCE(language, 'unknown'),
    COUNT(*)
  ) INTO v_result
  FROM public.profiles p
  JOIN public.follows f ON f.followed_id = p.id
  WHERE f.follower_id IN (
    SELECT DISTINCT user_id
    FROM public.playback_events pe
    JOIN public.reels r ON r.id = pe.reel_id
    WHERE r.author_id = p_creator_id
    AND pe.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    AND pe.user_id IS NOT NULL
  );

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION public.get_audience_languages_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audience_languages_v1(UUID, INTEGER) TO authenticated, service_role;

-- 4) Get days of week activity for audience
CREATE OR REPLACE FUNCTION public.get_audience_days_activity_v1(
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
    to_char(pe.created_at, 'Dy') AS day_name,
    COUNT(*)::INTEGER
  ) INTO v_result
  FROM public.playback_events pe
  JOIN public.reels r ON r.id = pe.reel_id
  WHERE r.author_id = p_creator_id
  AND pe.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
  AND pe.user_id IS NOT NULL
  GROUP BY day_name
  ORDER BY MAX(pe.created_at);

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION public.get_audience_days_activity_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audience_days_activity_v1(UUID, INTEGER) TO authenticated, service_role;

-- 5) Get post-watch behavior (follows, profile visits after content)
CREATE OR REPLACE FUNCTION public.get_post_watch_behavior_v1(
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
  v_views BIGINT;
  v_follows_from_reels BIGINT;
  v_profile_visits_from_reels BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_views
  FROM public.playback_events pe
  JOIN public.reels r ON r.id = pe.reel_id
  WHERE r.author_id = p_creator_id
  AND pe.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)));

  SELECT COUNT(*) INTO v_follows_from_reels
  FROM public.follows f
  WHERE f.followed_id = p_creator_id
  AND f.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)));

  SELECT COUNT(*) INTO v_profile_visits_from_reels
  FROM public.profile_view_events pve
  WHERE pve.profile_id = p_creator_id
  AND pve.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)));

  RETURN jsonb_build_object(
    'views', v_views,
    'new_followers', v_follows_from_reels,
    'profile_visits', v_profile_visits_from_reels,
    'view_to_follow_rate', CASE WHEN v_views > 0 THEN ROUND((v_follows_from_reels::NUMERIC / v_views::NUMERIC) * 100, 2) ELSE 0 END,
    'view_to_profile_rate', CASE WHEN v_views > 0 THEN ROUND((v_profile_visits_from_reels::NUMERIC / v_views::NUMERIC) * 100, 2) ELSE 0 END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_post_watch_behavior_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_post_watch_behavior_v1(UUID, INTEGER) TO authenticated, service_role;

-- ============================================================================
-- Summary:
-- - ✅ get_traffic_sources_v1(creator_id, days): Source pool distribution
-- - ✅ get_content_type_breakdown_v1(creator_id, days): Format metrics
-- - ✅ get_audience_languages_v1(creator_id, days): Language preferences
-- - ✅ get_audience_days_activity_v1(creator_id, days): Weekday activity
-- - ✅ get_post_watch_behavior_v1(creator_id, days): Follows/profile visits after views
-- ============================================================================