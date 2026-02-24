-- Phase 1: Delegation token consumer (dm:read)
-- Service-role-only wrapper that fetches messages "as user" by setting JWT sub.

BEGIN;

CREATE OR REPLACE FUNCTION public.fetch_messages_delegated_v1(
  p_user_id UUID,
  p_conversation_id UUID,
  p_before_seq BIGINT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  sender_id UUID,
  content TEXT,
  created_at TIMESTAMPTZ,
  seq BIGINT,
  client_msg_id UUID,
  media_url TEXT,
  media_type TEXT,
  duration_seconds INTEGER,
  shared_post_id UUID,
  shared_reel_id UUID
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
  SELECT *
  FROM public.fetch_messages_v1(p_conversation_id, p_before_seq, p_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_messages_delegated_v1(UUID, UUID, BIGINT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_messages_delegated_v1(UUID, UUID, BIGINT, INTEGER) TO service_role;

COMMIT;
