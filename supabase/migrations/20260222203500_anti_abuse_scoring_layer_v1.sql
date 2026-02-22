-- Anti-Abuse Scoring Layer
-- Foundation for fair trending + moderation
-- Policy-driven trust weights, bot detection, coordinated behavior flags

-- ============================================================================
-- 1. ANTI-ABUSE POLICY (version-able, audit-able)
-- ============================================================================

CREATE TABLE IF NOT EXISTS anti_abuse_policies (
  id BIGSERIAL PRIMARY KEY,
  policy_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  
  -- Policy identity
  policy_name TEXT NOT NULL UNIQUE,
  description TEXT,
  
  -- Versioning
  version INT NOT NULL DEFAULT 1,
  algorithm_version TEXT,
  
  -- Default weights for this policy
  default_trust_weight NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  bot_threshold NUMERIC(5,4) NOT NULL DEFAULT 0.7,
  coordinated_threshold NUMERIC(5,4) NOT NULL DEFAULT 0.8,
  
  -- Spam scoring formula parameters (pluggable)
  -- score = (violations_24h * decay_factor) + (coordinated_flag ? penalty : 0) + ...
  violation_penalty NUMERIC(5,4) DEFAULT 0.1,
  coordinated_penalty NUMERIC(5,4) DEFAULT 0.3,
  recent_ban_penalty NUMERIC(5,4) DEFAULT 0.5,
  
  -- Segments and rollout
  segment_id TEXT DEFAULT 'seg_default',
  enabled BOOLEAN DEFAULT TRUE,
  rollout_percentage INT DEFAULT 100 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  
  -- Audit
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT policy_default_trust_range CHECK (default_trust_weight >= 0 AND default_trust_weight <= 1),
  CONSTRAINT policy_bot_threshold_range CHECK (bot_threshold >= 0 AND bot_threshold <= 1),
  CONSTRAINT policy_coordinated_threshold_range CHECK (coordinated_threshold >= 0 AND coordinated_threshold <= 1)
);

CREATE INDEX idx_anti_abuse_policies_name ON anti_abuse_policies(policy_name);
CREATE INDEX idx_anti_abuse_policies_enabled ON anti_abuse_policies(enabled) WHERE enabled = TRUE;
CREATE INDEX idx_anti_abuse_policies_segment ON anti_abuse_policies(segment_id, version DESC);

