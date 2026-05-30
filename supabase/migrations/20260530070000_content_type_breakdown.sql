-- ============================================================================
-- Phase 1 EPIC J: Content Type Distribution Functions
--
-- Provides breakdown of views/impressions by content type:
-- - Reels
-- - Feed posts
-- - Stories
-- - Live
-- ============================================================================

-- 1) Get content type view distribution for creator
CREATE OR REPLACE FUNCTION public.get_content_views_breakdown_v1(
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
  WITH content_views AS (
    -- Reels views
    SELECT 
      'reels' AS content_type,
      COALESCE(SUM(rm.impressions), 0) AS views,
      COALESCE(SUM(rm.unique_viewers), 0) AS reach
    FROM public.reels r
    LEFT JOIN public.reel_metrics rm ON rm.reel_id = r.id
    WHERE r.author_id = p_creator_id
    AND r.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    
    UNION ALL
    
    -- Feed posts views (assuming posts have impressions/views tracking)
    -- Note: posts table may need separate view tracking table
    SELECT 
      'posts' AS content_type,
      COALESCE(SUM(COALESCE(views, 0)), 0) AS views,
      0 AS reach
    FROM public.posts p
    WHERE p.author_id = p_creator_id
    AND p.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    
    UNION ALL
    
    -- Stories views
    SELECT 
      'stories' AS content_type,
      COALESCE(COUNT(sv.id), 0) AS views,
      COALESCE(COUNT(DISTINCT sv.viewer_id), 0) AS reach
    FROM public.stories s
    LEFT JOIN public.story_views sv ON sv.story_id = s.id AND sv.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    WHERE s.author_id = p_creator_id
    
    UNION ALL
    
    -- Live views
    SELECT 
      'live' AS content_type,
      COALESCE(SUM(viewer_count), 0) AS views,
      0 AS reach
    FROM public.live_sessions l
    WHERE l.creator_id = p_creator_id
    AND l.started_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', content_type,
      'views', views,
      'reach', reach
    )
  ) INTO v_result
  FROM content_views;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION public.get_content_views_breakdown_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_content_views_breakdown_v1(UUID, INTEGER) TO authenticated, service_role;

-- 2) Get interaction distribution by content type
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
    LEFT JOIN public.story_poll_votes spv ON spv.poll_id IN (SELECT id FROM story_polls WHERE story_polls.story_id = s.id) AND spv.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
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

-- ============================================================================
-- Summary:
-- - ✅ get_content_views_breakdown_v1(creator_id, days): Views/reach by type
-- - ✅ get_interactions_by_type_v1(creator_id, days): Interactions by type
-- ============================================================================