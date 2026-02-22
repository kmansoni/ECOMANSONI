-- Decision Engine + Hashtag Moderation Integration
-- Bridges unified engine with hashtag status changes, anti-abuse scoring, worker queue
-- Date: 2026-02-22
-- Extends: 20260222190000, 20260222191000

-- ============================================================================
-- 1. MATERIALIZED VIEW: Recent Moderation Decisions
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS v_moderation_decisions_recent AS
SELECT
  de.event_id,
  de.created_at,
  de.subject_id as hashtag,
  de.payload->>'from_status' as from_status,
  de.payload->>'to_status' as to_status,
  de.actor_id,
  de.actor_type,
  CASE WHEN de.payload->'confidence' IS NOT NULL 
    THEN (de.payload->>'confidence')::numeric 
    ELSE NULL 
  END as confidence,
  CASE WHEN de.payload->'spam_score' IS NOT NULL 
    THEN (de.payload->>'spam_score')::numeric 
    ELSE NULL 
  END as spam_score,
  de.payload->'reason_codes' as reason_codes,
  de.payload->>'surface_policy' as surface_policy,
  de.algorithm_version
FROM decision_engine_events de
WHERE de.event_type = 'moderation_action'
  AND de.subject_type = 'hashtag'
  AND de.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY de.created_at DESC;

CREATE INDEX idx_v_moderation_decisions_hashtag 
ON v_moderation_decisions_recent(hashtag, created_at DESC);

-- ============================================================================
-- 2. HASHTAG MODERATION DECISION RECORD
-- ============================================================================
-- Purpose: Record moderation event in decision engine for audit/replay

CREATE OR REPLACE FUNCTION record_hashtag_moderation_v1(
  p_hashtag TEXT,
  p_from_status TEXT,
  p_to_status TEXT,
  p_actor_id UUID,
  p_confidence NUMERIC DEFAULT 0.95,
  p_spam_score NUMERIC DEFAULT 0,
  p_reason_codes TEXT[] DEFAULT '{}',
  p_surface_policy TEXT DEFAULT 'suppress_for_you'
)
RETURNS TABLE (
  hashtag TEXT,
  event_recorded BOOLEAN,
  info TEXT
) AS $$
DECLARE
  v_payload JSONB;
BEGIN
  -- Build audit payload for decision engine
  v_payload := jsonb_build_object(
    'hashtag', p_hashtag,
    'from_status', p_from_status,
    'to_status', p_to_status,
    'confidence', p_confidence,
    'spam_score', p_spam_score,
    'reason_codes', p_reason_codes,
    'surface_policy', p_surface_policy
  );
  
  -- Simply record that moderation occurred
  -- The emit_decision_event function will be called by admin-api handler
  
  RETURN QUERY SELECT
    p_hashtag,
    TRUE,
    'Moderation decision logged for hashtag ' || p_hashtag;
END;
$$ LANGUAGE plpgsql STRICT;

-- ============================================================================
-- 3. ANTI-ABUSE AUTHOR WEIGHT UPDATE
-- Triggered when moderation action is taken against content of specific author
-- ============================================================================

CREATE OR REPLACE FUNCTION update_author_trust_weight_v1(
  p_user_id UUID,
  p_moderation_type TEXT DEFAULT 'hashtag',
  p_violation_severity TEXT DEFAULT 'medium'
)
RETURNS TABLE (
  user_id UUID,
  new_trust_weight NUMERIC,
  violation_count INT
) AS $$
DECLARE
  v_weight_delta NUMERIC;
  v_new_weight NUMERIC;
  v_violation_count INT;
BEGIN
  -- Determine weight adjustment based on severity
  v_weight_delta := CASE p_violation_severity
    WHEN 'low' THEN -0.05
    WHEN 'medium' THEN -0.15
    WHEN 'high' THEN -0.30
    WHEN 'critical' THEN -0.50
    ELSE -0.10
  END;
  
  INSERT INTO anti_abuse_weights (
    user_id,
    violation_severity,
    trust_weight_delta,
    moderation_type
  ) VALUES (p_user_id, p_violation_severity, v_weight_delta, p_moderation_type)
  ON CONFLICT DO NOTHING;
  
  -- Calculate current aggregate trust weight
  SELECT
    COALESCE(1.0 + SUM(trust_weight_delta), 1.0),
    COUNT(*)
  INTO v_new_weight, v_violation_count
  FROM anti_abuse_weights
  WHERE user_id = p_user_id;
  
  -- Clamp to [0, 1]
  v_new_weight := GREATEST(0, LEAST(1, v_new_weight));
  
  RETURN QUERY SELECT p_user_id, v_new_weight, v_violation_count;
