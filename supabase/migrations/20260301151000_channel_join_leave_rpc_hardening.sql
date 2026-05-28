-- Stage 1 / E1-next: move channel join/leave to guarded server-side RPC.

CREATE OR REPLACE FUNCTION public.channel_join_v1(
  _channel_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _channel_id IS NULL THEN
    RAISE EXCEPTION 'invalid_channel_id' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = _channel_id
      AND c.is_public = true
  ) THEN
    RAISE EXCEPTION 'channel_not_joinable' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.channel_members(channel_id, user_id, role)
  VALUES (_channel_id, _actor_id, 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.channel_leave_v1(
  _channel_id uuid
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

  IF _channel_id IS NULL THEN
    RAISE EXCEPTION 'invalid_channel_id' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = _channel_id
      AND c.owner_id = _actor_id
  ) THEN
    RAISE EXCEPTION 'owner_cannot_leave_channel' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.channel_members cm
  WHERE cm.channel_id = _channel_id
    AND cm.user_id = _actor_id;

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;
  IF _deleted_count = 0 THEN
    RAISE EXCEPTION 'membership_not_found' USING ERRCODE = '22023';
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.channel_join_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.channel_leave_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_join_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_leave_v1(uuid) TO authenticated;
