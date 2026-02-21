-- ============================================================================
-- CONTROL PLANE PATCH: audit completeness + default TTL + stronger lock key
--
-- Adds P0 hardening:
--  - action_journal captures: active config version + suppression snapshot
--  - set_pipeline_suppression uses a default TTL when suppressed_until is NULL
--  - lock key uses 64-bit hash (hashtextextended) to reduce collisions
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Journal fields: config version + suppression snapshot
-- ---------------------------------------------------------------------------
ALTER TABLE public.reels_engine_action_journal
  ADD COLUMN IF NOT EXISTS active_config_version_id UUID,
  ADD COLUMN IF NOT EXISTS pipeline_suppressed_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pipeline_suppression_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_reels_engine_action_journal_cfg
  ON public.reels_engine_action_journal(environment, active_config_version_id, decided_at DESC);

-- ---------------------------------------------------------------------------
-- 2) Stronger segment lock key (64-bit)
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
  -- 64-bit stable hash, lower collision risk than int4 hashtext.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Default suppression TTL (avoid "forever incident")
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
  v_until TIMESTAMPTZ := COALESCE(p_suppressed_until, v_now + interval '45 minutes');
BEGIN
  PERFORM public.reels_engine_require_service_role();
  IF p_segment_key IS NULL OR length(trim(p_segment_key)) = 0 THEN
    RAISE EXCEPTION 'segment_key is required';
  END IF;

  PERFORM public.reels_engine_lock_segment(v_env, p_segment_key);

  INSERT INTO public.reels_engine_segment_state(environment, segment_key, suppression, mode, updated_at)
  VALUES (
    v_env,
    p_segment_key,
    jsonb_build_object(
      'pipeline',
      jsonb_build_object(
        'suppressed_until', to_jsonb(v_until),
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
        'suppressed_until', to_jsonb(v_until),
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
-- 4) apply_action: store active config + suppression snapshot in journal
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
  v_suppression_reason TEXT;
  v_last_major TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
  v_env TEXT := COALESCE(p_environment, 'prod');
  v_actor_role TEXT := auth.role();
  v_actor_user UUID := auth.uid();
  v_status public.reels_engine_action_status := 'accepted';
  v_message TEXT := 'accepted';

  v_pipeline_suppressed BOOLEAN := false;
  v_is_suppression_allowed BOOLEAN := false;
  v_cfg UUID;
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

  -- Serialize per segment.
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
    NULLIF((suppression #>> '{pipeline,suppressed_until}')::TEXT, '')::timestamptz,
    NULLIF((suppression #>> '{pipeline,reason}')::TEXT, ''),
    last_major_action_at
  INTO v_suppressed_until, v_suppression_reason, v_last_major
  FROM public.reels_engine_segment_state
  WHERE environment = v_env
    AND segment_key = p_segment_key;

  v_pipeline_suppressed := (v_suppressed_until IS NOT NULL AND v_suppressed_until > v_now);

  -- Suppression matrix: allow only explicit safety overrides during pipeline suppression.
  v_is_suppression_allowed := p_action_type IN (
    'set_safety_overrides',
    'merge_safety_overrides'
  );

  IF v_pipeline_suppressed AND NOT v_is_suppression_allowed THEN
    v_status := 'suppressed';
    v_message := 'suppressed_by_pipeline_matrix';
  END IF;

  -- One-major-action per segment window (6h).
  IF v_status = 'accepted' AND p_is_major AND v_last_major IS NOT NULL AND v_last_major > (v_now - INTERVAL '6 hours') THEN
    v_status := 'rate_limited';
    v_message := 'one_major_action_window';
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
    status,
    decided_at,
    actor_user_id,
    actor_role,
    suppression_reason,
    active_config_version_id,
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
    v_status,
    v_now,
    v_actor_user,
    v_actor_role,
    CASE WHEN v_status = 'suppressed' THEN 'pipeline_matrix' ELSE NULL END,
    v_cfg,
    v_suppressed_until,
    v_suppression_reason
  )
  RETURNING id INTO v_existing_id;

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
