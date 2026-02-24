-- Phase 1 EPIC I: Enhanced Explainability v2
-- Extends reason codes with detailed boosts/penalties tracking

-- 1) Ranking Explanation Table
CREATE TABLE IF NOT EXISTS public.ranking_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Feed request context
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  request_id UUID NOT NULL, -- Links to feed request
  
  -- Ranked item
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, -- Position in feed (1-based)
  
  -- Source pool
  source_pool TEXT NOT NULL CHECK (source_pool IN (
    'following', 'interest', 'trending', 'fresh_creator', 
    'safe_coldstart', 'exploration', 'fallback'
  )),
  
  -- Final score breakdown
  final_score NUMERIC NOT NULL,
  base_engagement_score NUMERIC NOT NULL DEFAULT 0,
  
  -- Boosts (JSONB array of {name, value})
  boosts JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Example: [{"name": "freshness", "value": 15.5}, {"name": "follow", "value": 30.0}]
  
  -- Penalties (JSONB array of {name, value})
  penalties JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Example: [{"name": "repeat", "value": -10.0}, {"name": "author_fatigue", "value": -20.0}]
  
  -- Diversity constraints applied
  diversity_constraints JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Example: {"max_author_in_window": 2, "unique_authors_required": 6}
  
  -- Cold start mode
  is_cold_start BOOLEAN NOT NULL DEFAULT FALSE,
  cold_start_segment TEXT, -- 'new_user', 'returning_low_signal'
  
  -- Echo chamber detection
  echo_chamber_detected BOOLEAN NOT NULL DEFAULT FALSE,
  exploration_ratio_applied NUMERIC,
  
  -- Controversial flag
  controversial_penalty_applied NUMERIC DEFAULT 0,
  
  -- Metadata
  algorithm_version TEXT NOT NULL,
  config_id UUID, -- Links to reels_engine_configs
  
  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ranking_explanations_request_idx
  ON public.ranking_explanations(request_id, position ASC);

CREATE INDEX IF NOT EXISTS ranking_explanations_user_created_idx
  ON public.ranking_explanations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ranking_explanations_reel_created_idx
  ON public.ranking_explanations(reel_id, created_at DESC);

ALTER TABLE public.ranking_explanations ENABLE ROW LEVEL SECURITY;

-- Service role for writing
DROP POLICY IF EXISTS "ranking_explanations_service_role_all" ON public.ranking_explanations;
CREATE POLICY "ranking_explanations_service_role_all"
  ON public.ranking_explanations
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Users can read their own explanations
DROP POLICY IF EXISTS "ranking_explanations_select_own" ON public.ranking_explanations;
CREATE POLICY "ranking_explanations_select_own"
  ON public.ranking_explanations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2) RPC: Record Ranking Explanation
