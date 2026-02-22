-- Anti-abuse: fix compute_user_spam_score_v1 ambiguous user_id references
-- Reason: RETURNS TABLE defines output column "user_id" which is also a plpgsql variable.

CREATE OR REPLACE FUNCTION public.compute_user_spam_score_v1(
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
    SELECT p.policy_id, p.policy_name, p.violation_penalty, p.coordinated_penalty, p.recent_ban_penalty
    INTO p_policy_id, v_policy_name, v_violation_penalty, v_coordinated_penalty, v_recent_ban_penalty
    FROM public.anti_abuse_policies p
    WHERE p.enabled = TRUE AND p.segment_id = 'seg_default'
    ORDER BY p.version DESC
    LIMIT 1;
  ELSE
    SELECT p.policy_name, p.violation_penalty, p.coordinated_penalty, p.recent_ban_penalty
    INTO v_policy_name, v_violation_penalty, v_coordinated_penalty, v_recent_ban_penalty
    FROM public.anti_abuse_policies p
    WHERE p.policy_id = p_policy_id;
  END IF;

  -- Fallback defaults if policy not found
  v_policy_name := COALESCE(v_policy_name, 'default');
  v_violation_penalty := COALESCE(v_violation_penalty, 0.1);
  v_coordinated_penalty := COALESCE(v_coordinated_penalty, 0.3);
  v_recent_ban_penalty := COALESCE(v_recent_ban_penalty, 0.5);

  -- Count recent spam indicators
  SELECT COUNT(*), COALESCE(SUM(
    CASE WHEN si.severity = 'critical' THEN 0.3
         WHEN si.severity = 'high' THEN 0.2
         WHEN si.severity = 'medium' THEN 0.1
         ELSE 0.05
    END * si.confidence
  ), 0)
  INTO v_indicator_count, v_spam_score
  FROM public.spam_indicators si
  WHERE si.user_id = p_user_id
    AND si.created_at >= CURRENT_TIMESTAMP - (p_lookback_days || ' days')::INTERVAL;

  -- Check if member of coordinated cluster
  SELECT EXISTS(
    SELECT 1 FROM public.coordinated_behavior_clusters c
    WHERE p_user_id = ANY(c.member_user_ids)
      AND c.status = 'active'
      AND c.confidence > 0.7
  ) INTO v_is_coordinated;

  IF v_is_coordinated THEN
    v_spam_score := LEAST(1.0, v_spam_score + v_coordinated_penalty);
    v_bot_likelihood := (v_spam_score * 0.6);
  END IF;

  v_trust_weight := GREATEST(0, LEAST(1, 1.0 - v_spam_score));

  WITH active_override AS (
    SELECT t.override_trust_weight
    FROM public.trust_weight_overrides t
    WHERE t.user_id = p_user_id
      AND t.valid_from <= CURRENT_TIMESTAMP
      AND (t.valid_until IS NULL OR t.valid_until > CURRENT_TIMESTAMP)
    ORDER BY t.created_at DESC
    LIMIT 1
  )
  SELECT COALESCE(active_override.override_trust_weight, v_trust_weight)
  INTO v_trust_weight
  FROM active_override;

  RETURN QUERY SELECT
    p_user_id,
    ROUND(v_spam_score::NUMERIC, 4),
    ROUND(v_trust_weight::NUMERIC, 4),
    ROUND(v_bot_likelihood::NUMERIC, 4),
    v_is_coordinated,
    v_indicator_count,
    v_policy_name;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.compute_user_spam_score_v1 TO authenticated, service_role;
