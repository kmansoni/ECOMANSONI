-- ============================================================================
-- Phase 1 EPIC H: Hashtags + Trends - Part 2: Trend Engine
--
-- Implements:
--  1. Trend detection (velocity + unique creators + trust-weighted engagement)
--  2. Trend decay curve (peak detection + time-based decay)
--  3. Trust-weighting (low-trust signals reduced impact)
--  4. Eligibility gates (green distribution, report_rate threshold)
--
-- Dependencies:
--  - Phase 0: hashtags table (20260220231000)
--  - Phase 1 EPIC L: user_trust_scores (20260224020001)
--  - Phase 1 EPIC I: controversial_content_flags (20260224161000)
--
-- Based on: docs/specs/phase1/P1H-hashtags-trends-discovery-integrity.md
-- ============================================================================

-- ============================================================================
-- 1. Trending Hashtags Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trending_hashtags (
  hashtag_id UUID NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  
  -- Time window
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  
  -- Velocity metrics (raw counts)
  impression_velocity NUMERIC NOT NULL DEFAULT 0, -- impressions per hour
  view_velocity NUMERIC NOT NULL DEFAULT 0, -- views per hour
  completion_velocity NUMERIC NOT NULL DEFAULT 0, -- completions per hour
  
  -- Diversity metrics
  unique_viewers INTEGER NOT NULL DEFAULT 0,
  unique_creators INTEGER NOT NULL DEFAULT 0,
  
  -- Engagement metrics
  share_rate NUMERIC NOT NULL DEFAULT 0, -- shares / views
  save_rate NUMERIC NOT NULL DEFAULT 0, -- saves / views
  
  -- Safety metrics
  report_rate NUMERIC NOT NULL DEFAULT 0, -- reports / impressions
  hide_rate NUMERIC NOT NULL DEFAULT 0, -- hides / impressions
  
  -- Trust-weighted score
  trust_weighted_score NUMERIC NOT NULL DEFAULT 0,
  
  -- Trend lifecycle
  trend_score NUMERIC NOT NULL DEFAULT 0, -- final trending score (0-100)
  peak_timestamp TIMESTAMPTZ,
  decay_rate NUMERIC NOT NULL DEFAULT 0.5, -- decay factor (0-1)
  max_lifetime_hours INTEGER NOT NULL DEFAULT 72,
  
  -- Status
  is_trending BOOLEAN NOT NULL DEFAULT FALSE,
  is_eligible BOOLEAN NOT NULL DEFAULT TRUE, -- passes eligibility gates
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  PRIMARY KEY (hashtag_id, window_start),
  CHECK (window_end > window_start),
  CHECK (impression_velocity >= 0),
  CHECK (trust_weighted_score >= 0 AND trust_weighted_score <= 100),
  CHECK (trend_score >= 0 AND trend_score <= 100)
);

CREATE INDEX idx_trending_hashtags_score ON public.trending_hashtags(trend_score DESC, window_start DESC) WHERE is_trending = TRUE;
CREATE INDEX idx_trending_hashtags_window ON public.trending_hashtags(window_end DESC) WHERE is_trending = TRUE;
CREATE INDEX idx_trending_hashtags_eligible ON public.trending_hashtags(is_eligible) WHERE window_end >= now() - interval '24 hours';

COMMENT ON TABLE public.trending_hashtags IS 'Phase 1 EPIC H: Tracks hashtag trending metrics with trust-weighting and decay';

