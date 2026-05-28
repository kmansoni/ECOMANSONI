-- Stage 1 / E1-4: move critical channel admin mutations behind server-side RPC.

CREATE OR REPLACE FUNCTION public.channel_set_auto_delete_seconds_v1(
  _channel_id uuid,
  _seconds integer
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

  IF _channel_id IS NULL THEN
    RAISE EXCEPTION 'invalid_channel_id' USING ERRCODE = '22023';
  END IF;

  IF _seconds IS NULL OR _seconds < 0 OR _seconds > 31536000 THEN
    RAISE EXCEPTION 'invalid_auto_delete_seconds' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.channels c WHERE c.id = _channel_id
  ) THEN
    RAISE EXCEPTION 'channel_not_found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.channel_has_capability(_channel_id, _actor_id, 'channel.settings.update') THEN
    RAISE EXCEPTION 'insufficient_privileges' USING ERRCODE = '42501';
  END IF;

  UPDATE public.channels c
  SET auto_delete_seconds = _seconds,
      updated_at = now()
  WHERE c.id = _channel_id;

  GET DIAGNOSTICS _updated_count = ROW_COUNT;
  IF _updated_count = 0 THEN
    RAISE EXCEPTION 'channel_update_failed' USING ERRCODE = 'P0001';
  END IF;

  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.channel_delete_v1(
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

  IF NOT EXISTS (
    SELECT 1 FROM public.channels c WHERE c.id = _channel_id
  ) THEN
    RAISE EXCEPTION 'channel_not_found' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = _channel_id
      AND c.owner_id = _actor_id
  ) THEN
    RAISE EXCEPTION 'only_owner_can_delete_channel' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.channels c
  WHERE c.id = _channel_id
    AND c.owner_id = _actor_id;

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;
  IF _deleted_count = 0 THEN
    RAISE EXCEPTION 'channel_delete_failed' USING ERRCODE = 'P0001';
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.channel_set_auto_delete_seconds_v1(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.channel_delete_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_set_auto_delete_seconds_v1(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_delete_v1(uuid) TO authenticated;
