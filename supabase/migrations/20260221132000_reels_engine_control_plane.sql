-- ============================================================================
-- REELS ENGINE 4.x CONTROL PLANE (DB FOUNDATION)
-- Purpose:
--   - Config versioning + activation (immutable snapshots)
--   - Segment state journal (mode, suppression, overrides, cooldowns)
--   - Idempotent action journal + rate limiting (one-major-action/window)
--   - RPC surface for a future Decision/Action Arbiter Service (DAS)
-- Security model:
--   - Service-role only (functions check auth.role() = 'service_role')
--   - RLS enabled; no direct client writes
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Types
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reels_engine_mode') THEN
    CREATE TYPE public.reels_engine_mode AS ENUM ('steady', 'incident');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reels_engine_action_status') THEN
    CREATE TYPE public.reels_engine_action_status AS ENUM (
      'accepted',
      'executed',
      'suppressed',
      'rate_limited',
      'rejected',
      'failed'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Config snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reels_engine_config_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL DEFAULT 'prod',
  parent_id UUID REFERENCES public.reels_engine_config_versions(id) ON DELETE SET NULL,

  description TEXT,
  config JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  is_active BOOLEAN NOT NULL DEFAULT false,
  activated_at TIMESTAMPTZ,
  activated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reels_engine_config_versions_env_time
  ON public.reels_engine_config_versions(environment, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_reels_engine_config_versions_active
  ON public.reels_engine_config_versions(environment)
  WHERE is_active = true;

ALTER TABLE public.reels_engine_config_versions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "service_role_full_access_config_versions"
      ON public.reels_engine_config_versions
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Per-segment state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reels_engine_segment_state (
  environment TEXT NOT NULL DEFAULT 'prod',
  segment_key TEXT NOT NULL,

  mode public.reels_engine_mode NOT NULL DEFAULT 'steady',

  -- Suppression flags are operational (e.g. pipeline degraded)
  -- Example:
  -- {
  --   "pipeline": {"suppressed_until": "2026-02-21T12:00:00Z", "reason": "ingestion_lag"}
  -- }
  suppression JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Active overrides (caps, floors, toggles). Kept as JSONB for flexibility.
  active_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,

  cooldown_until TIMESTAMPTZ,
  last_major_action_at TIMESTAMPTZ,
  last_action_id UUID,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (environment, segment_key)
);

CREATE INDEX IF NOT EXISTS idx_reels_engine_segment_state_env_mode
  ON public.reels_engine_segment_state(environment, mode);

CREATE INDEX IF NOT EXISTS idx_reels_engine_segment_state_updated
  ON public.reels_engine_segment_state(environment, updated_at DESC);

ALTER TABLE public.reels_engine_segment_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "service_role_full_access_segment_state"
      ON public.reels_engine_segment_state
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Action journal (idempotent)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reels_engine_action_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL DEFAULT 'prod',
  segment_key TEXT NOT NULL,

  action_type TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  is_major BOOLEAN NOT NULL DEFAULT true,

  idempotency_key TEXT NOT NULL,

  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,

  status public.reels_engine_action_status NOT NULL DEFAULT 'accepted',
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ,

  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT,

  suppression_reason TEXT,
  error TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_reels_engine_action_journal_idempotency
  ON public.reels_engine_action_journal(environment, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_reels_engine_action_journal_env_time
  ON public.reels_engine_action_journal(environment, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_reels_engine_action_journal_segment_time
  ON public.reels_engine_action_journal(environment, segment_key, decided_at DESC);

ALTER TABLE public.reels_engine_action_journal ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "service_role_full_access_action_journal"
      ON public.reels_engine_action_journal
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Helper: service-role check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reels_engine_require_service_role()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'reels_engine control-plane functions require service_role';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Config RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reels_engine_get_active_config(
  p_environment TEXT DEFAULT 'prod'
)
RETURNS TABLE (
  version_id UUID,
  activated_at TIMESTAMPTZ,
  config JSONB,
  description TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT c.id, c.activated_at, c.config, c.description
  FROM public.reels_engine_config_versions c
  WHERE c.environment = p_environment
    AND c.is_active = true
  ORDER BY c.activated_at DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.reels_engine_propose_config(
  p_config JSONB,
  p_environment TEXT DEFAULT 'prod',
  p_description TEXT DEFAULT NULL,
  p_parent_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM public.reels_engine_require_service_role();

  INSERT INTO public.reels_engine_config_versions(
    environment,
    parent_id,
    description,
    config,
    created_by
  )
  VALUES (
    p_environment,
    p_parent_id,
    p_description,
    COALESCE(p_config, '{}'::jsonb),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

ALTER FUNCTION public.reels_engine_propose_config(JSONB, TEXT, TEXT, UUID)
  SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION public.reels_engine_activate_config(
  p_version_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_env TEXT;
BEGIN
  PERFORM public.reels_engine_require_service_role();

  SELECT environment INTO v_env
  FROM public.reels_engine_config_versions
  WHERE id = p_version_id;

  IF v_env IS NULL THEN
    RAISE EXCEPTION 'Unknown config version: %', p_version_id;
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

-- ---------------------------------------------------------------------------
-- 6) Suppression RPC (pipeline supremacy)
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
BEGIN
  PERFORM public.reels_engine_require_service_role();

  INSERT INTO public.reels_engine_segment_state(environment, segment_key, suppression, updated_at)
  VALUES (
    COALESCE(p_environment, 'prod'),
    p_segment_key,
    jsonb_build_object(
      'pipeline',
      jsonb_build_object(
        'suppressed_until', to_jsonb(p_suppressed_until),
        'reason', COALESCE(p_reason, 'pipeline_degraded')
      )
    ),
    now()
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
    updated_at = now();
END;
$$;

ALTER FUNCTION public.reels_engine_set_pipeline_suppression(TEXT, TEXT, TIMESTAMPTZ, TEXT)
  SET search_path = public, pg_catalog;

-- ---------------------------------------------------------------------------
-- 7) Idempotent action apply (core primitive for DAS)
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

  -- Pipeline supremacy: suppressed window blocks most actions.
  IF v_suppressed_until IS NOT NULL AND v_suppressed_until > v_now THEN
    v_status := 'suppressed';
    v_message := 'suppressed_by_pipeline';
  END IF;

  -- One-major-action per segment window (6h) to prevent cascades.
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
    CASE WHEN v_status = 'suppressed' THEN 'pipeline' ELSE NULL END
  )
  RETURNING id INTO v_existing_id;

  -- Apply side effects only if accepted.
  IF v_status = 'accepted' THEN
    -- Update segment state: mode + overrides.
    UPDATE public.reels_engine_segment_state
    SET
      mode = CASE
        WHEN p_action_type = 'enter_incident_mode' THEN 'incident'
        WHEN p_action_type = 'exit_incident_mode' THEN 'steady'
        ELSE mode
      END,
      active_overrides = CASE
        WHEN p_action_type IN ('set_overrides', 'merge_overrides')
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
-- 8) Grants (service_role only)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.reels_engine_config_versions FROM anon, authenticated;
REVOKE ALL ON TABLE public.reels_engine_segment_state FROM anon, authenticated;
REVOKE ALL ON TABLE public.reels_engine_action_journal FROM anon, authenticated;

GRANT SELECT ON TABLE public.reels_engine_config_versions TO service_role;
GRANT SELECT ON TABLE public.reels_engine_segment_state TO service_role;
GRANT SELECT ON TABLE public.reels_engine_action_journal TO service_role;

GRANT EXECUTE ON FUNCTION public.reels_engine_get_active_config(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_propose_config(JSONB, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_activate_config(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_set_pipeline_suppression(TEXT, TEXT, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_apply_action(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, BOOLEAN, TEXT) TO service_role;

COMMENT ON TABLE public.reels_engine_config_versions IS
  'Reels Engine control plane: immutable config snapshots + activation.';

COMMENT ON TABLE public.reels_engine_segment_state IS
  'Reels Engine control plane: per-segment operational state (mode/suppression/overrides/cooldowns).';

COMMENT ON TABLE public.reels_engine_action_journal IS
  'Reels Engine control plane: idempotent action journal for arbitration and audit.';
