-- ============================================================================
-- REELS ENGINE P0 EXTENSIONS (2026-02-21)
--
-- Implements approved P0 contract:
--  - Hysteresis: automatic clear requires >= 10 minutes since suppression set
--  - Manual override (Option A): action_type='manual_clear_pipeline_suppression'
--  - Config validation RPC + activation gate (no force bypass)
--  - Return suppressed_at in get_pipeline_suppression for observability
--
-- Notes:
--  - All control-plane functions remain service_role only (enforced via
--    reels_engine_require_service_role + explicit EXECUTE grants).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Backfill: add pipeline.suppressed_at to existing rows (best-effort)
-- ---------------------------------------------------------------------------
UPDATE public.reels_engine_segment_state
SET suppression = jsonb_set(
  suppression,
  '{pipeline,suppressed_at}',
  to_jsonb(now()),
  true
)
WHERE (suppression ? 'pipeline')
  AND NULLIF((suppression #>> '{pipeline,suppressed_at}')::TEXT, '') IS NULL;

-- ---------------------------------------------------------------------------
-- 1) Extend pipeline suppression status RPC (v2)
-- ---------------------------------------------------------------------------
-- NOTE: Postgres does not allow CREATE OR REPLACE to change the OUT/RETURNS TABLE
-- shape of an existing function. To stay backward-compatible and avoid DROP
-- (and potential CASCADE), we introduce a v2 function.

CREATE OR REPLACE FUNCTION public.reels_engine_get_pipeline_suppression_v2(
  p_environment TEXT,
  p_segment_key TEXT
)
RETURNS TABLE (
  suppressed_until TIMESTAMPTZ,
  suppressed_at TIMESTAMPTZ,
  reason TEXT,
  is_suppressed BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    NULLIF((s.suppression #>> '{pipeline,suppressed_until}')::TEXT, '')::timestamptz AS suppressed_until,
    NULLIF((s.suppression #>> '{pipeline,suppressed_at}')::TEXT, '')::timestamptz AS suppressed_at,
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

ALTER FUNCTION public.reels_engine_get_pipeline_suppression_v2(TEXT, TEXT)
  SET search_path = public, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.reels_engine_get_pipeline_suppression_v2(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reels_engine_get_pipeline_suppression_v2(TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Config validation RPC + activation gate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reels_engine_validate_config_v1(
  p_config JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_errors JSONB := '[]'::jsonb;
  v_warnings JSONB := '[]'::jsonb;
  v_schema_version NUMERIC;
BEGIN
  PERFORM public.reels_engine_require_service_role();

  IF p_config IS NULL THEN
    v_errors := v_errors || jsonb_build_array('config is required');
    RETURN jsonb_build_object('valid', false, 'errors', v_errors, 'warnings', v_warnings);
  END IF;

  IF jsonb_typeof(p_config) IS DISTINCT FROM 'object' THEN
    v_errors := v_errors || jsonb_build_array('config must be a JSON object');
    RETURN jsonb_build_object('valid', false, 'errors', v_errors, 'warnings', v_warnings);
  END IF;

  -- Optional: schema_version sanity if present.
  IF p_config ? 'schema_version' THEN
    IF jsonb_typeof(p_config->'schema_version') IS DISTINCT FROM 'number' THEN
      v_errors := v_errors || jsonb_build_array('schema_version must be a number');
    ELSE
      v_schema_version := (p_config->>'schema_version')::NUMERIC;
      IF v_schema_version < 1 THEN
        v_errors := v_errors || jsonb_build_array('schema_version must be >= 1');
      END IF;
    END IF;
  ELSE
    v_warnings := v_warnings || jsonb_build_array('schema_version is missing (recommended)');
  END IF;

  RETURN jsonb_build_object(
    'valid', (jsonb_array_length(v_errors) = 0),
    'errors', v_errors,
    'warnings', v_warnings
  );
END;
$$;

ALTER FUNCTION public.reels_engine_validate_config_v1(JSONB)
  SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION public.reels_engine_validate_config_version_v1(
  p_version_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config JSONB;
BEGIN
  PERFORM public.reels_engine_require_service_role();

  SELECT c.config
    INTO v_config
  FROM public.reels_engine_config_versions c
  WHERE c.id = p_version_id;

  IF v_config IS NULL THEN
    RAISE EXCEPTION 'Unknown config version: %', p_version_id;
  END IF;

  RETURN public.reels_engine_validate_config_v1(v_config);
END;
$$;

ALTER FUNCTION public.reels_engine_validate_config_version_v1(UUID)
  SET search_path = public, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.reels_engine_validate_config_v1(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_engine_validate_config_version_v1(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reels_engine_validate_config_v1(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_validate_config_version_v1(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.reels_engine_activate_config(
  p_version_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_env TEXT;
  v_validation JSONB;
BEGIN
  PERFORM public.reels_engine_require_service_role();

  SELECT environment INTO v_env
  FROM public.reels_engine_config_versions
  WHERE id = p_version_id;

  IF v_env IS NULL THEN
    RAISE EXCEPTION 'Unknown config version: %', p_version_id;
  END IF;

  v_validation := public.reels_engine_validate_config_version_v1(p_version_id);
  IF COALESCE((v_validation->>'valid')::BOOLEAN, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Config validation failed: %', v_validation::TEXT;
  END IF;

  UPDATE public.reels_engine_config_versions
  SET is_active = false
  WHERE environment = v_env
    AND is_active = true;

  UPDATE public.reels_engine_config_versions
  SET is_active = true,
      activated_at = now(),
      activated_by = auth.uid()
  WHERE id = p_version_id;
END;
$$;

ALTER FUNCTION public.reels_engine_activate_config(UUID)
  SET search_path = public, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.reels_engine_activate_config(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reels_engine_activate_config(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Apply-action: manual clear + hysteresis gate
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

  v_is_pipeline_op := p_action_type IN (
    'set_pipeline_suppression',
    'clear_pipeline_suppression',
    'manual_clear_pipeline_suppression'
  );

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
    NULLIF((suppression #>> '{pipeline,suppressed_at}')::TEXT, '')::timestamptz,
    NULLIF((suppression #>> '{pipeline,reason}')::TEXT, ''),
    last_major_action_at
  INTO v_suppressed_until, v_suppressed_at, v_suppression_reason, v_last_major
  FROM public.reels_engine_segment_state
  WHERE environment = v_env
    AND segment_key = p_segment_key;

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
  END IF;

  -- Hysteresis: automatic clear requires >= 10 minutes since suppression set.
  IF v_status = 'accepted'
     AND p_action_type = 'clear_pipeline_suppression'
     AND v_pipeline_suppressed
  THEN
    IF v_suppressed_at IS NULL THEN
      v_status := 'rejected';
      v_message := 'clear_requires_suppressed_at';
    ELSIF v_now < (v_suppressed_at + INTERVAL '10 minutes') THEN
      v_status := 'rejected';
      v_message := 'hysteresis_not_elapsed';
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
    -- Side effects by action type
    IF p_action_type = 'set_pipeline_suppression' THEN
      v_until := COALESCE(
        NULLIF((p_payload->>'suppressed_until')::TEXT, '')::timestamptz,
        v_now + interval '45 minutes'
      );

      UPDATE public.reels_engine_segment_state
      SET
        suppression = jsonb_set(
          public.reels_engine_segment_state.suppression,
          '{pipeline}',
          jsonb_build_object(
            'suppressed_until', to_jsonb(v_until),
            'suppressed_at', to_jsonb(v_now),
            'reason', COALESCE(p_reason, 'pipeline_degraded')
          ),
          true
        ),
        mode = 'incident',
        last_major_action_at = CASE WHEN p_is_major THEN v_now ELSE last_major_action_at END,
        last_action_id = v_existing_id,
        updated_at = v_now
      WHERE environment = v_env
        AND segment_key = p_segment_key;

    ELSIF p_action_type IN ('clear_pipeline_suppression', 'manual_clear_pipeline_suppression') THEN
      UPDATE public.reels_engine_segment_state
      SET
        suppression = (public.reels_engine_segment_state.suppression - 'pipeline'),
        mode = 'steady',
        last_major_action_at = CASE WHEN p_is_major THEN v_now ELSE last_major_action_at END,
        last_action_id = v_existing_id,
        updated_at = v_now
      WHERE environment = v_env
        AND segment_key = p_segment_key;

    ELSE
      -- safety overrides only
      UPDATE public.reels_engine_segment_state
      SET
        active_overrides = CASE
          WHEN p_action_type = 'set_safety_overrides' THEN COALESCE(p_payload, '{}'::jsonb)
          WHEN p_action_type = 'merge_safety_overrides' THEN public.reels_engine_segment_state.active_overrides || COALESCE(p_payload, '{}'::jsonb)
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
    END IF;

    UPDATE public.reels_engine_action_journal j
    SET j.status = 'executed',
        j.executed_at = v_now
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
