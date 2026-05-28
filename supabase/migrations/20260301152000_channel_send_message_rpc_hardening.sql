-- Stage 1 / E1-next: guarded channel message send.
-- Rules:
-- - actor must be authenticated
-- - actor must have channel.posts.create capability in channel
-- - insert is done server-side and updates channel.updated_at

CREATE OR REPLACE FUNCTION public.channel_send_message_v1(
  _channel_id uuid,
  _content text,
  _media_url text DEFAULT NULL,
  _media_type text DEFAULT NULL,
  _duration_seconds integer DEFAULT NULL,
  _shared_post_id uuid DEFAULT NULL,
  _shared_reel_id uuid DEFAULT NULL,
  _silent boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _message_id uuid;
  _can_post boolean := false;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _channel_id IS NULL THEN
    RAISE EXCEPTION 'invalid_channel_id' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(BTRIM(_content), '') = '' THEN
    RAISE EXCEPTION 'empty_content' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.channels c WHERE c.id = _channel_id
  ) THEN
    RAISE EXCEPTION 'channel_not_found' USING ERRCODE = '22023';
  END IF;

  SELECT public.channel_has_capability(_channel_id, _actor_id, 'channel.posts.create')
  INTO _can_post;

  IF NOT COALESCE(_can_post, false) THEN
    RAISE EXCEPTION 'insufficient_privileges' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.channel_messages (
    channel_id,
    sender_id,
    content,
    media_url,
    media_type,
    duration_seconds,
    shared_post_id,
    shared_reel_id,
    silent
  )
  VALUES (
    _channel_id,
    _actor_id,
    BTRIM(_content),
    _media_url,
    NULLIF(BTRIM(_media_type), ''),
    _duration_seconds,
    _shared_post_id,
    _shared_reel_id,
    COALESCE(_silent, false)
  )
  RETURNING id INTO _message_id;

  UPDATE public.channels
  SET updated_at = NOW()
  WHERE id = _channel_id;

  RETURN _message_id;
END;
$$;
REVOKE ALL ON FUNCTION public.channel_send_message_v1(
  uuid,
  text,
  text,
  text,
  integer,
  uuid,
  uuid,
  boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_send_message_v1(
  uuid,
  text,
  text,
  text,
  integer,
  uuid,
  uuid,
  boolean
) TO authenticated;