-- ============================================================================
-- 2. SPAM INDICATOR LOG (immutable, append-only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS spam_indicators (
  id BIGSERIAL PRIMARY KEY,
  indicator_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  
  -- User and context
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Indicator type
  indicator_type TEXT NOT NULL CHECK (indicator_type IN (
    'rapid_hashtag_spam',      -- Many hashtags in short time
    'hashtag_repetition',      -- Same hashtag >3x in 24h
    'coordinated_mention',     -- Linked accounts mentioning same hashtag
    'bot_pattern',             -- API-like behavior (exact timing, content)
    'content_farm',            -- Low-effort reposting
    'link_spam',               -- Excessive URLs in short time
    'phishing_attempt',        -- Suspicious URLs
    'harassment',              -- Report-based indicator
    'misinformation'           -- Fact-check data
  )),
  
  -- Severity and confidence
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  
  -- Evidence (structured)
  evidence JSONB NOT NULL, -- {count, time_window, urls, linked_users, etc}
  
  -- Source of indicator
  source TEXT CHECK (source IN ('automated', 'user_report', 'manual_review')),
  source_user_id UUID,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT spam_indicator_evidence_notnull CHECK (evidence IS NOT NULL)
);

CREATE INDEX idx_spam_indicators_user ON spam_indicators(user_id, created_at DESC);
CREATE INDEX idx_spam_indicators_type ON spam_indicators(indicator_type, severity);
CREATE INDEX idx_spam_indicators_confidence ON spam_indicators(confidence DESC) WHERE confidence > 0.5;

-- ============================================================================
-- 3. COORDINATED BEHAVIOR DETECTION (explicit linking of accounts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS coordinated_behavior_clusters (
  id BIGSERIAL PRIMARY KEY,
  cluster_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  
  -- Root node and cluster members
  representative_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_ids UUID[] NOT NULL CHECK (array_length(member_user_ids, 1) > 0),
  
  -- Behavior pattern
  behavior_pattern TEXT CHECK (behavior_pattern IN (
    'same_hashtag_timing',     -- Same hashtags within minutes
    'mutual_engagement',       -- Liking/commenting on each other's posts
    'device_fingerprint',      -- Same device/IP across accounts
    'content_farm_network',    -- Synchronized reposting
    'bot_swarm'                -- Clearly automated accounts
  )),
  
  -- Confidence and signals
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  signal_strength INT DEFAULT 0,
  
  -- Detection metadata
  first_detected_at TIMESTAMP WITH TIME ZONE,
  last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Action state
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'false_positive')),
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_coordinated_clusters_member ON coordinated_behavior_clusters USING GIN (member_user_ids);
CREATE INDEX idx_coordinated_clusters_confidence ON coordinated_behavior_clusters(confidence DESC);
CREATE INDEX idx_coordinated_clusters_pattern ON coordinated_behavior_clusters(behavior_pattern, status);

-- ============================================================================
-- 4. TRUST WEIGHT OVERRIDE (admin can manually adjust for appeals)
-- ============================================================================

CREATE TABLE IF NOT EXISTS trust_weight_overrides (
  id BIGSERIAL PRIMARY KEY,
  override_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  
  -- User and override details
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  override_trust_weight NUMERIC(5,4) NOT NULL CHECK (override_trust_weight >= 0 AND override_trust_weight <= 1),
  
  -- Justification
  reason_code TEXT CHECK (reason_code IN (
    'appeal_approved',
    'false_positive_detection',
    'behavior_changed',
    'account_recovery',
    'testing'
  )),
  reason_notes TEXT,
  
  -- Validity
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valid_until TIMESTAMP WITH TIME ZONE,
  
  -- Audit
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT override_validity_window CHECK (valid_from <= valid_until OR valid_until IS NULL)
);

CREATE INDEX idx_trust_weight_overrides_user ON trust_weight_overrides(user_id, valid_until DESC);
CREATE INDEX idx_trust_weight_overrides_valid ON trust_weight_overrides(valid_from, valid_until);

-- ============================================================================
-- 5. COMPUTE AGGREGATE SPAM SCORE (RPC)
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_user_spam_score_v1(
  p_user_id UUID,
  p_policy_id UUID DEFAULT NULL,
  p_lookback_days INT DEFAULT 7
)
RETURNS TABLE (
  user_id UUID,
  spam_score NUMERIC,
  trust_weight NUMERIC,
  bot_likelihood NUMERIC,
  is_coordinated_member BOOLEAN,
  indicators_count INT,
  policy_applied TEXT
) AS $$
DECLARE
  v_spam_score NUMERIC := 0;
  v_trust_weight NUMERIC := 1.0;
  v_bot_likelihood NUMERIC := 0;
  v_is_coordinated BOOLEAN := FALSE;
  v_indicator_count INT := 0;
  v_policy_name TEXT;
  v_violation_penalty NUMERIC;
  v_coordinated_penalty NUMERIC;
  v_recent_ban_penalty NUMERIC;
BEGIN
  -- Get policy (use default if not specified)
  IF p_policy_id IS NULL THEN
    SELECT policy_id, policy_name, violation_penalty, coordinated_penalty, recent_ban_penalty
    INTO p_policy_id, v_policy_name, v_violation_penalty, v_coordinated_penalty, v_recent_ban_penalty
    FROM anti_abuse_policies
    WHERE enabled = TRUE AND segment_id = 'seg_default'
    ORDER BY version DESC
    LIMIT 1;
  ELSE
    SELECT policy_name, violation_penalty, coordinated_penalty, recent_ban_penalty
    INTO v_policy_name, v_violation_penalty, v_coordinated_penalty, v_recent_ban_penalty
    FROM anti_abuse_policies
    WHERE policy_id = p_policy_id;
  END IF;
  
  -- Count recent spam indicators
  SELECT COUNT(*), COALESCE(SUM(
    CASE WHEN severity = 'critical' THEN 0.3
         WHEN severity = 'high' THEN 0.2
         WHEN severity = 'medium' THEN 0.1
         ELSE 0.05
    END * confidence
  ), 0)
  INTO v_indicator_count, v_spam_score
  FROM spam_indicators
  WHERE user_id = p_user_id
    AND created_at >= CURRENT_TIMESTAMP - (p_lookback_days || ' days')::INTERVAL;
  
  -- Check if member of coordinated cluster
  SELECT EXISTS(
    SELECT 1 FROM coordinated_behavior_clusters
    WHERE p_user_id = ANY(member_user_ids)
      AND status = 'active'
      AND confidence > 0.7
  ) INTO v_is_coordinated;
  
  -- Apply coordinated penalty
  IF v_is_coordinated THEN
    v_spam_score := LEAST(1.0, v_spam_score + v_coordinated_penalty);
    v_bot_likelihood := (v_spam_score * 0.6);
  END IF;
  
  -- Apply recency decay and bot heuristics
  -- Recent violations (< 2 days) are weighted more heavily
  PERFORM (
    SELECT SUM(CASE WHEN created_at > CURRENT_TIMESTAMP - INTERVAL '2 days' THEN 0.1 ELSE 0 END)
    FROM spam_indicators
    WHERE user_id = p_user_id
  );
  
  -- Compute trust weight from spam score
  v_trust_weight := GREATEST(0, LEAST(1, 1.0 - v_spam_score));
  
  -- Apply override if exists
  WITH active_override AS (
    SELECT override_trust_weight
    FROM trust_weight_overrides
    WHERE user_id = p_user_id
      AND valid_from <= CURRENT_TIMESTAMP
      AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)
    ORDER BY created_at DESC
    LIMIT 1
  )
  SELECT COALESCE(override_trust_weight, v_trust_weight)
  INTO v_trust_weight
  FROM active_override;
  
  RETURN QUERY SELECT
    p_user_id,
    ROUND(v_spam_score::NUMERIC, 4),
    ROUND(v_trust_weight::NUMERIC, 4),
    ROUND(v_bot_likelihood::NUMERIC, 4),
    v_is_coordinated,
    v_indicator_count,
    COALESCE(v_policy_name, 'default');
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 6. RECORD SPAM INDICATOR (with confidence scoring)
-- ============================================================================

