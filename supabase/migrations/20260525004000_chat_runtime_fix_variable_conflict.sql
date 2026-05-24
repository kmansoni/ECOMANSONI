-- Runtime fix for chat RPC variable/column ambiguity.
-- 1) send_message_v1: avoid variable shadowing for seq and ensure canonical duplicate return.
-- 2) chat_send_message_v11: prefer column names on ambiguity (dialog_id in ON CONFLICT target).

CREATE OR REPLACE FUNCTION public.send_message_v1(
  conversation_id UUID,
  client_msg_id UUID,
  body TEXT,
  is_silent BOOLEAN DEFAULT false
)
RETURNS TABLE (
  message_id UUID,
  seq BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  initiator UUID := auth.uid();
  trimmed TEXT;
  inserted_id UUID;
  inserted_seq BIGINT;
  v_is_silent BOOLEAN := COALESCE(is_silent, false);

  payload JSONB;
  kind TEXT;
  final_content TEXT;
  final_media_url TEXT;
  final_media_type TEXT;
  final_duration INTEGER;
  final_shared_post UUID;
  final_shared_reel UUID;
BEGIN
  IF initiator IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF conversation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_conversation' USING ERRCODE = '22023';
  END IF;

  IF client_msg_id IS NULL THEN
    RAISE EXCEPTION 'invalid_client_msg_id' USING ERRCODE = '22023';
  END IF;

  IF body IS NULL THEN
    RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
  END IF;

  trimmed := btrim(body);
  IF length(trimmed) < 1 OR length(trimmed) > 4000 THEN
    RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = send_message_v1.conversation_id
      AND cp.user_id = initiator
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  PERFORM public.chat_rate_limit_check_v1('msg_send', 60, 60);

  SELECT m.id, m.seq
    INTO inserted_id, inserted_seq
  FROM public.messages m
  WHERE m.conversation_id = send_message_v1.conversation_id
    AND m.client_msg_id = send_message_v1.client_msg_id
  LIMIT 1;

  IF inserted_id IS NOT NULL THEN
    message_id := inserted_id;
    seq := inserted_seq;
    RETURN NEXT;
    RETURN;
  END IF;

  BEGIN
    IF left(trimmed, 1) = '{' THEN
      payload := trimmed::jsonb;
    ELSE
      payload := NULL;
    END IF;
  EXCEPTION
    WHEN others THEN
      payload := NULL;
  END;

  final_content := trimmed;
  final_media_url := NULL;
  final_media_type := NULL;
  final_duration := NULL;
  final_shared_post := NULL;
  final_shared_reel := NULL;

  IF payload IS NOT NULL THEN
    kind := coalesce(payload->>'kind', '');

    IF kind = 'text' THEN
      final_content := coalesce(payload->>'text', '');
      final_content := btrim(final_content);

    ELSIF kind = 'media' THEN
      final_media_type := btrim(coalesce(payload->>'media_type', ''));
      final_media_url := btrim(coalesce(payload->>'media_url', ''));
      final_content := btrim(coalesce(payload->>'text', ''));
      final_duration := NULLIF((payload->>'duration_seconds')::int, 0);

      IF final_content = '' THEN
        final_content := 'media';
      END IF;

      IF final_media_type NOT IN ('image','video','voice','video_circle') THEN
        RAISE EXCEPTION 'invalid_media_type' USING ERRCODE = '22023';
      END IF;

      IF length(final_media_url) < 1 OR length(final_media_url) > 2048 THEN
        RAISE EXCEPTION 'invalid_media_url' USING ERRCODE = '22023';
      END IF;

    ELSIF kind = 'share_post' THEN
      final_shared_post := (payload->>'post_id')::uuid;
      final_content := btrim(coalesce(payload->>'text', 'share_post'));

    ELSIF kind = 'share_reel' THEN
      final_shared_reel := (payload->>'reel_id')::uuid;
      final_content := btrim(coalesce(payload->>'text', 'share_reel'));

    END IF;

    IF final_content IS NULL OR length(btrim(final_content)) < 1 OR length(final_content) > 4000 THEN
      RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.messages(
    conversation_id,
    sender_id,
    content,
    client_msg_id,
    media_url,
    media_type,
    duration_seconds,
    shared_post_id,
    shared_reel_id,
    is_silent
  )
  VALUES (
    send_message_v1.conversation_id,
    initiator,
    final_content,
    send_message_v1.client_msg_id,
    final_media_url,
    final_media_type,
    final_duration,
    final_shared_post,
    final_shared_reel,
    v_is_silent
  )
  ON CONFLICT (conversation_id, client_msg_id)
  DO NOTHING
  RETURNING id, messages.seq INTO inserted_id, inserted_seq;

  IF inserted_id IS NULL THEN
    SELECT m.id, m.seq
      INTO inserted_id, inserted_seq
    FROM public.messages m
    WHERE m.conversation_id = send_message_v1.conversation_id
      AND m.client_msg_id = send_message_v1.client_msg_id
    LIMIT 1;
  END IF;

  IF inserted_id IS NULL THEN
    RAISE EXCEPTION 'send_failed' USING ERRCODE = 'P0001';
  END IF;

  message_id := inserted_id;
  seq := inserted_seq;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.send_message_v1(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message_v1(UUID, UUID, TEXT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.chat_send_message_v11(
  p_dialog_id UUID,
  p_device_id TEXT,
  p_client_write_seq BIGINT,
  p_client_msg_id UUID,
  p_content TEXT,
  p_client_sent_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE(
  ack_id UUID,
  ack_status TEXT,
  dialog_id UUID,
  msg_id UUID,
  msg_seq BIGINT,
  server_ack_cursor BIGINT,
  server_ts TIMESTAMPTZ,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user UUID := auth.uid();
  v_ack_id UUID := gen_random_uuid();
  v_msg_id UUID;
  v_msg_seq BIGINT;
BEGIN
  IF v_user IS NULL THEN
    RETURN QUERY SELECT v_ack_id, 'rejected', p_dialog_id, NULL::UUID, NULL::BIGINT, p_client_write_seq, now(), 'ERR_UNAUTHORIZED';
    RETURN;
  END IF;

  IF p_dialog_id IS NULL OR p_device_id IS NULL OR p_client_write_seq IS NULL OR p_client_write_seq < 1 OR p_client_msg_id IS NULL OR coalesce(trim(p_content), '') = '' THEN
    RETURN QUERY SELECT v_ack_id, 'rejected', p_dialog_id, NULL::UUID, NULL::BIGINT, p_client_write_seq, now(), 'ERR_INVALID_ARGUMENT';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_dialog_id
      AND cp.user_id = v_user
  ) THEN
    RETURN QUERY SELECT v_ack_id, 'rejected', p_dialog_id, NULL::UUID, NULL::BIGINT, p_client_write_seq, now(), 'ERR_FORBIDDEN';
    RETURN;
  END IF;

  SELECT m.id, m.seq
    INTO v_msg_id, v_msg_seq
  FROM public.messages m
  WHERE m.conversation_id = p_dialog_id
    AND m.client_msg_id = p_client_msg_id
  LIMIT 1;

  IF v_msg_id IS NULL THEN
    INSERT INTO public.messages(conversation_id, sender_id, content, client_msg_id)
    VALUES (p_dialog_id, v_user, trim(p_content), p_client_msg_id)
    ON CONFLICT (conversation_id, client_msg_id)
    DO NOTHING
    RETURNING id, messages.seq INTO v_msg_id, v_msg_seq;

    IF v_msg_id IS NULL THEN
      SELECT m.id, m.seq
        INTO v_msg_id, v_msg_seq
      FROM public.messages m
      WHERE m.conversation_id = p_dialog_id
        AND m.client_msg_id = p_client_msg_id
      LIMIT 1;
    END IF;
  END IF;

  IF v_msg_id IS NULL THEN
    RETURN QUERY SELECT v_ack_id, 'rejected', p_dialog_id, NULL::UUID, NULL::BIGINT, p_client_write_seq, now(), 'ERR_DUPLICATE_RESOLUTION_FAILED';
    RETURN;
  END IF;

  RETURN QUERY SELECT v_ack_id, 'accepted', p_dialog_id, v_msg_id, v_msg_seq, p_client_write_seq, now(), NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_send_message_v11(UUID, TEXT, BIGINT, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_send_message_v11(UUID, TEXT, BIGINT, UUID, TEXT, TIMESTAMPTZ) TO authenticated;
