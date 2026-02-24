-- Phase 1 EPIC I: Controversial Amplification Guardrail
-- Detects content with high engagement velocity + high report/hide rate
-- and applies controversial_penalty to prevent toxic viral amplification

-- 1) Controversial Content Detection Table
CREATE TABLE IF NOT EXISTS public.controversial_content_flags (
  reel_id UUID PRIMARY KEY REFERENCES public.reels(id) ON DELETE CASCADE,
  
  -- Metrics window (last 24h by default)
  engagement_velocity NUMERIC NOT NULL, -- (likes+shares+saves) / hours_since_publish
  report_rate NUMERIC NOT NULL,        -- reports / impressions
  hide_rate NUMERIC NOT NULL,           -- hide actions / impressions
  
  -- Thresholds from config
  velocity_threshold NUMERIC NOT NULL,
  report_threshold NUMERIC NOT NULL,
  hide_threshold NUMERIC NOT NULL,
  
  -- Status
  is_controversial BOOLEAN NOT NULL DEFAULT FALSE,
  penalty_score NUMERIC NOT NULL DEFAULT 0, -- Applied to ranking score
  
  -- Moderation escalation
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  
  -- Lifecycle
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ -- Auto-expire after review or time limit
);

CREATE INDEX IF NOT EXISTS controversial_flags_needs_review_idx
  ON public.controversial_content_flags(needs_review, flagged_at DESC)
  WHERE needs_review = TRUE;

CREATE INDEX IF NOT EXISTS controversial_flags_active_idx
  ON public.controversial_content_flags(is_controversial, updated_at DESC)
  WHERE is_controversial = TRUE;

ALTER TABLE public.controversial_content_flags ENABLE ROW LEVEL SECURITY;

