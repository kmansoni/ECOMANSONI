-- ============================================================================
-- REELS ENGINE: record decision/no-op into journal (P1)
--
-- Writes a journal row with full snapshot-before, idempotent by idempotency_key,
-- without any side effects on segment state.
--
-- Intended for DAS to log:
--  - rejected/conditions_not_met
--  - rejected/lag_not_green
--  - rejected/green_streak_not_met
--  - etc.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reels_engine_record_decision_v1(
  p_segment_key TEXT,
  p_action_type TEXT,
  p_idempotency_key TEXT,
  p_status public.reels_engine_action_status DEFAULT 'rejected',
  p_reason_code TEXT DEFAULT NULL,
  p_environment TEXT DEFAULT 'prod',
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_priority INTEGER DEFAULT 0,
  p_is_major BOOLEAN DEFAULT false,
  p_reason TEXT DEFAULT NULL,
  p_decision_source TEXT DEFAULT 'das'
)
RETURNS TABLE (
  action_id UUID,
  status public.reels_engine_action_status,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_id UUID;
  v_existing_status public.reels_engine_action_status;

  v_suppressed_until TIMESTAMPTZ;
  v_suppressed_at TIMESTAMPTZ;
  v_suppression_reason TEXT;
  v_last_major TIMESTAMPTZ;

  v_now TIMESTAMPTZ := now();
  v_env TEXT := COALESCE(p_environment, 'prod');
  v_actor_role TEXT := auth.role();
  v_actor_user UUID := auth.uid();

  v_cfg UUID;
  v_pipeline_suppressed BOOLEAN := false;
  v_message TEXT := 'recorded';
BEGIN
  PERFORM public.reels_engine_require_service_role();

  IF p_segment_key IS NULL OR length(trim(p_segment_key)) = 0 THEN
    RAISE EXCEPTION 'segment_key is required';
  END IF;

  IF p_action_type IS NULL OR length(trim(p_action_type)) = 0 THEN
    RAISE EXCEPTION 'action_type is required';
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;

  IF p_status IS NULL OR p_status = 'accepted' THEN
    RAISE EXCEPTION 'status must be one of executed/rejected/suppressed/rate_limited';
  END IF;

  IF p_status <> 'executed' AND (p_reason_code IS NULL OR length(trim(p_reason_code)) = 0) THEN
    RAISE EXCEPTION 'reason_code is required when status != executed';
  END IF;

  -- Serialize per segment.
  PERFORM public.reels_engine_lock_segment(v_env, p_segment_key);

  -- Idempotency: if already seen, return existing decision.
  SELECT j.id, j.status
    INTO v_existing_id, v_existing_status
  FROM public.reels_engine_action_journal j
  WHERE j.environment = v_env
    AND j.idempotency_key = p_idempotency_key;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY
    SELECT v_existing_id, v_existing_status, 'idempotent_replay'::TEXT;
    RETURN;
  END IF;

  -- Ensure segment row exists.
  INSERT INTO public.reels_engine_segment_state(environment, segment_key)
  VALUES (v_env, p_segment_key)
  ON CONFLICT (environment, segment_key)
  DO NOTHING;

  -- Active config snapshot for audit.
  SELECT c.id
    INTO v_cfg
  FROM public.reels_engine_config_versions c
  WHERE c.environment = v_env
    AND c.is_active = true
  ORDER BY c.activated_at DESC NULLS LAST
  LIMIT 1;

  -- Read suppression snapshot (before decision).
  SELECT
    NULLIF((s.suppression #>> '{pipeline,suppressed_until}')::TEXT, '')::timestamptz,
    NULLIF((s.suppression #>> '{pipeline,suppressed_at}')::TEXT, '')::timestamptz,
    NULLIF((s.suppression #>> '{pipeline,reason}')::TEXT, ''),
    s.last_major_action_at
  INTO v_suppressed_until, v_suppressed_at, v_suppression_reason, v_last_major
  FROM public.reels_engine_segment_state s
  WHERE s.environment = v_env
    AND s.segment_key = p_segment_key;

  v_pipeline_suppressed := (v_suppressed_until IS NOT NULL AND v_suppressed_until > v_now);

  INSERT INTO public.reels_engine_action_journal(
    environment,
    segment_key,
    action_type,
    priority,
    is_major,
    idempotency_key,
    payload,
    reason,
    reason_code,
    decision_source,
    status,
    decided_at,
    actor_user_id,
    actor_role,
    suppression_reason,
    active_config_version_id,
    pipeline_is_suppressed_before,
    pipeline_suppressed_at_before,
    pipeline_suppressed_until_before,
    pipeline_suppression_reason_before,
    pipeline_suppressed_until,
    pipeline_suppression_reason
  )
  VALUES (
    v_env,
    p_segment_key,
    p_action_type,
    p_priority,
    p_is_major,
    p_idempotency_key,
    COALESCE(p_payload, '{}'::jsonb),
    p_reason,
    p_reason_code,
    NULLIF(COALESCE(p_decision_source, ''), ''),
    p_status,
    v_now,
    v_actor_user,
    v_actor_role,
    CASE WHEN p_status = 'suppressed' THEN 'pipeline_matrix' ELSE NULL END,
    v_cfg,
    v_pipeline_suppressed,
    v_suppressed_at,
    v_suppressed_until,
    v_suppression_reason,
    v_suppressed_until,
    v_suppression_reason
  )
  RETURNING id INTO v_existing_id;

  RETURN QUERY
  SELECT v_existing_id, p_status, v_message;
END;
$$;

ALTER FUNCTION public.reels_engine_record_decision_v1(TEXT, TEXT, TEXT, public.reels_engine_action_status, TEXT, TEXT, JSONB, INTEGER, BOOLEAN, TEXT, TEXT)
  SET search_path = public, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.reels_engine_record_decision_v1(TEXT, TEXT, TEXT, public.reels_engine_action_status, TEXT, TEXT, JSONB, INTEGER, BOOLEAN, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reels_engine_record_decision_v1(TEXT, TEXT, TEXT, public.reels_engine_action_status, TEXT, TEXT, JSONB, INTEGER, BOOLEAN, TEXT, TEXT)
  TO service_role;