CREATE OR REPLACE FUNCTION public.record_ranking_explanation_v1(
  p_user_id UUID,
  p_session_id TEXT,
  p_request_id UUID,
  p_reel_id UUID,
  p_position INTEGER,
  p_source_pool TEXT,
  p_final_score NUMERIC,
  p_base_score NUMERIC,
  p_boosts JSONB DEFAULT '[]'::JSONB,
  p_penalties JSONB DEFAULT '[]'::JSONB,
  p_diversity_constraints JSONB DEFAULT '{}'::JSONB,
  p_is_cold_start BOOLEAN DEFAULT FALSE,
  p_cold_start_segment TEXT DEFAULT NULL,
  p_echo_chamber BOOLEAN DEFAULT FALSE,
  p_exploration_ratio NUMERIC DEFAULT NULL,
  p_controversial_penalty NUMERIC DEFAULT 0,
  p_algorithm_version TEXT DEFAULT 'v2',
  p_config_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_explanation_id UUID;
BEGIN
  INSERT INTO public.ranking_explanations (
    user_id, session_id, request_id, reel_id, position,
    source_pool, final_score, base_engagement_score,
    boosts, penalties, diversity_constraints,
    is_cold_start, cold_start_segment,
    echo_chamber_detected, exploration_ratio_applied,
    controversial_penalty_applied,
    algorithm_version, config_id
  )
  VALUES (
    p_user_id, p_session_id, p_request_id, p_reel_id, p_position,
    p_source_pool, p_final_score, p_base_score,
    p_boosts, p_penalties, p_diversity_constraints,
    p_is_cold_start, p_cold_start_segment,
    p_echo_chamber, p_exploration_ratio,
    p_controversial_penalty,
    p_algorithm_version, p_config_id
  )
  RETURNING id INTO v_explanation_id;
  
  RETURN v_explanation_id;
END;
$$;

COMMENT ON FUNCTION record_ranking_explanation_v1 IS
  'Phase 1 EPIC I: Record detailed ranking explanation for transparency and debugging';

-- 3) RPC: Get Explanation for Item
CREATE OR REPLACE FUNCTION public.get_ranking_explanation_v1(p_request_id UUID, p_reel_id UUID)
RETURNS TABLE (
  source_pool TEXT,
  final_score NUMERIC,
  base_score NUMERIC,
  boosts JSONB,
  penalties JSONB,
  top_boost TEXT,
  top_penalty TEXT,
  human_readable_reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    re.source_pool,
    re.final_score,
    re.base_engagement_score,
    re.boosts,
    re.penalties,
    (SELECT b->>'name' FROM jsonb_array_elements(re.boosts) b ORDER BY (b->>'value')::NUMERIC DESC LIMIT 1) AS top_boost,
    (SELECT p->>'name' FROM jsonb_array_elements(re.penalties) p ORDER BY (p->>'value')::NUMERIC ASC LIMIT 1) AS top_penalty,
    CASE 
      WHEN re.is_cold_start THEN 'Cold start exploration'
      WHEN re.source_pool = 'following' THEN 'From accounts you follow'
      WHEN re.source_pool = 'trending' THEN 'Trending now'
      WHEN re.source_pool = 'fresh_creator' THEN 'New creator discovery'
      WHEN re.echo_chamber_detected THEN 'Diverse content recommendation'
      ELSE 'Recommended for you'
    END AS human_readable_reason
  FROM public.ranking_explanations re
  WHERE re.request_id = p_request_id
    AND re.reel_id = p_reel_id
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION get_ranking_explanation_v1 IS
  'Phase 1 EPIC I: Get detailed explanation for why an item was ranked/shown';

-- 4) RPC: Get Feed Explanation Summary
CREATE OR REPLACE FUNCTION public.get_feed_explanation_summary_v1(p_request_id UUID)
RETURNS TABLE (
  total_items INTEGER,
  source_pool_distribution JSONB,
  avg_score NUMERIC,
  cold_start_mode BOOLEAN,
  echo_chamber_mitigation BOOLEAN,
  controversial_items_filtered INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER AS total_items,
    jsonb_object_agg(source_pool, pool_count) AS source_pool_distribution,
    AVG(final_score) AS avg_score,
    BOOL_OR(is_cold_start) AS cold_start_mode,
    BOOL_OR(echo_chamber_detected) AS echo_chamber_mitigation,
    COUNT(*) FILTER (WHERE controversial_penalty_applied > 0)::INTEGER AS controversial_items_filtered
  FROM (
    SELECT 
      source_pool,
      COUNT(*) AS pool_count,
      final_score,
      is_cold_start,
      echo_chamber_detected,
      controversial_penalty_applied
    FROM public.ranking_explanations
    WHERE request_id = p_request_id
    GROUP BY source_pool, final_score, is_cold_start, echo_chamber_detected, controversial_penalty_applied
  ) pools
  GROUP BY request_id;
END;
$$;

COMMENT ON FUNCTION get_feed_explanation_summary_v1 IS
  'Phase 1 EPIC I: Get summary of feed composition and applied interventions';

-- 5) View: Reason Code Leaderboard (for debugging/QA)
CREATE OR REPLACE VIEW public.reason_code_stats_v1 AS
SELECT 
  boost->>'name' AS boost_name,
  COUNT(*) AS usage_count,
  AVG((boost->>'value')::NUMERIC) AS avg_value,
  MAX((boost->>'value')::NUMERIC) AS max_value
FROM public.ranking_explanations re,
     jsonb_array_elements(re.boosts) boost
WHERE re.created_at > NOW() - INTERVAL '7 days'
GROUP BY boost->>'name'
ORDER BY usage_count DESC;

COMMENT ON VIEW reason_code_stats_v1 IS
  'Phase 1 EPIC I: Leaderboard of most common ranking boost signals';

-- Grant permissions
REVOKE ALL ON FUNCTION record_ranking_explanation_v1(UUID, TEXT, UUID, UUID, INTEGER, TEXT, NUMERIC, NUMERIC, JSONB, JSONB, JSONB, BOOLEAN, TEXT, BOOLEAN, NUMERIC, NUMERIC, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_ranking_explanation_v1(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_feed_explanation_summary_v1(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION record_ranking_explanation_v1(UUID, TEXT, UUID, UUID, INTEGER, TEXT, NUMERIC, NUMERIC, JSONB, JSONB, JSONB, BOOLEAN, TEXT, BOOLEAN, NUMERIC, NUMERIC, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_ranking_explanation_v1(UUID, UUID) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION get_feed_explanation_summary_v1(UUID) TO service_role, authenticated;

-- 6) Cleanup old explanations (retention: 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_ranking_explanations_v1(p_retention_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.ranking_explanations
  WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION cleanup_ranking_explanations_v1(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_ranking_explanations_v1(INTEGER) TO service_role;

COMMENT ON FUNCTION cleanup_ranking_explanations_v1 IS
  'Phase 1 EPIC I: Cleanup old ranking explanations (default 30 days retention)';