CREATE OR REPLACE FUNCTION record_spam_indicator_v1(
  p_user_id UUID,
  p_indicator_type TEXT,
  p_severity TEXT,
  p_confidence NUMERIC,
  p_evidence JSONB,
  p_source TEXT DEFAULT 'automated',
  p_source_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  indicator_id UUID,
  spam_score NUMERIC,
  trust_weight NUMERIC,
  action_recommended TEXT
) AS $$
DECLARE
  v_indicator_id UUID;
  v_spam_score NUMERIC;
  v_trust_weight NUMERIC;
  v_action TEXT := 'none';
BEGIN
  -- Insert indicator
  INSERT INTO spam_indicators (
    user_id, indicator_type, severity, confidence, evidence, source, source_user_id
  ) VALUES (
    p_user_id, p_indicator_type, p_severity, p_confidence, p_evidence, p_source, p_source_user_id
  )
  RETURNING indicator_id
  INTO v_indicator_id;
  
  -- Compute updated spam score
  SELECT spam_score, trust_weight
  INTO v_spam_score, v_trust_weight
  FROM compute_user_spam_score_v1(p_user_id);
  
  -- Determine recommended action
  IF v_trust_weight < 0.2 THEN
    v_action := 'suspend_user';
  ELSIF v_trust_weight < 0.5 THEN
    v_action := 'rate_limit_hashtags';
  ELSIF v_trust_weight < 0.7 THEN
    v_action := 'suppress_from_trending';
  END IF;
  
  RETURN QUERY SELECT v_indicator_id, v_spam_score, v_trust_weight, v_action;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON anti_abuse_policies TO authenticated, service_role;
GRANT SELECT ON spam_indicators TO service_role;
GRANT SELECT ON coordinated_behavior_clusters TO service_role;
GRANT SELECT ON trust_weight_overrides TO service_role;
GRANT EXECUTE ON FUNCTION compute_user_spam_score_v1 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION record_spam_indicator_v1 TO service_role;

COMMENT ON TABLE anti_abuse_policies IS 'Version-able, audit-able anti-abuse policies for different segments and rollouts';
COMMENT ON TABLE spam_indicators IS 'Immutable log of indicators detected for users (automated or manual)';
COMMENT ON TABLE coordinated_behavior_clusters IS 'Explicit linking of coordinated accounts for enforcement';
COMMENT ON FUNCTION compute_user_spam_score_v1 IS 'Calculate aggregate spam score from indicators + policy applied, with override support';
COMMENT ON FUNCTION record_spam_indicator_v1 IS 'Record new spam indicator and auto-recommend action based on threshold';
