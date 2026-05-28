-- Stage 1 / E1 slice: server-side role updates for channel members.
-- Moves member role mutation behind a guarded RPC and enforces deny-by-default semantics.

CREATE OR REPLACE FUNCTION public.channel_update_member_role_v1(
  _channel_id uuid,
  _target_user_id uuid,
  _next_role text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _updated_count integer := 0;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _channel_id IS NULL OR _target_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;

  IF _next_role IS NULL OR _next_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'invalid_next_role' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = _channel_id
  ) THEN
    RAISE EXCEPTION 'channel_not_found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.channel_has_capability(_channel_id, _actor_id, 'channel.members.manage') THEN
    RAISE EXCEPTION 'insufficient_privileges' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = _channel_id
      AND c.owner_id = _target_user_id
  ) THEN
    RAISE EXCEPTION 'cannot_change_owner_role' USING ERRCODE = '42501';
  END IF;

  UPDATE public.channel_members cm
  SET role = _next_role
  WHERE cm.channel_id = _channel_id
    AND cm.user_id = _target_user_id
    AND cm.role <> _next_role;

  GET DIAGNOSTICS _updated_count = ROW_COUNT;

  IF _updated_count = 0 THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.channel_members cm
      WHERE cm.channel_id = _channel_id
        AND cm.user_id = _target_user_id
    ) THEN
      RAISE EXCEPTION 'target_member_not_found' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.channel_update_member_role_v1(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_update_member_role_v1(uuid, uuid, text) TO authenticated;