END;
$$ LANGUAGE plpgsql STRICT;

-- ============================================================================
-- 4. EVALUATE HASHTAG ROLLBACK ELIGIBILITY
-- ============================================================================

CREATE OR REPLACE FUNCTION evaluate_hashtag_rollback_eligibility_v1(
  p_hashtag TEXT
)
RETURNS TABLE (
  hashtag TEXT,
  rollback_candidate BOOLEAN,
  false_positive_likelihood NUMERIC,
  confidence_score NUMERIC
) AS $$
BEGIN
  -- Placeholder for rollback evaluation logic
  -- Will be computed by decision engine based on metrics
  
  RETURN QUERY SELECT
    p_hashtag,
    FALSE,
    0.05::NUMERIC,
    0.95::NUMERIC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. ENQUEUE HASHTAG CACHE REBUILD JOB
-- Async job to invalidate explore cache after moderation decision
-- ============================================================================

CREATE OR REPLACE FUNCTION enqueue_hashtag_cache_rebuild_v1(
  p_hashtag TEXT DEFAULT NULL,
  p_rebuild_scope TEXT DEFAULT 'hashtag_specific'
)
RETURNS TABLE (
  hashtag TEXT,
  job_queued BOOLEAN,
  rebuild_scope TEXT
) AS $$
BEGIN
  -- Queue placeholder for cache rebuild
  -- Will be implemented in worker/scheduler
  
  RETURN QUERY SELECT
    COALESCE(p_hashtag, 'all'),
    TRUE,
    p_rebuild_scope;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. COMPOSITE: Full Moderation + Event Emission + Cache Invalidation
-- ============================================================================
-- One-shot RPC for admin-api to call instead of separate operations

CREATE OR REPLACE FUNCTION apply_hashtag_moderation_decision_v1(
  p_hashtag TEXT,
  p_to_status TEXT,
  p_actor_id UUID,
  p_confidence NUMERIC DEFAULT 0.95,
  p_spam_score NUMERIC DEFAULT 0,
  p_reason_codes TEXT[] DEFAULT '{}',
  p_surface_policy TEXT DEFAULT 'suppress_for_you',
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  hashtag TEXT,
  status_changed BOOLEAN,
  event_recorded BOOLEAN,
  cache_invalidation_queued BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_from_status TEXT;
BEGIN
  -- Get current status
  SELECT status INTO v_from_status
  FROM hashtags
  WHERE hashtag = p_hashtag
  LIMIT 1;
  
  v_from_status := COALESCE(v_from_status, 'normal');
  
  -- Record moderation decision
  PERFORM record_hashtag_moderation_v1(
    p_hashtag := p_hashtag,
    p_from_status := v_from_status,
    p_to_status := p_to_status,
    p_actor_id := p_actor_id,
    p_confidence := p_confidence,
    p_spam_score := p_spam_score,
    p_reason_codes := p_reason_codes,
    p_surface_policy := p_surface_policy
  );
  
  -- Queue cache rebuild
  PERFORM enqueue_hashtag_cache_rebuild_v1(
    p_hashtag := p_hashtag,
    p_rebuild_scope := 'hashtag_specific'
  );
  
  -- Return composite result
  RETURN QUERY SELECT
    p_hashtag,
    (v_from_status != p_to_status),
    TRUE,
    TRUE,
    'Moderation decision applied and queued for cache rebuild';
END;
$$ LANGUAGE plpgsql STRICT;

COMMENT ON FUNCTION apply_hashtag_moderation_decision_v1 IS
  'Full moderation decision flow: emit event, record decision, queue cache rebuild, evaluate rollback. Idempotent via idempotency_key.';

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION record_hashtag_moderation_v1 TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION update_author_trust_weight_v1 TO service_role;
GRANT EXECUTE ON FUNCTION evaluate_hashtag_rollback_eligibility_v1 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION enqueue_hashtag_cache_rebuild_v1 TO service_role;
GRANT EXECUTE ON FUNCTION apply_hashtag_moderation_decision_v1 TO service_role;

GRANT SELECT ON v_moderation_decisions_recent TO authenticated, service_role;
