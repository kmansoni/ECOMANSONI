-- Phase 1: Delegation token consumer (dm:create)
-- Adds service-role-only wrappers that act "as user" by setting JWT claim sub locally.
-- This allows using existing Project B RPCs (get_or_create_dm, send_message_v1) safely.

BEGIN;

-- Wrapper: get_or_create_dm as an explicit user_id (service_role only)
CREATE OR REPLACE FUNCTION public.get_or_create_dm_delegated_v1(
  p_user_id UUID,
  target_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  conv_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_required' USING ERRCODE = '22023';
  END IF;

  -- Impersonate for auth.uid() inside downstream RPCs.
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);

  SELECT public.get_or_create_dm(target_user_id) INTO conv_id;
  RETURN conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_dm_delegated_v1(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm_delegated_v1(UUID, UUID) TO service_role;

-- Wrapper: send_message_v1 as an explicit user_id (service_role only)
CREATE OR REPLACE FUNCTION public.send_message_delegated_v1(
  p_user_id UUID,
  conversation_id UUID,
  client_msg_id UUID,
  body TEXT
)
RETURNS TABLE(
  message_id UUID,
  seq BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_required' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);

  RETURN QUERY
  SELECT * FROM public.send_message_v1(conversation_id, client_msg_id, body);
END;
$$;

REVOKE ALL ON FUNCTION public.send_message_delegated_v1(UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message_delegated_v1(UUID, UUID, UUID, TEXT) TO service_role;

COMMIT;
