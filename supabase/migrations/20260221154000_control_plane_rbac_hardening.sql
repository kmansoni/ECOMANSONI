-- ============================================================================
-- CONTROL PLANE PATCH: RBAC hardening for reels_engine_* functions
--
-- Problem:
--  - In Postgres, EXECUTE on functions is granted to PUBLIC by default.
--  - Some control-plane functions are SECURITY DEFINER and/or mutate state
--    (e.g. clear_pipeline_suppression, apply_action). If PUBLIC can execute
--    them, any client could change control-plane state.
--
-- Fix:
--  - Revoke EXECUTE from PUBLIC, anon, authenticated for all reels_engine_* RPCs.
--  - Grant EXECUTE only to service_role.
-- ============================================================================

-- Ensure no client role can call control-plane functions
REVOKE EXECUTE ON FUNCTION public.reels_engine_require_service_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_engine_lock_segment(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_engine_get_pipeline_suppression(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_engine_clear_pipeline_suppression(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.reels_engine_get_active_config(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_engine_propose_config(JSONB, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_engine_activate_config(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_engine_set_pipeline_suppression(TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reels_engine_apply_action(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

-- Allow service role only
GRANT EXECUTE ON FUNCTION public.reels_engine_require_service_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_lock_segment(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_get_pipeline_suppression(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_clear_pipeline_suppression(TEXT, TEXT, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.reels_engine_get_active_config(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_propose_config(JSONB, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_activate_config(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_set_pipeline_suppression(TEXT, TEXT, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reels_engine_apply_action(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, BOOLEAN, TEXT) TO service_role;