-- Service role only (internal enforcement)
DROP POLICY IF EXISTS "controversial_flags_service_role_all" ON public.controversial_content_flags;
CREATE POLICY "controversial_flags_service_role_all"
  ON public.controversial_content_flags
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- 2) RPC: Check and Flag Controversial Content
CREATE OR REPLACE FUNCTION public.check_controversial_content_v1(
  p_reel_id UUID,
  p_velocity_threshold NUMERIC DEFAULT 50.0,  -- engagements/hour
  p_report_threshold NUMERIC DEFAULT 0.02,    -- 2% report rate
  p_hide_threshold NUMERIC DEFAULT 0.05       -- 5% hide rate
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours_since_publish NUMERIC;
  v_engagement_count INTEGER;
  v_engagement_velocity NUMERIC;
  v_impressions_count INTEGER;
  v_report_count INTEGER;
  v_hide_count INTEGER;
  v_report_rate NUMERIC;
  v_hide_rate NUMERIC;
  v_is_controversial BOOLEAN := FALSE;
  v_penalty_score NUMERIC := 0;
  v_needs_review BOOLEAN := FALSE;
BEGIN
  -- Calculate hours since publish
  SELECT 
    EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600.0,
    r.likes_count + r.shares_count + r.saves_count
  INTO v_hours_since_publish, v_engagement_count
  FROM public.reels r
  WHERE r.id = p_reel_id;
  
  IF v_hours_since_publish IS NULL OR v_hours_since_publish < 1 THEN
    -- Too new, insufficient data
    RETURN FALSE;
  END IF;
  
  -- Calculate engagement velocity
  v_engagement_velocity := v_engagement_count / v_hours_since_publish;
  
  -- Get impressions count (last 24h)
  SELECT COUNT(*)
  INTO v_impressions_count
  FROM public.reel_impressions ri
  WHERE ri.reel_id = p_reel_id
    AND ri.viewed_at > NOW() - INTERVAL '24 hours';
    
  IF v_impressions_count < 100 THEN
    -- Insufficient impressions for reliable signal
    RETURN FALSE;
  END IF;
  
  -- Get report count (from reel_feedback or report events)
  SELECT COUNT(*) FILTER (WHERE feedback_type = 'report')
  INTO v_report_count
  FROM public.reel_feedback rf
  WHERE rf.reel_id = p_reel_id
    AND rf.created_at > NOW() - INTERVAL '24 hours';
  
  -- Get hide/not_interested count
  SELECT COUNT(*) FILTER (WHERE feedback_type IN ('hide', 'not_interested'))
  INTO v_hide_count
  FROM public.reel_feedback rf
  WHERE rf.reel_id = p_reel_id
    AND rf.created_at > NOW() - INTERVAL '24 hours';
  
  -- Calculate rates
  v_report_rate := v_report_count::NUMERIC / NULLIF(v_impressions_count, 0);
  v_hide_rate := v_hide_count::NUMERIC / NULLIF(v_impressions_count, 0);
  
  -- Detect controversial pattern: high velocity + high negative feedback
  IF v_engagement_velocity > p_velocity_threshold 
     AND (v_report_rate > p_report_threshold OR v_hide_rate > p_hide_threshold) THEN
    v_is_controversial := TRUE;
    
    -- Calculate penalty score (higher = worse)
    v_penalty_score := (v_report_rate / p_report_threshold) * 40.0 
                     + (v_hide_rate / p_hide_threshold) * 20.0;
    v_penalty_score := LEAST(v_penalty_score, 100.0); -- Cap at 100
    
    -- Escalate to moderation if extreme
    IF v_report_rate > (p_report_threshold * 2) THEN
      v_needs_review := TRUE;
    END IF;
  END IF;
  
  -- Upsert flag
  INSERT INTO public.controversial_content_flags (
    reel_id, engagement_velocity, report_rate, hide_rate,
    velocity_threshold, report_threshold, hide_threshold,
    is_controversial, penalty_score, needs_review,
    expires_at
  )
  VALUES (
    p_reel_id, v_engagement_velocity, v_report_rate, v_hide_rate,
    p_velocity_threshold, p_report_threshold, p_hide_threshold,
    v_is_controversial, v_penalty_score, v_needs_review,
    NOW() + INTERVAL '7 days'
  )
  ON CONFLICT (reel_id) DO UPDATE SET
    engagement_velocity = EXCLUDED.engagement_velocity,
    report_rate = EXCLUDED.report_rate,
    hide_rate = EXCLUDED.hide_rate,
    is_controversial = EXCLUDED.is_controversial,
    penalty_score = EXCLUDED.penalty_score,
    needs_review = EXCLUDED.needs_review OR controversial_content_flags.needs_review,
    updated_at = NOW();
  
  RETURN v_is_controversial;
END;
$$;

COMMENT ON FUNCTION check_controversial_content_v1 IS 
  'Phase 1 EPIC I: Detect controversial content (high engagement + high report/hide rate) and apply penalty';

-- 3) RPC: Get Controversial Penalty for Ranking
CREATE OR REPLACE FUNCTION public.get_controversial_penalty_v1(p_reel_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_penalty NUMERIC := 0;
BEGIN
  SELECT COALESCE(penalty_score, 0)
  INTO v_penalty
  FROM public.controversial_content_flags
  WHERE reel_id = p_reel_id
    AND is_controversial = TRUE
    AND (expires_at IS NULL OR expires_at > NOW());
  
  RETURN v_penalty;
END;
$$;

COMMENT ON FUNCTION get_controversial_penalty_v1 IS
  'Phase 1 EPIC I: Get controversial penalty score for ranking (0 if not controversial)';

-- 4) RPC: Batch Check Controversial Content (for worker)
CREATE OR REPLACE FUNCTION public.batch_check_controversial_v1(
  p_limit INTEGER DEFAULT 100,
  p_min_impressions INTEGER DEFAULT 1000
)
RETURNS TABLE (
  reel_id UUID,
  is_controversial BOOLEAN,
  penalty_score NUMERIC,
  needs_review BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check high-impression reels from last 48h
  RETURN QUERY
  WITH candidates AS (
    SELECT DISTINCT ri.reel_id
    FROM public.reel_impressions ri
    WHERE ri.viewed_at > NOW() - INTERVAL '48 hours'
    GROUP BY ri.reel_id
    HAVING COUNT(*) >= p_min_impressions
    LIMIT p_limit
  )
  SELECT 
    c.reel_id,
    check_controversial_content_v1(c.reel_id) AS is_controversial,
    get_controversial_penalty_v1(c.reel_id) AS penalty_score,
    (SELECT needs_review FROM public.controversial_content_flags WHERE reel_id = c.reel_id)
  FROM candidates c;
END;
$$;

COMMENT ON FUNCTION batch_check_controversial_v1 IS
  'Phase 1 EPIC I: Batch process reels to detect controversial content (for background worker)';

-- 5) RPC: Review Controversial Content (Admin)
CREATE OR REPLACE FUNCTION public.review_controversial_content_v1(
  p_reel_id UUID,
  p_action TEXT, -- 'approve', 'suppress', 'remove'
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reviewer UUID := auth.uid();
BEGIN
  -- Verify admin role (simplified, use proper RBAC in production)
  IF v_reviewer IS NULL THEN
    RAISE EXCEPTION 'review_controversial_content requires authenticated user';
  END IF;
  
  -- Update flag
  UPDATE public.controversial_content_flags
  SET 
    reviewed_at = NOW(),
    reviewed_by = v_reviewer,
    needs_review = FALSE,
    is_controversial = CASE 
      WHEN p_action = 'approve' THEN FALSE
      WHEN p_action = 'suppress' THEN TRUE
      ELSE is_controversial
    END,
    penalty_score = CASE
      WHEN p_action = 'approve' THEN 0
      WHEN p_action = 'suppress' THEN 100.0
      ELSE penalty_score
    END
  WHERE reel_id = p_reel_id;
  
  -- If remove, hide the reel
  IF p_action = 'remove' THEN
    UPDATE public.reels
    SET moderation_status = 'removed',
        visibility_status = 'hidden'
    WHERE id = p_reel_id;
  END IF;
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION review_controversial_content_v1 IS
  'Phase 1 EPIC I: Admin review of controversial content flags';

-- Grant permissions
REVOKE ALL ON FUNCTION check_controversial_content_v1(UUID, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_controversial_penalty_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION batch_check_controversial_v1(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION review_controversial_content_v1(UUID, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION check_controversial_content_v1(UUID, NUMERIC, NUMERIC, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION get_controversial_penalty_v1(UUID) TO service_role, authenticated; -- Needed for feed
GRANT EXECUTE ON FUNCTION batch_check_controversial_v1(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION review_controversial_content_v1(UUID, TEXT, TEXT) TO authenticated; -- Admin only (add RBAC check)

-- 6) Cleanup expired flags (cron job helper)
CREATE OR REPLACE FUNCTION public.cleanup_controversial_flags_v1(p_days_expired INTEGER DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.controversial_content_flags
  WHERE expires_at < NOW() - (p_days_expired || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION cleanup_controversial_flags_v1(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_controversial_flags_v1(INTEGER) TO service_role;
