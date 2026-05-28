-- Thread-aware send_message_v1: persist reply/thread metadata when columns exist

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
#variable_conflict use_variable
DECLARE
  initiator UUID := auth.uid();
  trimmed TEXT;
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
  final_reply_to UUID;
  final_thread_root UUID;
  has_reply_to_col BOOLEAN := FALSE;
  has_thread_root_col BOOLEAN := FALSE;
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
    WHERE cp.conversation_id = conversation_id
      AND cp.user_id = initiator
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  PERFORM public.chat_rate_limit_check_v1('msg_send', 60, 60);

  SELECT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'messages'
             AND column_name = 'reply_to_message_id'
         ),
         EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'messages'
             AND column_name = 'thread_root_message_id'
         )
    INTO has_reply_to_col, has_thread_root_col;

  -- Idempotency fast-path
  SELECT m.id, m.seq
    INTO inserted_id, inserted_seq
  FROM public.messages m
  WHERE m.conversation_id = conversation_id
    AND m.sender_id = initiator
    AND m.client_msg_id = client_msg_id
  LIMIT 1;

  IF inserted_id IS NOT NULL THEN
    message_id := inserted_id;
    seq := inserted_seq;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Structured parsing (best-effort)
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
  final_reply_to := NULL;
  final_thread_root := NULL;

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
        final_content := '📎';
      END IF;

      IF final_media_type NOT IN ('image','video','voice','video_circle') THEN
        RAISE EXCEPTION 'invalid_media_type' USING ERRCODE = '22023';
      END IF;

      IF length(final_media_url) < 1 OR length(final_media_url) > 2048 THEN
        RAISE EXCEPTION 'invalid_media_url' USING ERRCODE = '22023';
      END IF;

    ELSIF kind = 'share_post' THEN
      final_shared_post := (payload->>'post_id')::uuid;
      final_content := btrim(coalesce(payload->>'text', '📌 Пост'));

    ELSIF kind = 'share_reel' THEN
      final_shared_reel := (payload->>'reel_id')::uuid;
      final_content := btrim(coalesce(payload->>'text', '🎬 Рилс'));
    END IF;

    IF payload ? 'reply_to_message_id' THEN
      final_reply_to := NULLIF(btrim(payload->>'reply_to_message_id'), '')::uuid;
    END IF;

    IF payload ? 'thread_root_message_id' THEN
      final_thread_root := NULLIF(btrim(payload->>'thread_root_message_id'), '')::uuid;
    END IF;

    IF final_content IS NULL OR length(btrim(final_content)) < 1 OR length(final_content) > 4000 THEN
      RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF final_reply_to IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.id = final_reply_to
        AND m.conversation_id = conversation_id
    ) THEN
      RAISE EXCEPTION 'invalid_reply_to_message_id' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF final_thread_root IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.id = final_thread_root
        AND m.conversation_id = conversation_id
    ) THEN
      RAISE EXCEPTION 'invalid_thread_root_message_id' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF final_thread_root IS NULL AND final_reply_to IS NOT NULL THEN
    final_thread_root := final_reply_to;
  END IF;

  BEGIN
    IF has_reply_to_col AND has_thread_root_col THEN
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
        reply_to_message_id,
        thread_root_message_id
      )
      VALUES (
        conversation_id,
        initiator,
        final_content,
        client_msg_id,
        final_media_url,
        final_media_type,
        final_duration,
        final_shared_post,
        final_shared_reel,
        final_reply_to,
        final_thread_root
      )
      RETURNING id, seq INTO inserted_id, inserted_seq;
    ELSIF has_reply_to_col THEN
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
        reply_to_message_id
      )
      VALUES (
        conversation_id,
        initiator,
        final_content,
        client_msg_id,
        final_media_url,
        final_media_type,
        final_duration,
        final_shared_post,
        final_shared_reel,
        final_reply_to
      )
      RETURNING id, seq INTO inserted_id, inserted_seq;
    ELSIF has_thread_root_col THEN
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
        thread_root_message_id
      )
      VALUES (
        conversation_id,
        initiator,
        final_content,
        client_msg_id,
        final_media_url,
        final_media_type,
        final_duration,
        final_shared_post,
        final_shared_reel,
        final_thread_root
      )
      RETURNING id, seq INTO inserted_id, inserted_seq;
    ELSE
      INSERT INTO public.messages(
        conversation_id,
        sender_id,
        content,
        client_msg_id,
        media_url,
        media_type,
        duration_seconds,
        shared_post_id,
        shared_reel_id
      )
      VALUES (
        conversation_id,
        initiator,
        final_content,
        client_msg_id,
        final_media_url,
        final_media_type,
        final_duration,
        final_shared_post,
        final_shared_reel
      )
      RETURNING id, seq INTO inserted_id, inserted_seq;
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      inserted_id := NULL;
      inserted_seq := NULL;
  END;

  IF inserted_id IS NULL THEN
    SELECT m.id, m.seq
      INTO inserted_id, inserted_seq
    FROM public.messages m
    WHERE m.conversation_id = conversation_id
      AND m.sender_id = initiator
      AND m.client_msg_id = client_msg_id
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
REVOKE ALL ON FUNCTION public.send_message_v1(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message_v1(UUID, UUID, TEXT) TO authenticated;
