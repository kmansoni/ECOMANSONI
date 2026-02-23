-- HOTFIX: send_message_v1 ambiguous parameter references
-- 
-- Problem: Parameters conversation_id, client_msg_id, body match column names
-- This causes ambiguous references in WHERE clauses
--
-- Fix: Use p_ prefix for all parameters and fully qualify all column references

CREATE OR REPLACE FUNCTION public.send_message_v1(
  conversation_id UUID,
  client_msg_id UUID,
  body TEXT
)
RETURNS TABLE (
  message_id UUID,
  seq BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p_conversation_id ALIAS FOR conversation_id;
  p_client_msg_id ALIAS FOR client_msg_id;
  p_body ALIAS FOR body;
  
  initiator UUID := auth.uid();
  trimmed TEXT;

  current_seq BIGINT;
  new_seq BIGINT;

  existing_id UUID;
  existing_seq BIGINT;

  inserted_id UUID;
  inserted_seq BIGINT;

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

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_conversation' USING ERRCODE = '22023';
  END IF;

  IF p_client_msg_id IS NULL THEN
    RAISE EXCEPTION 'invalid_client_msg_id' USING ERRCODE = '22023';
  END IF;

  IF p_body IS NULL THEN
    RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
  END IF;

  trimmed := btrim(p_body);
  IF length(trimmed) < 1 OR length(trimmed) > 4000 THEN
    RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = initiator
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  PERFORM public.chat_rate_limit_check_v1('msg_send', 60, 60);

  SELECT c.server_seq
  INTO current_seq
  FROM public.conversations c
  WHERE c.id = p_conversation_id
  FOR UPDATE;

  IF current_seq IS NULL THEN
    RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = '22023';
  END IF;

  SELECT m.id, m.seq
  INTO existing_id, existing_seq
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_id = initiator
    AND m.client_msg_id = p_client_msg_id
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    PERFORM public.rpc_audit_write_v1('send_message_v1', p_conversation_id, p_client_msg_id, NULL, 'duplicate', NULL);
    message_id := existing_id;
    seq := existing_seq;
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
      final_content := btrim(coalesce(payload->>'text', ''));

    ELSIF kind = 'media' THEN
      final_media_type := btrim(coalesce(payload->>'media_type', ''));
      final_media_url := btrim(coalesce(payload->>'media_url', ''));
      final_content := btrim(coalesce(payload->>'text', ''));
      final_duration := NULLIF((payload->>'duration_seconds')::int, 0);
      IF final_content = '' THEN
        final_content := '📋';
      END IF;
      IF final_media_type NOT IN ('image','video','voice','video_circle') THEN
        RAISE EXCEPTION 'invalid_media_type' USING ERRCODE = '22023';
      END IF;
      IF length(final_media_url) < 1 OR length(final_media_url) > 2048 THEN
        RAISE EXCEPTION 'invalid_media_url' USING ERRCODE = '22023';
      END IF;

    ELSIF kind = 'share_post' THEN
      final_shared_post := (payload->>'shared_post_id')::uuid;
      final_content := btrim(coalesce(payload->>'text', '📊 Пост'));

    ELSIF kind = 'share_reel' THEN
      final_shared_reel := (payload->>'shared_reel_id')::uuid;
      final_content := btrim(coalesce(payload->>'text', '🎬 Рилс'));
    END IF;

    IF final_content IS NULL OR length(btrim(final_content)) < 1 OR length(final_content) > 4000 THEN
      RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
    END IF;
  END IF;

  new_seq := current_seq + 1;

  INSERT INTO public.messages(
    conversation_id,
    sender_id,
    content,
    client_msg_id,
    seq,
    created_at,
    media_url,
    media_type,
    duration_seconds,
    shared_post_id,
    shared_reel_id
  )
  VALUES (
    p_conversation_id,
    initiator,
    final_content,
    p_client_msg_id,
    new_seq,
    now(),
    final_media_url,
    final_media_type,
    final_duration,
    final_shared_post,
    final_shared_reel
  )
  ON CONFLICT (conversation_id, sender_id, client_msg_id)
  DO NOTHING
  RETURNING m.id, m.seq INTO inserted_id, inserted_seq;

  IF inserted_id IS NULL THEN
    SELECT m.id, m.seq
      INTO inserted_id, inserted_seq
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id = initiator
      AND m.client_msg_id = p_client_msg_id
    LIMIT 1;
  END IF;

  IF inserted_id IS NULL THEN
    PERFORM public.rpc_audit_write_v1('send_message_v1', p_conversation_id, p_client_msg_id, NULL, 'error', 'send_failed');
    RAISE EXCEPTION 'send_failed' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.conversations c
  SET
    server_seq = new_seq,
    last_message_seq = GREATEST(c.last_message_seq, new_seq),
    updated_at = now()
  WHERE c.id = p_conversation_id;

  PERFORM public.rpc_audit_write_v1('send_message_v1', p_conversation_id, p_client_msg_id, NULL, 'ok', NULL);

  message_id := inserted_id;
  seq := inserted_seq;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.send_message_v1(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message_v1(UUID, UUID, TEXT) TO authenticated;
