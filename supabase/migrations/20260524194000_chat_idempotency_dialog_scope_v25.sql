-- Step 2.5: server idempotency gate (dialog-local client_msg_id)
-- Scope:
-- 1) preflight duplicate detection for (conversation_id, client_msg_id)
-- 2) unique partial index on messages(conversation_id, client_msg_id)
-- 3) idempotent canonical return for send_message_v1 and chat_send_message_v11

-- 1) Preflight duplicate check (fail-closed; requires explicit cleanup migration if violated)
DO $$
DECLARE
  v_dupe_count BIGINT := 0;
BEGIN
  SELECT COUNT(*) INTO v_dupe_count
  FROM (
    SELECT m.conversation_id, m.client_msg_id
    FROM public.messages m
    WHERE m.client_msg_id IS NOT NULL
    GROUP BY m.conversation_id, m.client_msg_id
    HAVING COUNT(*) > 1
  ) d;

  IF v_dupe_count > 0 THEN
    RAISE EXCEPTION 'chat_idempotency_preflight_failed: found % duplicate (conversation_id, client_msg_id) keys in public.messages', v_dupe_count
      USING ERRCODE = '23505';
  END IF;
END $$;

-- 2) Unique partial index for dialog-local idempotency
CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_client_msg_id_uidx
  ON public.messages (conversation_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;

-- 3) send_message_v1: canonical idempotent return on duplicate client_msg_id per dialog
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
  final_loc_lat DOUBLE PRECISION;
  final_loc_lng DOUBLE PRECISION;
  final_loc_acc INTEGER;
  final_loc_is_live BOOLEAN;
  live_duration_secs INTEGER;
  final_poll_id UUID;
  final_effect TEXT;
  final_metadata JSONB;
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

  SELECT c.server_seq
  INTO current_seq
  FROM public.conversations c
  WHERE c.id = send_message_v1.conversation_id
  FOR UPDATE;

  IF current_seq IS NULL THEN
    RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = '22023';
  END IF;

  SELECT m.id, m.seq
  INTO existing_id, existing_seq
  FROM public.messages m
  WHERE m.conversation_id = send_message_v1.conversation_id
    AND m.client_msg_id = send_message_v1.client_msg_id
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    PERFORM public.rpc_audit_write_v1('send_message_v1', conversation_id, client_msg_id, NULL, 'duplicate', NULL);
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
  EXCEPTION WHEN others THEN
    payload := NULL;
  END;

  final_content     := trimmed;
  final_media_url   := NULL;
  final_media_type  := NULL;
  final_duration    := NULL;
  final_shared_post := NULL;
  final_shared_reel := NULL;
  final_loc_lat     := NULL;
  final_loc_lng     := NULL;
  final_loc_acc     := NULL;
  final_loc_is_live := FALSE;
  final_poll_id     := NULL;
  final_effect      := NULL;
  final_metadata    := NULL;

  IF payload IS NOT NULL THEN
    kind := coalesce(payload->>'kind', '');

    IF payload ? 'metadata' AND jsonb_typeof(payload->'metadata') = 'object' THEN
      final_metadata := payload->'metadata';
    END IF;

    final_effect := btrim(coalesce(payload->>'message_effect', ''));
    IF final_effect = '' THEN final_effect := NULL; END IF;
    IF final_effect IS NOT NULL AND final_effect NOT IN ('confetti','fire','hearts','thumbsup') THEN
      final_effect := NULL;
    END IF;

    IF kind = 'text' THEN
      final_content := btrim(coalesce(payload->>'text', ''));

    ELSIF kind = 'media' THEN
      final_media_type := btrim(coalesce(payload->>'media_type', ''));
      final_media_url  := btrim(coalesce(payload->>'media_url', ''));
      final_content    := btrim(coalesce(payload->>'text', ''));
      final_duration   := NULLIF((payload->>'duration_seconds')::int, 0);
      IF final_content = '' THEN final_content := 'media'; END IF;
      IF final_media_type NOT IN ('image','video','voice','video_circle') THEN
        RAISE EXCEPTION 'invalid_media_type' USING ERRCODE = '22023';
      END IF;
      IF length(final_media_url) < 1 OR length(final_media_url) > 2048 THEN
        RAISE EXCEPTION 'invalid_media_url' USING ERRCODE = '22023';
      END IF;
      IF NOT (final_media_url LIKE '/storage/v1/object/media/' || initiator::text || '/%'
           OR final_media_url LIKE 'https://%/storage/v1/object/media/' || initiator::text || '/%') THEN
        RAISE EXCEPTION 'media_url_ownership_violation' USING ERRCODE = '42501';
      END IF;

    ELSIF kind = 'document' THEN
      final_media_type := 'document';
      final_media_url  := btrim(coalesce(payload->>'media_url', ''));
      final_content    := btrim(coalesce(payload->>'filename', coalesce(payload->>'text', 'document')));
      IF length(final_media_url) < 1 OR length(final_media_url) > 2048 THEN
        RAISE EXCEPTION 'invalid_media_url' USING ERRCODE = '22023';
      END IF;
      IF NOT (final_media_url LIKE '/storage/v1/object/media/' || initiator::text || '/%'
           OR final_media_url LIKE 'https://%/storage/v1/object/media/' || initiator::text || '/%') THEN
        RAISE EXCEPTION 'media_url_ownership_violation' USING ERRCODE = '42501';
      END IF;

    ELSIF kind = 'location' THEN
      final_loc_lat := (payload->>'lat')::double precision;
      final_loc_lng := (payload->>'lng')::double precision;
      final_loc_acc := (payload->>'accuracy_m')::integer;
      final_loc_is_live := coalesce((payload->>'is_live')::boolean, FALSE);
      live_duration_secs := coalesce((payload->>'live_duration_seconds')::integer, 900);
      IF final_loc_lat IS NULL OR final_loc_lat NOT BETWEEN -90 AND 90 THEN
        RAISE EXCEPTION 'invalid_latitude' USING ERRCODE = '22023';
      END IF;
      IF final_loc_lng IS NULL OR final_loc_lng NOT BETWEEN -180 AND 180 THEN
        RAISE EXCEPTION 'invalid_longitude' USING ERRCODE = '22023';
      END IF;
      IF final_loc_acc IS NOT NULL AND (final_loc_acc < 0 OR final_loc_acc > 100000) THEN
        RAISE EXCEPTION 'invalid_accuracy' USING ERRCODE = '22023';
      END IF;
      IF final_loc_is_live AND (live_duration_secs < 60 OR live_duration_secs > 28800) THEN
        RAISE EXCEPTION 'invalid_live_duration' USING ERRCODE = '22023';
      END IF;
      final_content := 'location';

    ELSIF kind = 'share_post' THEN
      final_shared_post := (payload->>'shared_post_id')::uuid;
      IF final_shared_post IS NULL THEN
        final_shared_post := (payload->>'post_id')::uuid;
      END IF;
      final_content := btrim(coalesce(payload->>'text', 'share_post'));

    ELSIF kind = 'share_reel' THEN
      final_shared_reel := (payload->>'shared_reel_id')::uuid;
      IF final_shared_reel IS NULL THEN
        final_shared_reel := (payload->>'reel_id')::uuid;
      END IF;
      final_content := btrim(coalesce(payload->>'text', 'share_reel'));

    ELSIF kind = 'sticker' THEN
      final_media_url  := btrim(coalesce(payload->>'media_url', ''));
      final_media_type := 'sticker';
      final_content    := 'sticker';
      IF length(final_media_url) < 1 OR length(final_media_url) > 2048 THEN
        RAISE EXCEPTION 'invalid_media_url' USING ERRCODE = '22023';
      END IF;
      IF NOT (final_media_url LIKE 'https://%' OR final_media_url LIKE '/storage/%') THEN
        RAISE EXCEPTION 'invalid_sticker_url' USING ERRCODE = '22023';
      END IF;

    ELSIF kind = 'gif' THEN
      final_media_url  := btrim(coalesce(payload->>'media_url', ''));
      final_media_type := 'gif';
      final_content    := 'gif';
      IF length(final_media_url) < 1 OR length(final_media_url) > 2048 THEN
        RAISE EXCEPTION 'invalid_media_url' USING ERRCODE = '22023';
      END IF;
      IF NOT (final_media_url LIKE 'https://%') THEN
        RAISE EXCEPTION 'invalid_gif_url' USING ERRCODE = '22023';
      END IF;

    ELSIF kind = 'gift' THEN
      final_media_type := 'gift';
      final_content    := payload::text;
      IF length(final_content) < 1 OR length(final_content) > 4000 THEN
        RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
      END IF;

    ELSIF kind = 'poll' THEN
      final_media_type := 'poll';
      final_content    := 'poll';
      BEGIN
        final_poll_id := (payload->>'poll_id')::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid_poll_id' USING ERRCODE = '22023';
      END;
      IF final_poll_id IS NULL THEN
        RAISE EXCEPTION 'invalid_poll_id' USING ERRCODE = '22023';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.message_polls WHERE id = final_poll_id) THEN
        RAISE EXCEPTION 'poll_not_found' USING ERRCODE = '22023';
      END IF;

    ELSIF kind = 'contact' THEN
      final_media_type := 'contact';
      IF payload->'contact' IS NULL THEN
        RAISE EXCEPTION 'invalid_contact' USING ERRCODE = '22023';
      END IF;
      IF btrim(coalesce(payload->'contact'->>'name', '')) = '' THEN
        RAISE EXCEPTION 'invalid_contact_name' USING ERRCODE = '22023';
      END IF;
      IF btrim(coalesce(payload->'contact'->>'phone', '')) = '' THEN
        RAISE EXCEPTION 'invalid_contact_phone' USING ERRCODE = '22023';
      END IF;
      final_content := (payload->'contact')::text;

    END IF;

    IF final_content IS NULL OR length(btrim(final_content)) < 1 OR length(final_content) > 4000 THEN
      RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
    END IF;
  END IF;

  new_seq := current_seq + 1;

  INSERT INTO public.messages(
    conversation_id, sender_id, content, client_msg_id, seq, created_at,
    media_url, media_type, duration_seconds,
    shared_post_id, shared_reel_id,
    location_lat, location_lng, location_accuracy_m, location_is_live,
    poll_id, message_effect, metadata
  )
  VALUES (
    send_message_v1.conversation_id,
    initiator,
    final_content,
    send_message_v1.client_msg_id,
    new_seq,
    now(),
    final_media_url,
    final_media_type,
    final_duration,
    final_shared_post,
    final_shared_reel,
    final_loc_lat,
    final_loc_lng,
    final_loc_acc,
    final_loc_is_live,
    final_poll_id,
    final_effect,
    final_metadata
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

    IF inserted_id IS NULL THEN
      PERFORM public.rpc_audit_write_v1('send_message_v1', conversation_id, client_msg_id, NULL, 'error', 'send_failed');
      RAISE EXCEPTION 'send_failed' USING ERRCODE = 'P0001';
    END IF;

    PERFORM public.rpc_audit_write_v1('send_message_v1', conversation_id, client_msg_id, NULL, 'duplicate', NULL);
    message_id := inserted_id;
    seq := inserted_seq;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.conversations
  SET
    server_seq = new_seq,
    last_message_seq = GREATEST(last_message_seq, new_seq),
    updated_at = now()
  WHERE id = send_message_v1.conversation_id;

  IF final_loc_is_live AND final_loc_lat IS NOT NULL THEN
    INSERT INTO public.live_locations(
      message_id, conversation_id, sender_id,
      lat, lng, accuracy_m, expires_at
    ) VALUES (
      inserted_id,
      send_message_v1.conversation_id,
      initiator,
      final_loc_lat, final_loc_lng, final_loc_acc,
      now() + make_interval(secs => live_duration_secs)
    )
    ON CONFLICT (message_id) DO NOTHING;
  END IF;

  PERFORM public.rpc_audit_write_v1('send_message_v1', conversation_id, client_msg_id, NULL, 'ok', NULL);

  message_id := inserted_id;
  seq := inserted_seq;
  RETURN NEXT;
END;
$$;

-- 4) chat_send_message_v11: canonical idempotent return for duplicate (dialog_id, client_msg_id)
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
DECLARE
  v_user UUID := auth.uid();
  v_ledger public.chat_write_ledger%ROWTYPE;
  v_msg public.messages%ROWTYPE;
  v_ack_id UUID := gen_random_uuid();
  v_dialog_stream TEXT;
  v_user_stream TEXT;
  v_dialog_event_seq BIGINT;
  v_inbox_event_seq BIGINT;
  v_receipt_exists BOOLEAN;
  v_preview TEXT;
  v_unread INTEGER;
  v_sort_key TEXT;
  v_inserted BOOLEAN := FALSE;
  r_part RECORD;
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

  SELECT * INTO v_ledger
  FROM public.chat_write_ledger l
  WHERE l.actor_id = v_user
    AND l.device_id = p_device_id
    AND l.client_write_seq = p_client_write_seq
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      v_ack_id,
      'duplicate'::TEXT,
      COALESCE(v_ledger.canonical_dialog_id, p_dialog_id),
      v_ledger.canonical_msg_id,
      v_ledger.canonical_msg_seq,
      p_client_write_seq,
      now(),
      v_ledger.error_code;
    RETURN;
  END IF;

  INSERT INTO public.chat_write_ledger (
    actor_id,
    device_id,
    client_write_seq,
    op_type,
    status,
    canonical_dialog_id
  ) VALUES (
    v_user,
    p_device_id,
    p_client_write_seq,
    'send_message',
    'pending',
    p_dialog_id
  );

  SELECT * INTO v_msg
  FROM public.messages m
  WHERE m.conversation_id = p_dialog_id
    AND m.client_msg_id = p_client_msg_id
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.chat_write_ledger l
    SET status = 'accepted',
        canonical_msg_id = v_msg.id,
        canonical_msg_seq = v_msg.seq,
        error_code = NULL,
        error_details = '{}'::jsonb,
        updated_at = now()
    WHERE l.actor_id = v_user
      AND l.device_id = p_device_id
      AND l.client_write_seq = p_client_write_seq;

    RETURN QUERY SELECT v_ack_id, 'duplicate', p_dialog_id, v_msg.id, v_msg.seq, p_client_write_seq, now(), NULL::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.messages(conversation_id, sender_id, content, client_msg_id)
  VALUES (p_dialog_id, v_user, trim(p_content), p_client_msg_id)
  ON CONFLICT (conversation_id, client_msg_id)
  DO NOTHING
  RETURNING * INTO v_msg;

  v_inserted := FOUND;

  IF NOT v_inserted THEN
    SELECT * INTO v_msg
    FROM public.messages m
    WHERE m.conversation_id = p_dialog_id
      AND m.client_msg_id = p_client_msg_id
    LIMIT 1;

    IF NOT FOUND THEN
      UPDATE public.chat_write_ledger l
      SET status = 'rejected',
          error_code = 'ERR_DUPLICATE_RESOLUTION_FAILED',
          error_details = jsonb_build_object('dialog_id', p_dialog_id, 'client_msg_id', p_client_msg_id),
          updated_at = now()
      WHERE l.actor_id = v_user
        AND l.device_id = p_device_id
        AND l.client_write_seq = p_client_write_seq;

      RETURN QUERY SELECT v_ack_id, 'rejected', p_dialog_id, NULL::UUID, NULL::BIGINT, p_client_write_seq, now(), 'ERR_DUPLICATE_RESOLUTION_FAILED';
      RETURN;
    END IF;

    UPDATE public.chat_write_ledger l
    SET status = 'accepted',
        canonical_msg_id = v_msg.id,
        canonical_msg_seq = v_msg.seq,
        error_code = NULL,
        error_details = '{}'::jsonb,
        updated_at = now()
    WHERE l.actor_id = v_user
      AND l.device_id = p_device_id
      AND l.client_write_seq = p_client_write_seq;

    RETURN QUERY SELECT v_ack_id, 'duplicate', p_dialog_id, v_msg.id, v_msg.seq, p_client_write_seq, now(), NULL::TEXT;
    RETURN;
  END IF;

  v_dialog_stream := 'dialog:' || p_dialog_id::text;
  v_dialog_event_seq := public.chat_next_stream_seq(v_dialog_stream);

  INSERT INTO public.chat_events(
    stream_id,
    event_seq,
    scope,
    event_type,
    partition_key,
    dialog_id,
    actor_id,
    caused_by_device_id,
    caused_by_client_write_seq,
    caused_by_client_msg_id,
    payload_json,
    payload_hash
  ) VALUES (
    v_dialog_stream,
    v_dialog_event_seq,
    'dialog',
    'message.created',
    p_dialog_id::text,
    p_dialog_id,
    v_user,
    p_device_id,
    p_client_write_seq,
    p_client_msg_id,
    jsonb_build_object(
      'msg_id', v_msg.id,
      'msg_seq', v_msg.seq,
      'sender_id', v_msg.sender_id,
      'content', v_msg.content,
      'created_at', v_msg.created_at
    ),
    public.chat_sha256_hex(coalesce(v_msg.id::text, '') || ':' || coalesce(v_msg.seq::text, '0') || ':' || coalesce(v_msg.content, ''))
  );

  v_preview := left(trim(p_content), 140);

  FOR r_part IN
    SELECT cp.user_id
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_dialog_id
  LOOP
    IF r_part.user_id = v_user THEN
      v_unread := 0;
    ELSE
      SELECT COALESCE(i.unread_count, 0) + 1
        INTO v_unread
      FROM public.chat_inbox_projection i
      WHERE i.user_id = r_part.user_id
        AND i.dialog_id = p_dialog_id;
      v_unread := COALESCE(v_unread, 1);
    END IF;

    v_sort_key := public.chat_build_sort_key(NULL, false, COALESCE(v_msg.seq, 0), p_dialog_id);

    INSERT INTO public.chat_inbox_projection(
      user_id, dialog_id, sort_key, pinned_rank, has_draft, activity_seq, preview_text, unread_count, last_read_seq, muted, updated_at
    ) VALUES (
      r_part.user_id, p_dialog_id, v_sort_key, NULL, false, COALESCE(v_msg.seq, 0), v_preview,
      v_unread,
      CASE WHEN r_part.user_id = v_user THEN COALESCE(v_msg.seq, 0) ELSE COALESCE((SELECT i.last_read_seq FROM public.chat_inbox_projection i WHERE i.user_id = r_part.user_id AND i.dialog_id = p_dialog_id), 0) END,
      false,
      now()
    )
    ON CONFLICT (user_id, dialog_id)
    DO UPDATE SET
      sort_key = EXCLUDED.sort_key,
      activity_seq = EXCLUDED.activity_seq,
      preview_text = EXCLUDED.preview_text,
      unread_count = CASE WHEN r_part.user_id = v_user THEN public.chat_inbox_projection.unread_count ELSE GREATEST(public.chat_inbox_projection.unread_count, EXCLUDED.unread_count) END,
      last_read_seq = CASE WHEN r_part.user_id = v_user THEN GREATEST(public.chat_inbox_projection.last_read_seq, EXCLUDED.last_read_seq) ELSE public.chat_inbox_projection.last_read_seq END,
      updated_at = now();

    v_user_stream := 'user:' || r_part.user_id::text || ':inbox';
    v_inbox_event_seq := public.chat_next_stream_seq(v_user_stream);

    INSERT INTO public.chat_events(
      stream_id,
      event_seq,
      scope,
      event_type,
      partition_key,
      dialog_id,
      actor_id,
      caused_by_device_id,
      caused_by_client_write_seq,
      caused_by_client_msg_id,
      payload_json,
      payload_hash
    ) VALUES (
      v_user_stream,
      v_inbox_event_seq,
      'user',
      'inbox.item_updated',
      r_part.user_id::text,
      p_dialog_id,
      v_user,
      p_device_id,
      p_client_write_seq,
      p_client_msg_id,
      jsonb_build_object(
        'dialog_id', p_dialog_id,
        'activity_seq', COALESCE(v_msg.seq, 0),
        'preview', v_preview,
        'unread_count', (SELECT i.unread_count FROM public.chat_inbox_projection i WHERE i.user_id = r_part.user_id AND i.dialog_id = p_dialog_id),
        'sort_key', (SELECT i.sort_key FROM public.chat_inbox_projection i WHERE i.user_id = r_part.user_id AND i.dialog_id = p_dialog_id)
      ),
      public.chat_sha256_hex(r_part.user_id::text || ':' || p_dialog_id::text || ':' || COALESCE(v_msg.seq::text, '0'))
    );
  END LOOP;

  SELECT EXISTS (
    SELECT 1 FROM public.chat_receipts r
    WHERE r.user_id = v_user
      AND r.device_id = p_device_id
      AND r.client_write_seq = p_client_write_seq
  ) INTO v_receipt_exists;

  IF NOT v_receipt_exists THEN
    INSERT INTO public.chat_receipts(
      user_id,
      device_id,
      client_write_seq,
      status,
      result_stream_id,
      result_event_seq
    ) VALUES (
      v_user,
      p_device_id,
      p_client_write_seq,
      'delivered',
      v_dialog_stream,
      v_dialog_event_seq
    );
  END IF;

  UPDATE public.chat_write_ledger l
  SET status = 'accepted',
      canonical_msg_id = v_msg.id,
      canonical_msg_seq = v_msg.seq,
      error_code = NULL,
      error_details = '{}'::jsonb,
      updated_at = now()
  WHERE l.actor_id = v_user
    AND l.device_id = p_device_id
    AND l.client_write_seq = p_client_write_seq;

  RETURN QUERY SELECT v_ack_id, 'accepted', p_dialog_id, v_msg.id, v_msg.seq, p_client_write_seq, now(), NULL::TEXT;
END;
$$;
