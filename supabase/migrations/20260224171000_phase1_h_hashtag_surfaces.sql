-- ============================================================================
-- Phase 1 EPIC H: Hashtags + Trends - Part 3: Hashtag Surfaces + Anti-hijack
--
-- Implements:
--  1. Hashtag page surfaces (Top/Recent/Trending/Related)
--  2. Anti-hijack: Relevance scoring (detect off-topic usage)
--  3. Anti-manipulation: Coordinated attack detection
--  4. Rate limits integration
--
-- Dependencies:
--  - Phase 1 EPIC H Part 2: trending_hashtags (20260224170000)
--  - Phase 1 EPIC L: user_trust_scores, rate_limit_events (20260224020001)
--
-- Based on: docs/specs/phase1/P1H-hashtags-trends-discovery-integrity.md
-- ============================================================================

-- ============================================================================
-- 1. Get Hashtag Page (Top/Recent/Trending/Related)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_hashtag_feed_v1(
  p_hashtag_tag TEXT,
  p_surface TEXT DEFAULT 'top', -- 'top', 'recent', 'trending'
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  reel_id UUID,
  author_id UUID,
  video_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ,
  likes_count INTEGER,
  views_count INTEGER,
  relevance_score NUMERIC,
  surface TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hashtag_id UUID;
  v_hashtag_status TEXT;
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  -- Get hashtag canonical ID and status
  SELECT id, moderation_status INTO v_hashtag_id, v_hashtag_status
  FROM public.hashtags
  WHERE tag = lower(trim(p_hashtag_tag));

  IF v_hashtag_id IS NULL THEN
    RAISE EXCEPTION 'Hashtag not found: %', p_hashtag_tag;
  END IF;

  -- Respect moderation status
  IF v_hashtag_status = 'hidden' THEN
    RAISE EXCEPTION 'Hashtag is not available';
  END IF;

  -- Restricted hashtags: only show if user explicitly navigated here (no discovery)
  IF v_hashtag_status = 'restricted' AND p_surface IN ('trending', 'top') THEN
    RAISE EXCEPTION 'Hashtag is restricted';
  END IF;

  -- Top surface (relevance-weighted + engagement)
  IF p_surface = 'top' THEN
    RETURN QUERY
    SELECT 
      r.id AS reel_id,
      r.author_id,
      r.video_url,
      r.thumbnail_url,
      r.description,
      r.created_at,
      r.likes_count,
      r.views_count,
      COALESCE(rh.relevance_score, 1.0) AS relevance_score,
      'top'::TEXT AS surface
    FROM public.reel_hashtags rh
    JOIN public.reels r ON r.id = rh.reel_id
    WHERE rh.hashtag_id = v_hashtag_id
      AND NOT EXISTS (
        SELECT 1 FROM public.user_reel_feedback f
        WHERE f.reel_id = r.id 
          AND f.user_id = v_user_id 
          AND f.feedback = 'not_interested'
      )
    ORDER BY 
      (
        (r.views_count::NUMERIC * 0.3) +
        (r.likes_count::NUMERIC * 0.3) +
        (r.comments_count::NUMERIC * 0.2) +
        (COALESCE(rh.relevance_score, 1.0) * 20)
      ) DESC,
      r.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;

  -- Recent surface (chronological + relevance filter)
  ELSIF p_surface = 'recent' THEN
    RETURN QUERY
    SELECT 
      r.id AS reel_id,
      r.author_id,
      r.video_url,
      r.thumbnail_url,
      r.description,
      r.created_at,
      r.likes_count,
      r.views_count,
      COALESCE(rh.relevance_score, 1.0) AS relevance_score,
      'recent'::TEXT AS surface
    FROM public.reel_hashtags rh
    JOIN public.reels r ON r.id = rh.reel_id
    WHERE rh.hashtag_id = v_hashtag_id
      AND COALESCE(rh.relevance_score, 1.0) >= 0.3 -- minimum relevance threshold
      AND NOT EXISTS (
        SELECT 1 FROM public.user_reel_feedback f
        WHERE f.reel_id = r.id 
          AND f.user_id = v_user_id 
          AND f.feedback = 'not_interested'
      )
    ORDER BY r.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;

  -- Trending surface (only if hashtag is currently trending)
  ELSIF p_surface = 'trending' THEN
    RETURN QUERY
    SELECT 
      r.id AS reel_id,
      r.author_id,
      r.video_url,
      r.thumbnail_url,
      r.description,
      r.created_at,
      r.likes_count,
      r.views_count,
      COALESCE(rh.relevance_score, 1.0) AS relevance_score,
      'trending'::TEXT AS surface
    FROM public.reel_hashtags rh
    JOIN public.reels r ON r.id = rh.reel_id
    WHERE rh.hashtag_id = v_hashtag_id
      AND r.created_at >= now() - interval '48 hours' -- only recent for trending
      AND COALESCE(rh.relevance_score, 1.0) >= 0.5 -- higher relevance threshold
      AND EXISTS (
        SELECT 1 FROM public.trending_hashtags th
        WHERE th.hashtag_id = v_hashtag_id
          AND th.is_trending = TRUE
          AND th.window_end >= now() - interval '6 hours'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_reel_feedback f
        WHERE f.reel_id = r.id 
          AND f.user_id = v_user_id 
          AND f.feedback = 'not_interested'
      )
    ORDER BY 
      (
        (r.views_count::NUMERIC * 0.4) +
        (r.likes_count::NUMERIC * 0.3) +
        (COALESCE(rh.relevance_score, 1.0) * 30)
      ) DESC,
      r.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
  ELSE
    RAISE EXCEPTION 'Invalid surface: %. Use top, recent, or trending', p_surface;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_hashtag_feed_v1(TEXT, TEXT, INTEGER, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hashtag_feed_v1(TEXT, TEXT, INTEGER, INTEGER, UUID) TO authenticated, anon;

COMMENT ON FUNCTION public.get_hashtag_feed_v1 IS 'Phase 1 EPIC H: Get hashtag feed with Top/Recent/Trending surfaces';

-- ============================================================================
-- 2. Get Related Hashtags
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_related_hashtags_v1(
  p_hashtag_tag TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  hashtag_id UUID,
  tag TEXT,
  display_tag TEXT,
  co_occurrence_count INTEGER,
  relevance_score NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hashtag_id UUID;
BEGIN
  -- Get canonical hashtag ID
  SELECT id INTO v_hashtag_id
  FROM public.hashtags
  WHERE tag = lower(trim(p_hashtag_tag));

  IF v_hashtag_id IS NULL THEN
    RETURN;
  END IF;

  -- Find hashtags that frequently co-occur with this one
  RETURN QUERY
  SELECT 
    h.id AS hashtag_id,
    h.tag,
    h.display_tag,
    COUNT(DISTINCT rh2.reel_id)::INTEGER AS co_occurrence_count,
    (COUNT(DISTINCT rh2.reel_id)::NUMERIC / GREATEST(h.usage_count, 1)) AS relevance_score
  FROM public.reel_hashtags rh1
  JOIN public.reel_hashtags rh2 ON rh2.reel_id = rh1.reel_id AND rh2.hashtag_id <> rh1.hashtag_id
  JOIN public.hashtags h ON h.id = rh2.hashtag_id
  WHERE rh1.hashtag_id = v_hashtag_id
    AND h.moderation_status = 'normal'
  GROUP BY h.id, h.tag, h.display_tag, h.usage_count
  HAVING COUNT(DISTINCT rh2.reel_id) >= 3 -- minimum 3 co-occurrences
  ORDER BY COUNT(DISTINCT rh2.reel_id) DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_related_hashtags_v1(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_related_hashtags_v1(TEXT, INTEGER) TO authenticated, anon;

COMMENT ON FUNCTION public.get_related_hashtags_v1 IS 'Phase 1 EPIC H: Get related hashtags based on co-occurrence';

-- ============================================================================
-- 3. Calculate Hashtag Relevance (Anti-hijack)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_hashtag_relevance_v1(
  p_reel_id UUID,
  p_hashtag_tag TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reel_description TEXT;
  v_reel_category TEXT;
  v_tag_lower TEXT := lower(trim(p_hashtag_tag));
  v_relevance_score NUMERIC := 1.0;
  v_description_match BOOLEAN := FALSE;
  v_category_match BOOLEAN := FALSE;
BEGIN
  -- Get reel metadata
  SELECT description, category INTO v_reel_description, v_reel_category
  FROM public.reels
  WHERE id = p_reel_id;

  IF v_reel_description IS NULL THEN
    RETURN 0.5; -- default neutral score
  END IF;

  -- Check if hashtag appears in description (strong signal)
  v_description_match := (
    lower(v_reel_description) LIKE '%' || v_tag_lower || '%' OR
    lower(v_reel_description) LIKE '%#' || v_tag_lower || '%'
  );

  IF v_description_match THEN
    v_relevance_score := v_relevance_score * 1.5; -- boost relevance
  ELSE
    v_relevance_score := v_relevance_score * 0.7; -- penalize if no text match
  END IF;

  -- Check category match (medium signal)
  IF v_reel_category IS NOT NULL THEN
    v_category_match := (lower(v_reel_category) LIKE '%' || v_tag_lower || '%');
    
    IF v_category_match THEN
      v_relevance_score := v_relevance_score * 1.2;
    END IF;
  END IF;

  -- Clamp score to [0, 2]
  v_relevance_score := GREATEST(0, LEAST(2.0, v_relevance_score));

  RETURN v_relevance_score;
END;
$$;

COMMENT ON FUNCTION public.calculate_hashtag_relevance_v1 IS 'Phase 1 EPIC H: Calculate hashtag relevance score to detect off-topic usage (anti-hijack)';

-- ============================================================================
-- 4. Detect Coordinated Hashtag Attack
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_coordinated_hashtag_attack_v1(
  p_hashtag_tag TEXT,
  p_window_hours INTEGER DEFAULT 24,
  p_similarity_threshold NUMERIC DEFAULT 0.8
)
RETURNS TABLE (
  is_suspicious BOOLEAN,
  suspicious_account_count INTEGER,
  similar_pattern_count INTEGER,
  velocity_spike_detected BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hashtag_id UUID;
  v_window_start TIMESTAMPTZ := now() - (p_window_hours || ' hours')::INTERVAL;
  v_suspicious_accounts INTEGER := 0;
  v_similar_patterns INTEGER := 0;
  v_velocity_spike BOOLEAN := FALSE;
  v_recent_velocity NUMERIC;
  v_baseline_velocity NUMERIC;
BEGIN
  -- Get hashtag ID
  SELECT id INTO v_hashtag_id
  FROM public.hashtags
  WHERE tag = lower(trim(p_hashtag_tag));

  IF v_hashtag_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, FALSE;
    RETURN;
  END IF;

  -- Count accounts with low trust using this hashtag recently
  SELECT COUNT(DISTINCT r.author_id) INTO v_suspicious_accounts
  FROM public.reel_hashtags rh
  JOIN public.reels r ON r.id = rh.reel_id
  LEFT JOIN public.user_trust_scores uts ON uts.user_id = r.author_id
  WHERE rh.hashtag_id = v_hashtag_id
    AND r.created_at >= v_window_start
    AND COALESCE(uts.trust_tier, 'low') = 'low';

  -- Count accounts with similar posting patterns (created multiple reels in short time)
  SELECT COUNT(*) INTO v_similar_patterns
  FROM (
    SELECT r.author_id, COUNT(*) AS reel_count
    FROM public.reel_hashtags rh
    JOIN public.reels r ON r.id = rh.reel_id
    WHERE rh.hashtag_id = v_hashtag_id
      AND r.created_at >= v_window_start
    GROUP BY r.author_id
    HAVING COUNT(*) >= 3 -- 3+ reels with same hashtag in 24h
  ) patterns;

  -- Detect velocity spike (recent vs baseline)
  SELECT impression_velocity INTO v_recent_velocity
  FROM public.trending_hashtags
  WHERE hashtag_id = v_hashtag_id
    AND window_end >= now() - interval '1 hour'
  ORDER BY window_end DESC
  LIMIT 1;

  SELECT AVG(impression_velocity) INTO v_baseline_velocity
  FROM public.trending_hashtags
  WHERE hashtag_id = v_hashtag_id
    AND window_end >= now() - interval '7 days'
    AND window_end < now() - interval '24 hours';

  IF v_recent_velocity IS NOT NULL AND v_baseline_velocity IS NOT NULL THEN
    v_velocity_spike := (v_recent_velocity > v_baseline_velocity * 3); -- 3x spike
  END IF;

  -- Return detection results
  RETURN QUERY SELECT 
    (v_suspicious_accounts >= 5 OR v_similar_patterns >= 3 OR v_velocity_spike) AS is_suspicious,
    v_suspicious_accounts AS suspicious_account_count,
    v_similar_patterns AS similar_pattern_count,
    v_velocity_spike AS velocity_spike_detected;
END;
$$;

COMMENT ON FUNCTION public.detect_coordinated_hashtag_attack_v1 IS 'Phase 1 EPIC H: Detect coordinated manipulation attacks on hashtags';

-- ============================================================================
-- 5. Hashtag Search Rate Limit (Phase 1 EPIC L Integration)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_hashtag_search_rate_limit_v1(
  p_user_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_max_searches_per_minute INTEGER DEFAULT 20
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
  v_search_count INTEGER;
BEGIN
  -- Count recent searches
  SELECT COUNT(*) INTO v_search_count
  FROM public.rate_limit_events
  WHERE event_type = 'hashtag_search'
    AND created_at >= now() - interval '1 minute'
    AND (
      (v_user_id IS NOT NULL AND user_id = v_user_id) OR
      (v_user_id IS NULL AND session_id = p_session_id)
    );

  IF v_search_count >= p_max_searches_per_minute THEN
    RETURN FALSE; -- rate limit exceeded
  END IF;

  -- Record this search
  INSERT INTO public.rate_limit_events (
    user_id,
    session_id,
    event_type,
    created_at
  ) VALUES (
    v_user_id,
    p_session_id,
    'hashtag_search',
    now()
  );

  RETURN TRUE; -- allowed
END;
$$;

COMMENT ON FUNCTION public.check_hashtag_search_rate_limit_v1 IS 'Phase 1 EPIC H: Rate limit hashtag searches (20/minute)';

-- ============================================================================
-- 6. Search Hashtags (with rate limiting)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_hashtags_v1(
  p_query TEXT,
  p_limit INTEGER DEFAULT 20,
  p_session_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  hashtag_id UUID,
  tag TEXT,
  display_tag TEXT,
  usage_count INTEGER,
  is_trending BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_canonical_query TEXT := lower(trim(p_query));
BEGIN
  -- Rate limit check
  IF NOT public.check_hashtag_search_rate_limit_v1(v_user_id, p_session_id) THEN
    RAISE EXCEPTION 'Rate limit exceeded. Please wait before searching again.';
  END IF;

  -- Search hashtags
  RETURN QUERY
  SELECT 
    h.id AS hashtag_id,
    h.tag,
    h.display_tag,
    h.usage_count,
    EXISTS (
      SELECT 1 FROM public.trending_hashtags th
      WHERE th.hashtag_id = h.id
        AND th.is_trending = TRUE
        AND th.window_end >= now() - interval '6 hours'
    ) AS is_trending
  FROM public.hashtags h
  WHERE h.tag LIKE v_canonical_query || '%'
    AND h.moderation_status = 'normal'
    AND h.usage_count > 0
  ORDER BY 
    CASE WHEN h.tag = v_canonical_query THEN 1 ELSE 2 END, -- exact matches first
    h.usage_count DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_hashtags_v1(TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_hashtags_v1(TEXT, INTEGER, TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.search_hashtags_v1 IS 'Phase 1 EPIC H: Search hashtags with rate limiting';

-- ============================================================================
-- Summary
-- ============================================================================
-- Phase 1 EPIC H Part 3: Hashtag Surfaces + Anti-hijack Complete
--
-- Functions Created:
--  - get_hashtag_feed_v1 (Top/Recent/Trending surfaces)
--  - get_related_hashtags_v1 (co-occurrence based)
--  - calculate_hashtag_relevance_v1 (anti-hijack relevance scoring)
--  - detect_coordinated_hashtag_attack_v1 (manipulation detection)
--  - check_hashtag_search_rate_limit_v1 (rate limiting integration)
--  - search_hashtags_v1 (autocomplete with rate limit)
--
-- Anti-hijack Features:
--  - Relevance scoring (description/category match)
--  - Low-trust account detection
--  - Coordinated posting pattern detection
--  - Velocity spike detection
--
-- Next Steps:
--  1. Background worker for detect_coordinated_hashtag_attack_v1
--  2. Frontend: Hashtag page UI (Top/Recent/Trending tabs)
--  3. Frontend: Related hashtags widget
--  4. Frontend: Hashtag search autocomplete
-- ============================================================================
