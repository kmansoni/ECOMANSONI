-- Stage 1 / E1-3: capability override mutations through guarded RPCs.
-- Deny-by-default: only actors with channel.settings.update may mutate channel capability overrides.

CREATE OR REPLACE FUNCTION public.channel_set_capability_override_v1(
  _channel_id uuid,
  _capability_key text,
  _is_enabled boolean,
  _params jsonb DEFAULT '{}'::jsonb
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

  IF _channel_id IS NULL OR _capability_key IS NULL OR btrim(_capability_key) = '' THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;

  IF _is_enabled IS NULL THEN
    RAISE EXCEPTION 'invalid_is_enabled' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = _channel_id
  ) THEN
    RAISE EXCEPTION 'channel_not_found' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.channel_capability_catalog ccc
    WHERE ccc.key = _capability_key
      AND ccc.is_active = true
  ) THEN
    RAISE EXCEPTION 'capability_not_found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.channel_has_capability(_channel_id, _actor_id, 'channel.settings.update') THEN
    RAISE EXCEPTION 'insufficient_privileges' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.channel_capability_overrides (
    channel_id,
    capability_key,
    is_enabled,
    params,
    created_by
  )
  VALUES (
    _channel_id,
    _capability_key,
    _is_enabled,
    COALESCE(_params, '{}'::jsonb),
    _actor_id
  )
  ON CONFLICT (channel_id, capability_key)
  DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled,
      params = EXCLUDED.params,
      updated_at = now();

  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.channel_remove_capability_override_v1(
  _channel_id uuid,
  _capability_key text
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

  IF _channel_id IS NULL OR _capability_key IS NULL OR btrim(_capability_key) = '' THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = _channel_id
  ) THEN
    RAISE EXCEPTION 'channel_not_found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.channel_has_capability(_channel_id, _actor_id, 'channel.settings.update') THEN
    RAISE EXCEPTION 'insufficient_privileges' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.channel_capability_overrides cco
  WHERE cco.channel_id = _channel_id
    AND cco.capability_key = _capability_key;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.channel_set_capability_override_v1(uuid, text, boolean, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.channel_remove_capability_override_v1(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_set_capability_override_v1(uuid, text, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_remove_capability_override_v1(uuid, text) TO authenticated;