-- ============================================================================
-- 2. Calculate Trust-Weighted Velocity
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_hashtag_velocity_v1(
  p_hashtag_id UUID,
  p_window_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  impression_velocity NUMERIC,
  view_velocity NUMERIC,
  completion_velocity NUMERIC,
  unique_viewers INTEGER,
  unique_creators INTEGER,
  share_rate NUMERIC,
  save_rate NUMERIC,
  report_rate NUMERIC,
  hide_rate NUMERIC,
  trust_weighted_score NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := now() - (p_window_hours || ' hours')::INTERVAL;
  v_total_impressions INTEGER := 0;
  v_total_views INTEGER := 0;
  v_total_completions INTEGER := 0;
  v_total_shares INTEGER := 0;
  v_total_saves INTEGER := 0;
  v_total_reports INTEGER := 0;
  v_total_hides INTEGER := 0;
  v_trust_sum NUMERIC := 0;
  v_trust_count INTEGER := 0;
BEGIN
  -- Get aggregated metrics from reels with this hashtag
  SELECT 
    COUNT(DISTINCT i.id) AS impressions,
    COUNT(DISTINCT CASE WHEN uri.watch_duration_seconds > 0 THEN i.id END) AS views,
    COUNT(DISTINCT CASE WHEN uri.completion_rate >= 0.9 THEN i.id END) AS completions,
    COUNT(DISTINCT i.user_id) FILTER (WHERE i.user_id IS NOT NULL) AS unique_viewers,
    COUNT(DISTINCT r.author_id) AS unique_creators,
    SUM(CASE WHEN f.feedback = 'shared' THEN 1 ELSE 0 END) AS shares,
    SUM(CASE WHEN f.feedback = 'saved' THEN 1 ELSE 0 END) AS saves,
    SUM(CASE WHEN f.feedback = 'report' THEN 1 ELSE 0 END) AS reports,
    SUM(CASE WHEN f.feedback = 'not_interested' THEN 1 ELSE 0 END) AS hides
  INTO 
    v_total_impressions,
    v_total_views,
    v_total_completions,
    unique_viewers,
    unique_creators,
    v_total_shares,
    v_total_saves,
    v_total_reports,
    v_total_hides
  FROM public.reel_hashtags rh
  JOIN public.reels r ON r.id = rh.reel_id
  LEFT JOIN public.reel_impressions i ON i.reel_id = r.id AND i.created_at >= v_window_start
  LEFT JOIN public.user_reel_interactions uri ON uri.reel_id = r.id AND uri.user_id = i.user_id
  LEFT JOIN public.user_reel_feedback f ON f.reel_id = r.id
  WHERE rh.hashtag_id = p_hashtag_id
    AND r.created_at >= v_window_start;

  -- Calculate velocities (per hour)
  impression_velocity := COALESCE(v_total_impressions::NUMERIC / p_window_hours, 0);
  view_velocity := COALESCE(v_total_views::NUMERIC / p_window_hours, 0);
  completion_velocity := COALESCE(v_total_completions::NUMERIC / p_window_hours, 0);

  -- Calculate rates
  share_rate := CASE WHEN v_total_views > 0 THEN v_total_shares::NUMERIC / v_total_views ELSE 0 END;
  save_rate := CASE WHEN v_total_views > 0 THEN v_total_saves::NUMERIC / v_total_views ELSE 0 END;
  report_rate := CASE WHEN v_total_impressions > 0 THEN v_total_reports::NUMERIC / v_total_impressions ELSE 0 END;
  hide_rate := CASE WHEN v_total_impressions > 0 THEN v_total_hides::NUMERIC / v_total_impressions ELSE 0 END;

  -- Calculate trust-weighted score (Phase 1 EPIC L integration)
  SELECT 
    SUM(
      CASE 
        WHEN uts.trust_tier = 'high' THEN 1.0
        WHEN uts.trust_tier = 'medium' THEN 0.7
        WHEN uts.trust_tier = 'low' THEN 0.3
        ELSE 0.5
      END
    ) AS trust_sum,
    COUNT(*) AS trust_count
  INTO v_trust_sum, v_trust_count
  FROM public.reel_hashtags rh
  JOIN public.reels r ON r.id = rh.reel_id
  LEFT JOIN public.reel_impressions i ON i.reel_id = r.id AND i.created_at >= v_window_start
  LEFT JOIN public.user_trust_scores uts ON uts.user_id = i.user_id
  WHERE rh.hashtag_id = p_hashtag_id;

  -- Trust-weighted score (0-100)
  trust_weighted_score := CASE 
    WHEN v_trust_count > 0 THEN LEAST(100, (v_trust_sum / v_trust_count) * 100)
    ELSE 50 
  END;

  RETURN QUERY SELECT 
    impression_velocity,
    view_velocity,
    completion_velocity,
    unique_viewers,
    unique_creators,
    share_rate,
    save_rate,
    report_rate,
    hide_rate,
    trust_weighted_score;
END;
$$;

COMMENT ON FUNCTION public.calculate_hashtag_velocity_v1 IS 'Phase 1 EPIC H: Calculate hashtag velocity metrics with trust-weighting';

-- ============================================================================
-- 3. Calculate Trend Score (Velocity + Diversity + Trust + Decay)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_trend_score_v1(
  p_impression_velocity NUMERIC,
  p_view_velocity NUMERIC,
  p_completion_velocity NUMERIC,
  p_unique_viewers INTEGER,
  p_unique_creators INTEGER,
  p_share_rate NUMERIC,
  p_save_rate NUMERIC,
  p_trust_weighted_score NUMERIC,
  p_peak_timestamp TIMESTAMPTZ DEFAULT NULL,
  p_decay_rate NUMERIC DEFAULT 0.5,
  p_max_lifetime_hours INTEGER DEFAULT 72
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_velocity_score NUMERIC;
  v_diversity_score NUMERIC;
  v_engagement_score NUMERIC;
  v_decay_factor NUMERIC := 1.0;
  v_age_hours NUMERIC;
  v_base_score NUMERIC;
BEGIN
  -- Velocity score (0-40 points) - logarithmic to handle spikes
  v_velocity_score := LEAST(40, 
    (LN(GREATEST(p_impression_velocity, 1)) * 5) +
    (LN(GREATEST(p_view_velocity, 1)) * 3) +
    (LN(GREATEST(p_completion_velocity, 1)) * 2)
  );

  -- Diversity score (0-30 points) - favor unique creators/viewers
  v_diversity_score := LEAST(30,
    (LN(GREATEST(p_unique_creators, 1)) * 10) +
    (LN(GREATEST(p_unique_viewers, 1)) * 5)
  );

  -- Engagement score (0-30 points)
  v_engagement_score := LEAST(30,
    (p_share_rate * 100) +
    (p_save_rate * 50)
  );

  -- Base score before trust-weighting and decay
  v_base_score := v_velocity_score + v_diversity_score + v_engagement_score;

  -- Apply trust-weighting (multiply by normalized trust score)
  v_base_score := v_base_score * (p_trust_weighted_score / 100.0);

  -- Apply decay if past peak
  IF p_peak_timestamp IS NOT NULL THEN
    v_age_hours := EXTRACT(EPOCH FROM (now() - p_peak_timestamp)) / 3600.0;
    
    IF v_age_hours > 0 THEN
      -- Exponential decay: score * e^(-decay_rate * age / max_lifetime)
      v_decay_factor := EXP(-p_decay_rate * v_age_hours / p_max_lifetime_hours);
      v_base_score := v_base_score * v_decay_factor;
    END IF;
  END IF;

  RETURN LEAST(100, GREATEST(0, v_base_score));
END;
$$;

COMMENT ON FUNCTION public.calculate_trend_score_v1 IS 'Phase 1 EPIC H: Calculate final trend score with velocity, diversity, trust, and decay';

-- ============================================================================
-- 4. Check Trend Eligibility Gates
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_trend_eligibility_v1(
  p_hashtag_id UUID,
  p_report_rate NUMERIC,
  p_hide_rate NUMERIC,
  p_unique_creators INTEGER,
  p_unique_viewers INTEGER,
  p_min_creators INTEGER DEFAULT 3,
  p_min_viewers INTEGER DEFAULT 10,
  p_max_report_rate NUMERIC DEFAULT 0.05,
  p_max_hide_rate NUMERIC DEFAULT 0.10
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hashtag_status TEXT;
  v_has_controversial_reels BOOLEAN;
BEGIN
  -- Gate 1: Hashtag must not be restricted/hidden
  SELECT moderation_status INTO v_hashtag_status
  FROM public.hashtags
  WHERE id = p_hashtag_id;

  IF v_hashtag_status IN ('restricted', 'hidden') THEN
    RETURN FALSE;
  END IF;

  -- Gate 2: Minimum unique creators/viewers
  IF p_unique_creators < p_min_creators OR p_unique_viewers < p_min_viewers THEN
    RETURN FALSE;
  END IF;

  -- Gate 3: Report/hide rate below threshold
  IF p_report_rate > p_max_report_rate OR p_hide_rate > p_max_hide_rate THEN
    RETURN FALSE;
  END IF;

  -- Gate 4: No controversial reels (Phase 1 EPIC I integration)
  SELECT EXISTS (
    SELECT 1
    FROM public.reel_hashtags rh
    JOIN public.controversial_content_flags ccf ON ccf.reel_id = rh.reel_id
    WHERE rh.hashtag_id = p_hashtag_id
      AND ccf.is_controversial = TRUE
      AND ccf.status = 'active'
  ) INTO v_has_controversial_reels;

  IF v_has_controversial_reels THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.check_trend_eligibility_v1 IS 'Phase 1 EPIC H: Check if hashtag passes eligibility gates for trending';

-- ============================================================================
-- 5. Update Trending Hashtags (Background Worker Function)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.batch_update_trending_hashtags_v1(
  p_window_hours INTEGER DEFAULT 24,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  hashtag_id UUID,
  tag TEXT,
  trend_score NUMERIC,
  is_trending BOOLEAN,
  is_eligible BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := now() - (p_window_hours || ' hours')::INTERVAL;
  v_window_end TIMESTAMPTZ := now();
  v_hashtag RECORD;
  v_velocity RECORD;
  v_trend_score NUMERIC;
  v_is_eligible BOOLEAN;
  v_peak_timestamp TIMESTAMPTZ;
BEGIN
  -- Process top hashtags by recent usage
  FOR v_hashtag IN (
    SELECT 
      h.id,
      h.tag,
      COUNT(DISTINCT rh.reel_id) AS reel_count
    FROM public.hashtags h
    JOIN public.reel_hashtags rh ON rh.hashtag_id = h.id
    JOIN public.reels r ON r.id = rh.reel_id
    WHERE r.created_at >= v_window_start
      AND h.moderation_status = 'normal'
    GROUP BY h.id, h.tag
    HAVING COUNT(DISTINCT rh.reel_id) >= 5 -- minimum 5 reels to be considered
    ORDER BY COUNT(DISTINCT rh.reel_id) DESC
    LIMIT p_limit
  ) LOOP
    -- Calculate velocity metrics
    SELECT * INTO v_velocity
    FROM public.calculate_hashtag_velocity_v1(v_hashtag.id, p_window_hours);

    -- Check eligibility
    v_is_eligible := public.check_trend_eligibility_v1(
      p_hashtag_id := v_hashtag.id,
      p_report_rate := v_velocity.report_rate,
      p_hide_rate := v_velocity.hide_rate,
      p_unique_creators := v_velocity.unique_creators,
      p_unique_viewers := v_velocity.unique_viewers
    );

    -- Get existing peak timestamp (if any)
    SELECT peak_timestamp INTO v_peak_timestamp
    FROM public.trending_hashtags
    WHERE hashtag_id = v_hashtag.id
      AND window_start >= now() - interval '7 days'
    ORDER BY trend_score DESC
    LIMIT 1;

    -- Calculate trend score
    v_trend_score := public.calculate_trend_score_v1(
      p_impression_velocity := v_velocity.impression_velocity,
      p_view_velocity := v_velocity.view_velocity,
      p_completion_velocity := v_velocity.completion_velocity,
      p_unique_viewers := v_velocity.unique_viewers,
      p_unique_creators := v_velocity.unique_creators,
      p_share_rate := v_velocity.share_rate,
      p_save_rate := v_velocity.save_rate,
      p_trust_weighted_score := v_velocity.trust_weighted_score,
      p_peak_timestamp := v_peak_timestamp
    );

    -- Detect peak (current score > previous peak)
    IF v_peak_timestamp IS NULL OR v_trend_score > COALESCE((
      SELECT trend_score FROM public.trending_hashtags 
      WHERE hashtag_id = v_hashtag.id AND peak_timestamp = v_peak_timestamp
    ), 0) THEN
      v_peak_timestamp := now();
    END IF;

    -- Insert or update trending_hashtags
    INSERT INTO public.trending_hashtags (
      hashtag_id,
      window_start,
      window_end,
      impression_velocity,
      view_velocity,
      completion_velocity,
      unique_viewers,
      unique_creators,
      share_rate,
      save_rate,
      report_rate,
      hide_rate,
      trust_weighted_score,
      trend_score,
      peak_timestamp,
      is_trending,
      is_eligible,
      updated_at
    ) VALUES (
      v_hashtag.id,
      v_window_start,
      v_window_end,
      v_velocity.impression_velocity,
      v_velocity.view_velocity,
      v_velocity.completion_velocity,
      v_velocity.unique_viewers,
      v_velocity.unique_creators,
      v_velocity.share_rate,
      v_velocity.save_rate,
      v_velocity.report_rate,
      v_velocity.hide_rate,
      v_velocity.trust_weighted_score,
      v_trend_score,
      v_peak_timestamp,
      (v_trend_score >= 30 AND v_is_eligible), -- threshold for "trending"
      v_is_eligible,
      now()
    )
    ON CONFLICT (hashtag_id, window_start)
    DO UPDATE SET
      window_end = EXCLUDED.window_end,
      impression_velocity = EXCLUDED.impression_velocity,
      view_velocity = EXCLUDED.view_velocity,
      completion_velocity = EXCLUDED.completion_velocity,
      unique_viewers = EXCLUDED.unique_viewers,
      unique_creators = EXCLUDED.unique_creators,
      share_rate = EXCLUDED.share_rate,
      save_rate = EXCLUDED.save_rate,
      report_rate = EXCLUDED.report_rate,
      hide_rate = EXCLUDED.hide_rate,
      trust_weighted_score = EXCLUDED.trust_weighted_score,
      trend_score = EXCLUDED.trend_score,
      peak_timestamp = EXCLUDED.peak_timestamp,
      is_trending = EXCLUDED.is_trending,
      is_eligible = EXCLUDED.is_eligible,
      updated_at = now();

    -- Return result
    RETURN QUERY SELECT 
      v_hashtag.id,
      v_hashtag.tag,
      v_trend_score,
      (v_trend_score >= 30 AND v_is_eligible),
      v_is_eligible;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.batch_update_trending_hashtags_v1 IS 'Phase 1 EPIC H: Background worker to update trending hashtags (run every 15-30 minutes)';

-- ============================================================================
-- 6. Get Trending Hashtags (Public API)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_trending_hashtags_v1(
  p_limit INTEGER DEFAULT 20,
  p_min_score NUMERIC DEFAULT 30
)
RETURNS TABLE (
  hashtag_id UUID,
  tag TEXT,
  display_tag TEXT,
  trend_score NUMERIC,
  impression_velocity NUMERIC,
  unique_creators INTEGER,
  unique_viewers INTEGER,
  peak_timestamp TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    th.hashtag_id,
    h.tag,
    h.display_tag,
    th.trend_score,
    th.impression_velocity,
    th.unique_creators,
    th.unique_viewers,
    th.peak_timestamp
  FROM public.trending_hashtags th
  JOIN public.hashtags h ON h.id = th.hashtag_id
  WHERE th.is_trending = TRUE
    AND th.is_eligible = TRUE
    AND th.trend_score >= p_min_score
    AND th.window_end >= now() - interval '6 hours' -- only recent windows
    AND h.moderation_status = 'normal'
  ORDER BY th.trend_score DESC, th.peak_timestamp DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_trending_hashtags_v1(INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trending_hashtags_v1(INTEGER, NUMERIC) TO authenticated, anon;

COMMENT ON FUNCTION public.get_trending_hashtags_v1 IS 'Phase 1 EPIC H: Get current trending hashtags sorted by trend score';

-- ============================================================================
-- 7. Cleanup Old Trending Data
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_trending_hashtags_v1(
  p_retention_days INTEGER DEFAULT 7
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.trending_hashtags
  WHERE window_end < now() - (p_retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_trending_hashtags_v1 IS 'Phase 1 EPIC H: Cleanup old trending hashtag data (default 7 days retention)';

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE public.trending_hashtags ENABLE ROW LEVEL SECURITY;

-- Public can read trending hashtags
CREATE POLICY trending_hashtags_select_policy ON public.trending_hashtags
  FOR SELECT
  TO PUBLIC
  USING (
    is_trending = TRUE 
    AND is_eligible = TRUE 
    AND window_end >= now() - interval '24 hours'
  );

-- ============================================================================
-- Summary
-- ============================================================================
-- Phase 1 EPIC H Part 2: Trend Engine Complete
--
-- Tables Created:
--  - trending_hashtags (velocity, diversity, trust-weighted scores, decay)
--
-- Functions Created:
--  - calculate_hashtag_velocity_v1 (velocity metrics + trust-weighting)
--  - calculate_trend_score_v1 (final score with decay)
--  - check_trend_eligibility_v1 (safety gates)
--  - batch_update_trending_hashtags_v1 (background worker - run every 15-30 min)
--  - get_trending_hashtags_v1 (public API)
--  - cleanup_trending_hashtags_v1 (retention cleanup - run daily)
--
-- Next Steps:
--  1. Deploy background worker (pg_cron or Edge Function)
--  2. Implement hashtag surfaces (Top/Recent/Trending/Related)
--  3. Implement anti-hijack (relevance gate, coordinated attack guard)
-- ============================================================================
