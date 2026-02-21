-- ============================================================================
-- REELS ENGINE: Activate Config with Validation Gate (P1.2)
--
-- Updates reels_engine_activate_config to validate config before activation.
-- If validation has errors, activation is rejected with exception.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reels_engine_activate_config_v1(
  p_version_id UUID,
  p_segment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_config JSONB;
  v_validation JSONB;
  v_has_errors BOOLEAN;
  v_error_count INTEGER;
BEGIN
  -- Get config from version.
  SELECT c.config INTO v_config
  FROM public.reels_engine_config_versions c
  WHERE c.id = p_version_id;

  IF v_config IS NULL THEN
    RAISE EXCEPTION 'Config version % not found', p_version_id;
  END IF;

  -- Validate before activation (gate enforcement).
  v_validation := public.reels_engine_validate_config_v1(v_config);
  v_has_errors := (v_validation->>'valid')::BOOLEAN IS DISTINCT FROM TRUE;
  v_error_count := jsonb_array_length(v_validation->'errors');

  IF v_has_errors THEN
    RAISE EXCEPTION 'Config validation failed with % error(s): %', 
      v_error_count, 
      v_validation->'errors'::TEXT;
  END IF;

  -- Update segment activation.
  UPDATE public.reels_engine_segment_config
  SET 
    active_config_version_id = p_version_id,
    activated_at = now(),
    updated_at = now()
  WHERE segment_id = p_segment_id;

  -- Return validation result + activation confirmation.
  RETURN jsonb_build_object(
    'valid', TRUE,
    'activated', TRUE,
    'version_id', p_version_id,
    'segment_id', p_segment_id,
    'activated_at', now(),
    'validation', v_validation
  );
END;
$$;

ALTER FUNCTION public.reels_engine_activate_config_v1(UUID, UUID)
  SET search_path = public, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.reels_engine_activate_config_v1(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reels_engine_activate_config_v1(UUID, UUID)
  TO service_role;

-- Keep old signature for backward compatibility as read-only.
CREATE OR REPLACE FUNCTION public.reels_engine_activate_config(
  p_version_id UUID,
  p_segment_id UUID
)
RETURNS JSONB
LANGUAGE sql
VOLATILE
AS $$
  SELECT public.reels_engine_activate_config_v1(p_version_id, p_segment_id);
$$;

ALTER FUNCTION public.reels_engine_activate_config(UUID, UUID)
  SET search_path = public, pg_catalog;

REVOKE EXECUTE ON FUNCTION public.reels_engine_activate_config(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reels_engine_activate_config(UUID, UUID)
  TO service_role;
