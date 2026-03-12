-- Unify channel/group send contract with authenticated RPC entry points.

CREATE OR REPLACE FUNCTION public.send_channel_message_v1(
  p_channel_id UUID,
  p_content TEXT,
  p_silent BOOLEAN DEFAULT false,
  p_media_url TEXT DEFAULT NULL,
  p_media_type TEXT DEFAULT NULL,
  p_duration_seconds INTEGER DEFAULT NULL
)
RETURNS TABLE (
  message_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_message_id UUID;
  v_created_at TIMESTAMPTZ;
  v_content TEXT := btrim(COALESCE(p_content, ''));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_channel_id IS NULL THEN
    RAISE EXCEPTION 'channel_id is required' USING ERRCODE = '22023';
  END IF;

  IF v_content = '' THEN
    RAISE EXCEPTION 'content is required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.channel_has_capability(p_channel_id, v_actor, 'channel.posts.create') THEN
    RAISE EXCEPTION 'no permission to publish in this channel' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.channel_messages (
    channel_id,
    sender_id,
    content,
    media_url,
    media_type,
    duration_seconds,
    silent
  )
  VALUES (
    p_channel_id,
    v_actor,
    v_content,
    NULLIF(btrim(COALESCE(p_media_url, '')), ''),
    NULLIF(btrim(COALESCE(p_media_type, '')), ''),
    p_duration_seconds,
    COALESCE(p_silent, false)
  )
  RETURNING id, created_at INTO v_message_id, v_created_at;

  UPDATE public.channels
     SET updated_at = now()
   WHERE id = p_channel_id;

  RETURN QUERY SELECT v_message_id, v_created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.send_channel_message_v1(UUID, TEXT, BOOLEAN, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_channel_message_v1(UUID, TEXT, BOOLEAN, TEXT, TEXT, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_group_message_v1(
  p_group_id UUID,
  p_content TEXT,
  p_media_url TEXT DEFAULT NULL,
  p_media_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  message_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_message_id UUID;
  v_created_at TIMESTAMPTZ;
  v_content TEXT := btrim(COALESCE(p_content, ''));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'group_id is required' USING ERRCODE = '22023';
  END IF;

  IF v_content = '' THEN
    RAISE EXCEPTION 'content is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.group_chat_members gcm
     WHERE gcm.group_id = p_group_id
       AND gcm.user_id = v_actor
  ) THEN
    RAISE EXCEPTION 'no permission to send in this group' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.group_chat_messages (
    group_id,
    sender_id,
    content,
    media_url,
    media_type
  )
  VALUES (
    p_group_id,
    v_actor,
    v_content,
    NULLIF(btrim(COALESCE(p_media_url, '')), ''),
    NULLIF(btrim(COALESCE(p_media_type, '')), '')
  )
  RETURNING id, created_at INTO v_message_id, v_created_at;

  UPDATE public.group_chats
     SET updated_at = now()
   WHERE id = p_group_id;

  RETURN QUERY SELECT v_message_id, v_created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.send_group_message_v1(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_group_message_v1(UUID, TEXT, TEXT, TEXT) TO authenticated;
