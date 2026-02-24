-- Phase 1 EPIC I: Anti-Feedback-Loop (Echo Chamber Limiter)
-- Detects when user consumes disproportionate content from one author/topic
-- and increases diversity constraints + exploration

-- 1) User Consumption Diversity Tracking
CREATE TABLE IF NOT EXISTS public.user_consumption_diversity (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Window: last 50 impressions (rolling)
  total_impressions_analyzed INTEGER NOT NULL DEFAULT 0,
  unique_authors_count INTEGER NOT NULL DEFAULT 0,
  unique_topics_count INTEGER NOT NULL DEFAULT 0, -- If topics available
  
  -- Top author concentration
  top_author_id UUID REFERENCES public.profiles(id),
  top_author_impression_count INTEGER NOT NULL DEFAULT 0,
  top_author_concentration NUMERIC NOT NULL DEFAULT 0, -- percentage [0-1]
  
  -- Diversity scores
  author_diversity_score NUMERIC NOT NULL DEFAULT 1.0, -- 1.0 = diverse, 0 = echo chamber
  topic_diversity_score NUMERIC NOT NULL DEFAULT 1.0,
  
  -- Echo chamber detection
  is_echo_chamber BOOLEAN NOT NULL DEFAULT FALSE,
  echo_chamber_flagged_at TIMESTAMPTZ,
  
  -- Recommended exploration boost
  recommended_exploration_ratio NUMERIC NOT NULL DEFAULT 0.20, -- Default 20%
  recommended_safety_boost NUMERIC NOT NULL DEFAULT 0,
  
  -- Lifecycle
  last_analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_diversity_echo_chamber_idx
  ON public.user_consumption_diversity(is_echo_chamber, last_analyzed_at DESC)
  WHERE is_echo_chamber = TRUE;

ALTER TABLE public.user_consumption_diversity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_diversity_service_role_all" ON public.user_consumption_diversity;
CREATE POLICY "user_diversity_service_role_all"
  ON public.user_consumption_diversity
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Users can read their own diversity stats
DROP POLICY IF EXISTS "user_diversity_select_own" ON public.user_consumption_diversity;
CREATE POLICY "user_diversity_select_own"
  ON public.user_consumption_diversity
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2) RPC: Analyze User Consumption Diversity
CREATE OR REPLACE FUNCTION public.analyze_user_diversity_v1(
  p_user_id UUID,
  p_window_size INTEGER DEFAULT 50,
  p_echo_threshold NUMERIC DEFAULT 0.40 -- 40% from one author = echo chamber
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_impressions INTEGER;
  v_unique_authors INTEGER;
  v_top_author_id UUID;
  v_top_author_count INTEGER;
  v_top_concentration NUMERIC;
  v_author_diversity NUMERIC;
  v_is_echo_chamber BOOLEAN := FALSE;
  v_exploration_boost NUMERIC := 0.20; -- Default
  v_safety_boost NUMERIC := 0;
BEGIN
  -- Get last N impressions
  WITH recent_impressions AS (
    SELECT 
      ri.reel_id,
      r.author_id
    FROM public.reel_impressions ri
    JOIN public.reels r ON r.id = ri.reel_id
    WHERE ri.user_id = p_user_id
    ORDER BY ri.viewed_at DESC
    LIMIT p_window_size
  ),
  author_stats AS (
    SELECT 
      author_id,
      COUNT(*) AS impression_count
    FROM recent_impressions
    GROUP BY author_id
    ORDER BY impression_count DESC
  )
  SELECT 
    COUNT(*),
    COUNT(DISTINCT author_id),
    (SELECT author_id FROM author_stats LIMIT 1),
    (SELECT impression_count FROM author_stats LIMIT 1)
  INTO 
    v_total_impressions,
    v_unique_authors,
    v_top_author_id,
    v_top_author_count
  FROM recent_impressions;
  
  -- Need minimum data
  IF v_total_impressions < 10 THEN
    RETURN FALSE;
  END IF;
  
  -- Calculate concentration
  v_top_concentration := v_top_author_count::NUMERIC / v_total_impressions;
  
  -- Calculate diversity score (Simpson's Index variant)
  -- Higher unique authors relative to total = higher diversity
  v_author_diversity := v_unique_authors::NUMERIC / v_total_impressions;
  v_author_diversity := LEAST(1.0, v_author_diversity * 2.0); -- Normalize to [0,1]
  
  -- Detect echo chamber
  IF v_top_concentration > p_echo_threshold THEN
    v_is_echo_chamber := TRUE;
    
    -- Recommend diversity interventions
    v_exploration_boost := 0.40; -- Increase exploration to 40%
    v_safety_boost := 0.15;      -- Add 15% safe/diverse pool
  ELSIF v_top_concentration > (p_echo_threshold * 0.75) THEN
    -- Warning zone
    v_exploration_boost := 0.30;
    v_safety_boost := 0.10;
  END IF;
  
  -- Upsert diversity record
  INSERT INTO public.user_consumption_diversity (
    user_id, total_impressions_analyzed, unique_authors_count,
    top_author_id, top_author_impression_count, top_author_concentration,
    author_diversity_score, is_echo_chamber,
    echo_chamber_flagged_at, recommended_exploration_ratio,
    recommended_safety_boost, last_analyzed_at
  )
  VALUES (
    p_user_id, v_total_impressions, v_unique_authors,
    v_top_author_id, v_top_author_count, v_top_concentration,
    v_author_diversity, v_is_echo_chamber,
    CASE WHEN v_is_echo_chamber THEN NOW() ELSE NULL END,
    v_exploration_boost, v_safety_boost, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_impressions_analyzed = EXCLUDED.total_impressions_analyzed,
    unique_authors_count = EXCLUDED.unique_authors_count,
    top_author_id = EXCLUDED.top_author_id,
    top_author_impression_count = EXCLUDED.top_author_impression_count,
    top_author_concentration = EXCLUDED.top_author_concentration,
    author_diversity_score = EXCLUDED.author_diversity_score,
    is_echo_chamber = EXCLUDED.is_echo_chamber,
    echo_chamber_flagged_at = CASE 
      WHEN EXCLUDED.is_echo_chamber AND NOT user_consumption_diversity.is_echo_chamber 
      THEN NOW() 
      ELSE user_consumption_diversity.echo_chamber_flagged_at 
    END,
    recommended_exploration_ratio = EXCLUDED.recommended_exploration_ratio,
    recommended_safety_boost = EXCLUDED.recommended_safety_boost,
    last_analyzed_at = NOW(),
    updated_at = NOW();
  
  RETURN v_is_echo_chamber;
END;
$$;

COMMENT ON FUNCTION analyze_user_diversity_v1 IS
  'Phase 1 EPIC I: Analyze user consumption diversity and detect echo chamber patterns';

-- 3) RPC: Get Diversity Config for Feed
CREATE OR REPLACE FUNCTION public.get_diversity_config_v1(p_user_id UUID)
RETURNS TABLE (
  exploration_ratio NUMERIC,
  safety_boost NUMERIC,
  is_echo_chamber BOOLEAN,
  author_diversity_score NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(ucd.recommended_exploration_ratio, 0.20),
    COALESCE(ucd.recommended_safety_boost, 0.0),
    COALESCE(ucd.is_echo_chamber, FALSE),
    COALESCE(ucd.author_diversity_score, 1.0)
  FROM public.user_consumption_diversity ucd
  WHERE ucd.user_id = p_user_id;
  
  -- Default if no record
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0.20::NUMERIC, 0.0::NUMERIC, FALSE, 1.0::NUMERIC;
  END IF;
END;
$$;

COMMENT ON FUNCTION get_diversity_config_v1 IS
  'Phase 1 EPIC I: Get recommended diversity parameters for feed ranking';

-- 4) RPC: Batch Analyze Diversity (Worker)
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
    (SELECT author_diversity_score FROM public.user_consumption_diversity WHERE user_id = au.user_id)
  FROM active_users au;
END;
$$;

COMMENT ON FUNCTION batch_analyze_diversity_v1 IS
  'Phase 1 EPIC I: Batch analyze user diversity for background worker';

-- 5) RPC: Get Author Fatigue Penalty
-- Penalize showing same author too frequently (even if not echo chamber yet)
CREATE OR REPLACE FUNCTION public.get_author_fatigue_penalty_v1(
  p_user_id UUID,
  p_author_id UUID,
  p_window_hours INTEGER DEFAULT 24
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_impression_count INTEGER;
  v_total_impressions INTEGER;
  v_author_rate NUMERIC;
  v_penalty NUMERIC := 0;
BEGIN
  -- Count author impressions in window
  SELECT 
    COUNT(*) FILTER (WHERE r.author_id = p_author_id),
    COUNT(*)
  INTO v_author_impression_count, v_total_impressions
  FROM public.reel_impressions ri
  JOIN public.reels r ON r.id = ri.reel_id
  WHERE ri.user_id = p_user_id
    AND ri.viewed_at > NOW() - (p_window_hours || ' hours')::INTERVAL;
  
  IF v_total_impressions < 5 THEN
    RETURN 0; -- Insufficient data
  END IF;
  
  v_author_rate := v_author_impression_count::NUMERIC / v_total_impressions;
  
  -- Progressive penalty
  -- 10% of feed → 0 penalty
  -- 20% of feed → 10 penalty
  -- 30%+ → 30+ penalty
  IF v_author_rate > 0.10 THEN
    v_penalty := (v_author_rate - 0.10) * 100.0;
    v_penalty := LEAST(v_penalty, 50.0); -- Cap at 50
  END IF;
  
  RETURN v_penalty;
END;
$$;

COMMENT ON FUNCTION get_author_fatigue_penalty_v1 IS
  'Phase 1 EPIC I: Calculate author fatigue penalty to prevent over-showing same author';

-- Grant permissions
REVOKE ALL ON FUNCTION analyze_user_diversity_v1(UUID, INTEGER, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_diversity_config_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION batch_analyze_diversity_v1(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_author_fatigue_penalty_v1(UUID, UUID, INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION analyze_user_diversity_v1(UUID, INTEGER, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION get_diversity_config_v1(UUID) TO service_role, authenticated; -- Needed for feed
GRANT EXECUTE ON FUNCTION batch_analyze_diversity_v1(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION get_author_fatigue_penalty_v1(UUID, UUID, INTEGER) TO service_role, authenticated; -- Needed for feed

-- 6) Trigger: Auto-analyze diversity on impression (async via pg_cron or Edge Function)
-- (Placeholder - actual implementation via background worker)
COMMENT ON TABLE user_consumption_diversity IS 
  'Phase 1 EPIC I: Tracks user consumption diversity to detect and mitigate echo chambers';
