-- Stage 1 / E1 slice: server-side member removal for channels.
-- Deny-by-default: only actors with channel.members.manage capability can remove members.

CREATE OR REPLACE FUNCTION public.channel_remove_member_v1(
  _channel_id uuid,
  _target_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _deleted_count integer := 0;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _channel_id IS NULL OR _target_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'cannot_remove_owner' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.channel_members cm
  WHERE cm.channel_id = _channel_id
    AND cm.user_id = _target_user_id;

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;

  IF _deleted_count = 0 THEN
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
REVOKE ALL ON FUNCTION public.channel_remove_member_v1(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_remove_member_v1(uuid, uuid) TO authenticated;
