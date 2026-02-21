-- ============================================================================
-- CONTROL PLANE PATCH: Suppression matrix + central serialization
--
-- Goals (P0):
--  1) If pipeline is degraded (suppression active) => forbid auto-actions
--     (quota/diversity/trust tuning).
--  2) Allow only:
--       - set_pipeline_suppression
--       - clear_pipeline_suppression
--       - safety overrides (explicit action types)
--  3) Ensure central serialization for segment mutations (advisory xact lock)
--     so multiple DAS instances cannot race.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Helper: advisory lock per (environment, segment_key)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reels_engine_lock_segment(
  p_environment TEXT,
  p_segment_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_key TEXT := COALESCE(p_environment, 'prod') || ':' || COALESCE(p_segment_key, '');
BEGIN
  -- Transaction-scoped lock.
  PERFORM pg_advisory_xact_lock(hashtext(v_key));
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Helper: pipeline suppression status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reels_engine_get_pipeline_suppression(
  p_environment TEXT,
  p_segment_key TEXT
)
RETURNS TABLE (
  suppressed_until TIMESTAMPTZ,
  reason TEXT,
  is_suppressed BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    NULLIF((s.suppression #>> '{pipeline,suppressed_until}')::TEXT, '')::timestamptz AS suppressed_until,
    NULLIF((s.suppression #>> '{pipeline,reason}')::TEXT, '') AS reason,
    (
      NULLIF((s.suppression #>> '{pipeline,suppressed_until}')::TEXT, '')::timestamptz IS NOT NULL
      AND NULLIF((s.suppression #>> '{pipeline,suppressed_until}')::TEXT, '')::timestamptz > now()
    ) AS is_suppressed
  FROM public.reels_engine_segment_state s
  WHERE s.environment = COALESCE(p_environment, 'prod')
    AND s.segment_key = p_segment_key
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 3) set_pipeline_suppression: also enter incident mode
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reels_engine_set_pipeline_suppression(
  p_environment TEXT,
  p_segment_key TEXT,
  p_suppressed_until TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_env TEXT := COALESCE(p_environment, 'prod');
  v_now TIMESTAMPTZ := now();
BEGIN
  PERFORM public.reels_engine_require_service_role();
  IF p_segment_key IS NULL OR length(trim(p_segment_key)) = 0 THEN
    RAISE EXCEPTION 'segment_key is required';
  END IF;

  -- Serialize per segment.
  PERFORM public.reels_engine_lock_segment(v_env, p_segment_key);

  INSERT INTO public.reels_engine_segment_state(environment, segment_key, suppression, mode, updated_at)
  VALUES (
    v_env,
    p_segment_key,
    jsonb_build_object(
      'pipeline',
      jsonb_build_object(
        'suppressed_until', to_jsonb(p_suppressed_until),
        'reason', COALESCE(p_reason, 'pipeline_degraded')
      )
    ),
    'incident',
    v_now
  )
  ON CONFLICT (environment, segment_key)
  DO UPDATE SET
    suppression = jsonb_set(
      public.reels_engine_segment_state.suppression,
      '{pipeline}',
      jsonb_build_object(
        'suppressed_until', to_jsonb(p_suppressed_until),
        'reason', COALESCE(p_reason, 'pipeline_degraded')
      ),
      true
    ),
    mode = 'incident',
    updated_at = v_now;
END;
$$;

ALTER FUNCTION public.reels_engine_set_pipeline_suppression(TEXT, TEXT, TIMESTAMPTZ, TEXT)
  SET search_path = public, pg_catalog;

-- ---------------------------------------------------------------------------
-- 4) clear_pipeline_suppression: exit incident mode
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reels_engine_clear_pipeline_suppression(
  p_environment TEXT,
  p_segment_key TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_env TEXT := COALESCE(p_environment, 'prod');
  v_now TIMESTAMPTZ := now();
BEGIN
  PERFORM public.reels_engine_require_service_role();
  IF p_segment_key IS NULL OR length(trim(p_segment_key)) = 0 THEN
    RAISE EXCEPTION 'segment_key is required';
  END IF;

  -- Serialize per segment.
  PERFORM public.reels_engine_lock_segment(v_env, p_segment_key);

  INSERT INTO public.reels_engine_segment_state(environment, segment_key)
  VALUES (v_env, p_segment_key)
  ON CONFLICT (environment, segment_key)
  DO NOTHING;

  UPDATE public.reels_engine_segment_state
  SET
    suppression = (public.reels_engine_segment_state.suppression - 'pipeline'),
    mode = 'steady',
    updated_at = v_now
  WHERE environment = v_env
    AND segment_key = p_segment_key;

  -- Optional: journal this as an action (best-effort, but keep it simple here)
  -- (DAS should call reels_engine_apply_action with an idempotency key if it
  --  needs strict idempotent journaling.)
END;
$$;

ALTER FUNCTION public.reels_engine_clear_pipeline_suppression(TEXT, TEXT, TEXT)
  SET search_path = public, pg_catalog;

-- ---------------------------------------------------------------------------
-- 5) Apply-action: suppression matrix + serialization
-- ---------------------------------------------------------------------------
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
  v_last_major TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
  v_env TEXT := COALESCE(p_environment, 'prod');
  v_actor_role TEXT := auth.role();
  v_actor_user UUID := auth.uid();
  v_status public.reels_engine_action_status := 'accepted';
  v_message TEXT := 'accepted';

  v_pipeline_suppressed BOOLEAN := false;
  v_is_suppression_allowed BOOLEAN := false;
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

  -- Central serialization per segment.
  PERFORM public.reels_engine_lock_segment(v_env, p_segment_key);

  -- Idempotency: if already seen, return existing decision.
  SELECT id, status
    INTO v_existing_id, v_existing_status
  FROM public.reels_engine_action_journal
  WHERE environment = v_env
    AND idempotency_key = p_idempotency_key;

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

  -- Read suppression + last_major_action_at.
  SELECT
    NULLIF((suppression #>> '{pipeline,suppressed_until}')::TEXT, '')::timestamptz,
    last_major_action_at
  INTO v_suppressed_until, v_last_major
  FROM public.reels_engine_segment_state
  WHERE environment = v_env
    AND segment_key = p_segment_key;

  v_pipeline_suppressed := (v_suppressed_until IS NOT NULL AND v_suppressed_until > v_now);

  -- Suppression matrix:
  -- If pipeline suppressed => forbid auto-actions (quota/diversity/trust tuning).
  -- Allow only explicit safety override action types.
  v_is_suppression_allowed := p_action_type IN (
    'set_safety_overrides',
    'merge_safety_overrides'
  );

  IF v_pipeline_suppressed AND NOT v_is_suppression_allowed THEN
    v_status := 'suppressed';
    v_message := 'suppressed_by_pipeline_matrix';
  END IF;

  -- One-major-action per segment window (6h) to prevent cascades.
  -- (Still applies for safety overrides; if you want a separate budget, do it in DAS.)
  IF v_status = 'accepted' AND p_is_major AND v_last_major IS NOT NULL AND v_last_major > (v_now - INTERVAL '6 hours') THEN
    v_status := 'rate_limited';
    v_message := 'one_major_action_window';
  END IF;

  -- Record journal row first (source of truth).
  INSERT INTO public.reels_engine_action_journal(
    environment,
    segment_key,
    action_type,
    priority,
    is_major,
    idempotency_key,
    payload,
    reason,
    status,
    decided_at,
    actor_user_id,
    actor_role,
    suppression_reason
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
    v_status,
    v_now,
    v_actor_user,
    v_actor_role,
    CASE WHEN v_status = 'suppressed' THEN 'pipeline_matrix' ELSE NULL END
  )
  RETURNING id INTO v_existing_id;

  -- Apply side effects only if accepted.
  IF v_status = 'accepted' THEN
    UPDATE public.reels_engine_segment_state
    SET
      active_overrides = CASE
        WHEN p_action_type = 'set_safety_overrides'
          THEN COALESCE(p_payload, '{}'::jsonb)
        WHEN p_action_type = 'merge_safety_overrides'
          THEN public.reels_engine_segment_state.active_overrides || COALESCE(p_payload, '{}'::jsonb)
        ELSE active_overrides
      END,
      cooldown_until = CASE
        WHEN (p_payload ? 'cooldown_seconds')
          THEN v_now + make_interval(secs => GREATEST(0, (p_payload->>'cooldown_seconds')::INT))
        ELSE cooldown_until
      END,
      last_major_action_at = CASE WHEN p_is_major THEN v_now ELSE last_major_action_at END,
      last_action_id = v_existing_id,
      updated_at = v_now
    WHERE environment = v_env
      AND segment_key = p_segment_key;

    UPDATE public.reels_engine_action_journal
    SET status = 'executed',
        executed_at = v_now
    WHERE id = v_existing_id;

    v_status := 'executed';
    v_message := 'executed';
  END IF;

  RETURN QUERY
  SELECT v_existing_id, v_status, v_message;
END;
$$;

ALTER FUNCTION public.reels_engine_apply_action(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, BOOLEAN, TEXT)
  SET search_path = public, pg_catalog;

-- ---------------------------------------------------------------------------
-- 6) Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.reels_engine_lock_segment(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_get_pipeline_suppression(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_clear_pipeline_suppression(TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.reels_engine_apply_action(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, BOOLEAN, TEXT) IS
  'Control plane core primitive: idempotent action journal + suppression matrix + segment serialization.';
