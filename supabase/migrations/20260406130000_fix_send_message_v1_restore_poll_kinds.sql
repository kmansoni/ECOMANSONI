-- Фикс регрессии: миграция 20260405100000 перезаписала send_message_v1,
-- потеряв поддержку kind='poll','sticker','gif','gift','contact','document','location'
-- из миграции 20260402120000.
-- Данная миграция объединяет: все kind-ветки + seq assignment + metadata.
-- Также добавляет INSERT RLS policy для poll_options (ранее отсутствовала).

-- ── 1. Восстановленная send_message_v1 (3-arg) ─────────────────────────

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

  -- Блокировка строки conversation для детерминированного seq
  SELECT c.server_seq
  INTO current_seq
  FROM public.conversations c
  WHERE c.id = send_message_v1.conversation_id
  FOR UPDATE;

  IF current_seq IS NULL THEN
    RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = '22023';
  END IF;

  -- Идемпотентность
  SELECT m.id, m.seq
  INTO existing_id, existing_seq
  FROM public.messages m
  WHERE m.conversation_id = send_message_v1.conversation_id
    AND m.sender_id = initiator
    AND m.client_msg_id = send_message_v1.client_msg_id
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    PERFORM public.rpc_audit_write_v1('send_message_v1', conversation_id, client_msg_id, NULL, 'duplicate', NULL);
    message_id := existing_id;
    seq := existing_seq;
    RETURN NEXT;
    RETURN;
  END IF;

  -- JSON envelope parsing
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

    -- metadata (album_id, self_destruct, etc.)
    IF payload ? 'metadata' AND jsonb_typeof(payload->'metadata') = 'object' THEN
      final_metadata := payload->'metadata';
    END IF;

    -- message_effect
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
      IF final_content = '' THEN final_content := '📎'; END IF;
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
      final_content    := btrim(coalesce(payload->>'filename', coalesce(payload->>'text', '📄 Документ')));
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
      final_content := '📍 Геолокация';

    ELSIF kind = 'share_post' THEN
      final_shared_post := (payload->>'shared_post_id')::uuid;
      IF final_shared_post IS NULL THEN
        final_shared_post := (payload->>'post_id')::uuid;
      END IF;
      final_content := btrim(coalesce(payload->>'text', '📌 Пост'));

    ELSIF kind = 'share_reel' THEN
      final_shared_reel := (payload->>'shared_reel_id')::uuid;
      IF final_shared_reel IS NULL THEN
        final_shared_reel := (payload->>'reel_id')::uuid;
      END IF;
      final_content := btrim(coalesce(payload->>'text', '🎬 Рилс'));

    ELSIF kind = 'sticker' THEN
      final_media_url  := btrim(coalesce(payload->>'media_url', ''));
      final_media_type := 'sticker';
      final_content    := '🎭 Стикер';
      IF length(final_media_url) < 1 OR length(final_media_url) > 2048 THEN
        RAISE EXCEPTION 'invalid_media_url' USING ERRCODE = '22023';
      END IF;
      IF NOT (final_media_url LIKE 'https://%' OR final_media_url LIKE '/storage/%') THEN
        RAISE EXCEPTION 'invalid_sticker_url' USING ERRCODE = '22023';
      END IF;

    ELSIF kind = 'gif' THEN
      final_media_url  := btrim(coalesce(payload->>'media_url', ''));
      final_media_type := 'gif';
      final_content    := 'GIF';
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
      final_content    := '📊 Опрос';
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
  ON CONFLICT (conversation_id, sender_id, client_msg_id)
  DO NOTHING
  RETURNING id, messages.seq INTO inserted_id, inserted_seq;

  IF inserted_id IS NULL THEN
    SELECT m.id, m.seq
      INTO inserted_id, inserted_seq
    FROM public.messages m
    WHERE m.conversation_id = send_message_v1.conversation_id
      AND m.sender_id = initiator
      AND m.client_msg_id = send_message_v1.client_msg_id
    LIMIT 1;
  END IF;

  IF inserted_id IS NULL THEN
    PERFORM public.rpc_audit_write_v1('send_message_v1', conversation_id, client_msg_id, NULL, 'error', 'send_failed');
    RAISE EXCEPTION 'send_failed' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.conversations
  SET
    server_seq = new_seq,
    last_message_seq = GREATEST(last_message_seq, new_seq),
    updated_at = now()
  WHERE id = send_message_v1.conversation_id;

  -- Live location: начальная запись
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

REVOKE ALL ON FUNCTION public.send_message_v1(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message_v1(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.send_message_v1(UUID, UUID, TEXT)
  IS 'Отправка сообщения: text, media, document, location, share_post, share_reel, sticker, gif, gift, poll, contact + seq + metadata + message_effect';

-- ── 2. poll_options: INSERT policy для создателей опросов ────────────────

DO $$ BEGIN
  CREATE POLICY "Poll creator can insert options"
    ON public.poll_options
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.message_polls mp
        WHERE mp.id = poll_options.poll_id
          AND mp.creator_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. poll_options: UPDATE policy (для vote_poll_v1 через SECURITY DEFINER не нужна,
--       но на случай прямых обновлений — разрешаем только создателю) ──────

DO $$ BEGIN
  CREATE POLICY "Poll creator can update options"
    ON public.poll_options
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.message_polls mp
        WHERE mp.id = poll_options.poll_id
          AND mp.creator_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
