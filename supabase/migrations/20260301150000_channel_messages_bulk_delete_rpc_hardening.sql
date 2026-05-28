-- Stage 1 / E1-next: guarded bulk delete for channel messages.
-- Rules:
-- - actor must be authenticated
-- - all ids must be scoped to provided channel
-- - if actor lacks channel.posts.delete, only own messages may be deleted

CREATE OR REPLACE FUNCTION public.channel_delete_messages_v1(
  _channel_id uuid,
  _message_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _has_delete_cap boolean := false;
  _input_count integer := 0;
  _scoped_count integer := 0;
  _deleted_count integer := 0;
  _unauthorized_count integer := 0;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _channel_id IS NULL THEN
    RAISE EXCEPTION 'invalid_channel_id' USING ERRCODE = '22023';
  END IF;

  IF _message_ids IS NULL OR array_length(_message_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'empty_message_ids' USING ERRCODE = '22023';
  END IF;

  SELECT cardinality(_message_ids) INTO _input_count;
  IF _input_count < 1 OR _input_count > 500 THEN
    RAISE EXCEPTION 'invalid_message_ids_count' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.channels c WHERE c.id = _channel_id
  ) THEN
    RAISE EXCEPTION 'channel_not_found' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
  INTO _scoped_count
  FROM public.channel_messages m
  WHERE m.channel_id = _channel_id
    AND m.id = ANY(_message_ids);

  IF _scoped_count <> _input_count THEN
    RAISE EXCEPTION 'message_selection_mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT public.channel_has_capability(_channel_id, _actor_id, 'channel.posts.delete')
  INTO _has_delete_cap;

  IF NOT _has_delete_cap THEN
    SELECT count(*)
    INTO _unauthorized_count
    FROM public.channel_messages m
    WHERE m.channel_id = _channel_id
      AND m.id = ANY(_message_ids)
      AND m.sender_id <> _actor_id;

    IF _unauthorized_count > 0 THEN
      RAISE EXCEPTION 'insufficient_privileges' USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.channel_messages m
  WHERE m.channel_id = _channel_id
    AND m.id = ANY(_message_ids)
    AND (
      _has_delete_cap
      OR m.sender_id = _actor_id
    );

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;
  RETURN _deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.channel_delete_messages_v1(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_delete_messages_v1(uuid, uuid[]) TO authenticated;
