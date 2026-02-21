-- ============================================================================
-- REELS ENGINE: Apply-action writes Journal Contract v1.0 fields (P1)
--
-- - Fills snapshot-before fields on every journal write
-- - Adds reason_code + decision_source
-- - Adds manual override governance:
--   - requires reason length >= 10
--   - allowed only when suppression is currently active
--   - rate-limit 1 per 6h per segment
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reels_engine_apply_action(
  p_segment_key TEXT,
  p_action_type TEXT,
  p_idempotency_key TEXT,
  p_environment TEXT DEFAULT 'prod',
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_priority INTEGER DEFAULT 0,
  p_is_major BOOLEAN DEFAULT true,
  p_reason TEXT DEFAULT NULL
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
  v_status public.reels_engine_action_status := 'accepted';
  v_message TEXT := 'accepted';

  v_pipeline_suppressed BOOLEAN := false;
  v_is_allowed_during_suppression BOOLEAN := false;
  v_cfg UUID;

  v_until TIMESTAMPTZ;
  v_is_pipeline_op BOOLEAN := false;

  v_reason_code TEXT := NULL;
  v_decision_source TEXT := NULL;
  v_last_manual_override TIMESTAMPTZ;
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

  v_decision_source := NULLIF(COALESCE(p_payload->>'decision_source', ''), '');
  IF v_decision_source IS NULL THEN
    v_decision_source := CASE
      WHEN p_action_type = 'manual_clear_pipeline_suppression' THEN 'manual'
      ELSE 'das'
    END;
  END IF;

  v_is_pipeline_op := p_action_type IN (
    'set_pipeline_suppression',
    'clear_pipeline_suppression',
    'manual_clear_pipeline_suppression'
  );

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

  -- Read suppression + last_major_action_at.
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

  -- Allowlist during suppression (minimal):
  v_is_allowed_during_suppression := p_action_type IN (
    'set_pipeline_suppression',
    'clear_pipeline_suppression',
    'manual_clear_pipeline_suppression',
    'set_safety_overrides',
    'merge_safety_overrides'
  );

  IF v_pipeline_suppressed AND NOT v_is_allowed_during_suppression THEN
    v_status := 'suppressed';
    v_message := 'suppressed_by_pipeline_matrix';
    v_reason_code := 'pipeline_suppression_active';
  END IF;

  -- Manual override governance.
  IF v_status = 'accepted'
     AND p_action_type = 'manual_clear_pipeline_suppression'
  THEN
    IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
      v_status := 'rejected';
      v_message := 'reason_required';
      v_reason_code := 'reason_required';
    END IF;

    IF v_status = 'accepted' AND NOT v_pipeline_suppressed THEN
      v_status := 'rejected';
      v_message := 'not_suppressed';
      v_reason_code := 'not_suppressed';
    END IF;

    IF v_status = 'accepted' THEN
      SELECT max(j.executed_at)
        INTO v_last_manual_override
      FROM public.reels_engine_action_journal j
      WHERE j.environment = v_env
        AND j.segment_key = p_segment_key
        AND j.action_type = 'manual_clear_pipeline_suppression'
        AND j.status = 'executed'
        AND j.executed_at IS NOT NULL
        AND j.executed_at > (v_now - interval '6 hours');

      IF v_last_manual_override IS NOT NULL THEN
        v_status := 'rate_limited';
        v_message := 'manual_override_rate_limited';
        v_reason_code := 'manual_override_rate_limited';
      END IF;
    END IF;
  END IF;

  -- Clear governance: if already not suppressed, record a rejected/no-op decision.
  IF v_status = 'accepted'
     AND p_action_type = 'clear_pipeline_suppression'
     AND NOT v_pipeline_suppressed
  THEN
    v_status := 'rejected';
    v_message := 'not_suppressed';
    v_reason_code := 'not_suppressed';
  END IF;

  -- Hysteresis: automatic clear requires >= 10 minutes since suppression set.
  IF v_status = 'accepted'
     AND p_action_type = 'clear_pipeline_suppression'
     AND v_pipeline_suppressed
  THEN
    IF v_suppressed_at IS NULL THEN
      v_status := 'rejected';
      v_message := 'hysteresis_not_elapsed';
      v_reason_code := 'hysteresis_not_elapsed';
    ELSIF v_now < (v_suppressed_at + INTERVAL '10 minutes') THEN
      v_status := 'rejected';
      v_message := 'hysteresis_not_elapsed';
      v_reason_code := 'hysteresis_not_elapsed';
    END IF;
  END IF;

  -- One-major-action per segment window (6h), excluding pipeline ops.
  IF v_status = 'accepted'
     AND p_is_major
     AND NOT v_is_pipeline_op
     AND v_last_major IS NOT NULL
     AND v_last_major > (v_now - INTERVAL '6 hours')
  THEN
    v_status := 'rate_limited';
    v_message := 'major_action_rate_limited';
    v_reason_code := 'major_action_rate_limited';
  END IF;

  -- Executed reason codes (best-effort, deterministic).
  IF v_status = 'accepted' AND p_action_type = 'set_pipeline_suppression' THEN
    IF p_reason IS NOT NULL AND position('db_error' in p_reason) = 1 THEN
      v_reason_code := 'db_error';
    ELSIF p_reason IS NOT NULL AND position('lag_and_floor' in p_reason) = 1 THEN
      v_reason_code := 'lag_and_floor';
    ELSIF p_reason IS NOT NULL AND position('impressions_below_floor' in p_reason) = 1 THEN
      v_reason_code := 'floor_breached';
    END IF;
  END IF;

  -- Record journal row first.
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
    v_reason_code,
    v_decision_source,
    v_status,
    v_now,
    v_actor_user,
    v_actor_role,
    CASE WHEN v_status = 'suppressed' THEN 'pipeline_matrix' ELSE NULL END,
    v_cfg,
    v_pipeline_suppressed,
    v_suppressed_at,
    v_suppressed_until,
    v_suppression_reason,
    v_suppressed_until,
    v_suppression_reason
  )
  RETURNING id INTO v_existing_id;

  IF v_status = 'accepted' THEN
    -- Side effects by action type
    IF p_action_type = 'set_pipeline_suppression' THEN
      v_until := COALESCE(
        NULLIF((p_payload->>'suppressed_until')::TEXT, '')::timestamptz,
        v_now + interval '45 minutes'
      );

      UPDATE public.reels_engine_segment_state s
      SET
        suppression = jsonb_set(
          s.suppression,
          '{pipeline}',
          jsonb_build_object(
            'suppressed_until', to_jsonb(v_until),
            'suppressed_at', to_jsonb(v_now),
            'reason', COALESCE(p_reason, 'pipeline_degraded')
          ),
          true
        ),
        mode = 'incident',
        last_major_action_at = CASE WHEN p_is_major THEN v_now ELSE s.last_major_action_at END,
        last_action_id = v_existing_id,
        updated_at = v_now
      WHERE s.environment = v_env
        AND s.segment_key = p_segment_key;

    ELSIF p_action_type IN ('clear_pipeline_suppression', 'manual_clear_pipeline_suppression') THEN
      UPDATE public.reels_engine_segment_state s
      SET
        suppression = (s.suppression - 'pipeline'),
        mode = 'steady',
        last_major_action_at = CASE WHEN p_is_major THEN v_now ELSE s.last_major_action_at END,
        last_action_id = v_existing_id,
        updated_at = v_now
      WHERE s.environment = v_env
        AND s.segment_key = p_segment_key;

    ELSE
      UPDATE public.reels_engine_segment_state s
      SET
        active_overrides = CASE
          WHEN p_action_type = 'set_safety_overrides' THEN COALESCE(p_payload, '{}'::jsonb)
          WHEN p_action_type = 'merge_safety_overrides' THEN s.active_overrides || COALESCE(p_payload, '{}'::jsonb)
          ELSE s.active_overrides
        END,
        cooldown_until = CASE
          WHEN (p_payload ? 'cooldown_seconds')
            THEN v_now + make_interval(secs => GREATEST(0, (p_payload->>'cooldown_seconds')::INT))
          ELSE s.cooldown_until
        END,
        last_major_action_at = CASE WHEN p_is_major THEN v_now ELSE s.last_major_action_at END,
        last_action_id = v_existing_id,
        updated_at = v_now
      WHERE s.environment = v_env
        AND s.segment_key = p_segment_key;
    END IF;

    UPDATE public.reels_engine_action_journal j
    SET status = 'executed',
        executed_at = v_now,
        reason_code = COALESCE(j.reason_code, CASE
          WHEN j.action_type = 'clear_pipeline_suppression' THEN 'auto_clear'
          WHEN j.action_type = 'manual_clear_pipeline_suppression' THEN 'manual_override'
          ELSE NULL
        END)
    WHERE j.id = v_existing_id;

    v_status := 'executed';
    v_message := 'executed';
  END IF;

  RETURN QUERY
  SELECT v_existing_id, v_status, v_message;
END;
$$;

ALTER FUNCTION public.reels_engine_apply_action(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, BOOLEAN, TEXT)
  SET search_path = public, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.reels_engine_apply_action(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reels_engine_apply_action(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, BOOLEAN, TEXT) TO service_role;
