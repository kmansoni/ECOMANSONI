-- Fix: record_spam_indicator_v1 ambiguous indicator_id reference
-- Reason: plpgsql OUT param "indicator_id" conflicts with table column reference

CREATE OR REPLACE FUNCTION public.record_spam_indicator_v1(
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
  INSERT INTO public.spam_indicators (
    user_id,
    indicator_type,
    severity,
    confidence,
    evidence,
    source,
    source_user_id
  ) VALUES (
    p_user_id,
    p_indicator_type,
    p_severity,
    p_confidence,
    p_evidence,
    p_source,
    p_source_user_id
  )
  RETURNING public.spam_indicators.indicator_id
  INTO v_indicator_id;

  SELECT s.spam_score, s.trust_weight
  INTO v_spam_score, v_trust_weight
  FROM public.compute_user_spam_score_v1(p_user_id) s;

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

GRANT EXECUTE ON FUNCTION public.record_spam_indicator_v1 TO service_role;
