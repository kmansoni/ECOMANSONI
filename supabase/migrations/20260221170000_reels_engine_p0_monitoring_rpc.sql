-- ============================================================================
-- REELS ENGINE P0 MONITORING (DB-only, service_role)
--
-- Provides minimal P0 monitoring without app code:
--  - ingestion activity in a time window
--  - request_id coverage (missing request_id rate)
--  - event-time lag (now - max(created_at))
--  - RBAC audit for reels_engine_* functions (ensure no EXECUTE for PUBLIC/anon/auth)
--
-- Security:
--  - service_role only
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Helpful index (best-effort)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reel_impressions_created_at
  ON public.reel_impressions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reel_impressions_request_id_created_at
  ON public.reel_impressions(created_at DESC)
  WHERE request_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Monitoring snapshot
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reels_engine_monitor_snapshot_v1(
  p_window_minutes INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_minutes INTEGER := GREATEST(1, LEAST(240, COALESCE(p_window_minutes, 10)));
  v_since TIMESTAMPTZ := now() - make_interval(mins => v_window_minutes);

  v_total BIGINT := 0;
  v_missing_request_id BIGINT := 0;
  v_max_created_at TIMESTAMPTZ := NULL;
  v_lag_seconds INTEGER := NULL;
BEGIN
  PERFORM public.reels_engine_require_service_role();

  SELECT COUNT(*)
    INTO v_total
  FROM public.reel_impressions i
  WHERE i.created_at >= v_since;

  SELECT COUNT(*)
    INTO v_missing_request_id
  FROM public.reel_impressions i
  WHERE i.created_at >= v_since
    AND i.request_id IS NULL;

  SELECT MAX(i.created_at)
    INTO v_max_created_at
  FROM public.reel_impressions i;

  IF v_max_created_at IS NOT NULL THEN
    v_lag_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - v_max_created_at)))::INTEGER);
  END IF;

  RETURN jsonb_build_object(
    'window_minutes', v_window_minutes,
    'since', to_jsonb(v_since),
    'impressions_total', v_total,
    'impressions_missing_request_id', v_missing_request_id,
    'missing_request_id_rate', CASE WHEN v_total > 0 THEN (v_missing_request_id::NUMERIC / v_total::NUMERIC) ELSE NULL END,
    'max_impression_created_at', to_jsonb(v_max_created_at),
    'event_time_lag_seconds', v_lag_seconds
  );
END;
$$;

ALTER FUNCTION public.reels_engine_monitor_snapshot_v1(INTEGER)
  SET search_path = public, pg_catalog;

-- ---------------------------------------------------------------------------
-- 3) RBAC audit for reels_engine_* functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reels_engine_rbac_audit_v1()
RETURNS TABLE (
  fn TEXT,
  args TEXT,
  owner TEXT,
  public_exec BOOLEAN,
  anon_exec BOOLEAN,
  authenticated_exec BOOLEAN,
  violation BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.proname::TEXT AS fn,
    pg_get_function_identity_arguments(p.oid)::TEXT AS args,
    pg_get_userbyid(p.proowner)::TEXT AS owner,
    has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec,
    (
      has_function_privilege('public', p.oid, 'EXECUTE')
      OR has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) AS violation
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname LIKE 'reels_engine_%'
  ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);
$$;

ALTER FUNCTION public.reels_engine_rbac_audit_v1()
  SET search_path = public, pg_catalog;

-- ---------------------------------------------------------------------------
-- 4) Grants (service_role only)
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.reels_engine_monitor_snapshot_v1(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_engine_rbac_audit_v1() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reels_engine_monitor_snapshot_v1(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_rbac_audit_v1() TO service_role;
