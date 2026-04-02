-- Расширение send_message_v1: добавление kind='sticker', 'gif', 'gift', 'poll', 'contact'
-- Fix: фронтенд отправлял эти типы через kind='media', но RPC отклонял их.
-- Additive migration: CREATE OR REPLACE сохраняет существующие ветки, добавляет новые.
-- Также добавлен poll_id в INSERT, который ранее отсутствовал.
-- Атомарная поддержка message_effect: ранее эффект обновлялся отдельным UPDATE после отправки,
-- что ненадёжно при обрыве сети. Теперь эффект включается в INSERT атомарно.

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

  -- Participant check
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = send_message_v1.conversation_id
      AND cp.user_id = initiator
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  -- Rate limit: 60 messages / 60s per user
  PERFORM public.chat_rate_limit_check_v1('msg_send', 60, 60);

  -- Idempotency fast-path
  SELECT m.id, m.seq
    INTO inserted_id, inserted_seq
  FROM public.messages m
  WHERE m.conversation_id = send_message_v1.conversation_id
    AND m.sender_id = initiator
    AND m.client_msg_id = send_message_v1.client_msg_id
  LIMIT 1;

  IF inserted_id IS NOT NULL THEN
    message_id := inserted_id;
    seq := inserted_seq;
    RETURN NEXT;
    RETURN;
  END IF;

  -- JSON envelope parsing (best-effort; fallback to plain text)
  BEGIN
    IF left(trimmed, 1) = '{' THEN
      payload := trimmed::jsonb;
    ELSE
      payload := NULL;
    END IF;
  EXCEPTION WHEN others THEN
    payload := NULL;
  END;

  final_content    := trimmed;
  final_media_url  := NULL;
  final_media_type := NULL;
  final_duration   := NULL;
  final_shared_post := NULL;
  final_shared_reel := NULL;
  final_loc_lat    := NULL;
  final_loc_lng    := NULL;
  final_loc_acc    := NULL;
  final_loc_is_live := FALSE;
  final_poll_id    := NULL;
  final_effect     := NULL;

  IF payload IS NOT NULL THEN
    kind := coalesce(payload->>'kind', '');

    -- Парсинг message_effect (атомарно с INSERT)
    final_effect := btrim(coalesce(payload->>'message_effect', ''));
    IF final_effect = '' THEN
      final_effect := NULL;
    END IF;
    IF final_effect IS NOT NULL AND final_effect NOT IN ('confetti', 'fire', 'hearts', 'thumbsup') THEN
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

      -- Enforce storage URL ownership: must start with /storage/v1/object/media/<uid>/
      IF NOT (final_media_url LIKE '/storage/v1/object/media/' || initiator::text || '/%'
           OR final_media_url LIKE 'https://%/storage/v1/object/media/' || initiator::text || '/%') THEN
        RAISE EXCEPTION 'media_url_ownership_violation' USING ERRCODE = '42501';
      END IF;

    ELSIF kind = 'document' THEN
      -- File attachments: PDF, archives, office docs, etc.
      final_media_type := 'document';
      final_media_url  := btrim(coalesce(payload->>'media_url', ''));
      final_content    := btrim(coalesce(payload->>'filename', coalesce(payload->>'text', '📄 Документ')));
      final_duration   := NULL;

      IF length(final_media_url) < 1 OR length(final_media_url) > 2048 THEN
        RAISE EXCEPTION 'invalid_media_url' USING ERRCODE = '22023';
      END IF;

      -- Enforce storage ownership
      IF NOT (final_media_url LIKE '/storage/v1/object/media/' || initiator::text || '/%'
           OR final_media_url LIKE 'https://%/storage/v1/object/media/' || initiator::text || '/%') THEN
        RAISE EXCEPTION 'media_url_ownership_violation' USING ERRCODE = '42501';
      END IF;

    ELSIF kind = 'location' THEN
      -- Static or live geolocation
      final_loc_lat := (payload->>'lat')::double precision;
      final_loc_lng := (payload->>'lng')::double precision;
      final_loc_acc := (payload->>'accuracy_m')::integer;
      final_loc_is_live := coalesce((payload->>'is_live')::boolean, FALSE);
      live_duration_secs := coalesce((payload->>'live_duration_seconds')::integer, 900); -- default 15 min

      -- Hard coordinate validation (not client trust)
      IF final_loc_lat IS NULL OR final_loc_lat NOT BETWEEN -90 AND 90 THEN
        RAISE EXCEPTION 'invalid_latitude' USING ERRCODE = '22023';
      END IF;
      IF final_loc_lng IS NULL OR final_loc_lng NOT BETWEEN -180 AND 180 THEN
        RAISE EXCEPTION 'invalid_longitude' USING ERRCODE = '22023';
      END IF;
      IF final_loc_acc IS NOT NULL AND (final_loc_acc < 0 OR final_loc_acc > 100000) THEN
        RAISE EXCEPTION 'invalid_accuracy' USING ERRCODE = '22023';
      END IF;
      -- Live duration: 1 min .. 8 hours
      IF final_loc_is_live AND (live_duration_secs < 60 OR live_duration_secs > 28800) THEN
        RAISE EXCEPTION 'invalid_live_duration' USING ERRCODE = '22023';
      END IF;

      final_content := '📍 Геолокация';

    ELSIF kind = 'share_post' THEN
      final_shared_post := (payload->>'post_id')::uuid;
      final_content := btrim(coalesce(payload->>'text', '📌 Пост'));

    ELSIF kind = 'share_reel' THEN
      final_shared_reel := (payload->>'reel_id')::uuid;
      final_content := btrim(coalesce(payload->>'text', '🎬 Рилс'));

    -- ── Новые kind-ветки ──────────────────────────────────────────────────

    ELSIF kind = 'sticker' THEN
      -- Стикер из стикерпака (CDN / storage URL, ownership-проверка НЕ нужна)
      final_media_url  := btrim(coalesce(payload->>'media_url', ''));
      final_media_type := 'sticker';
      final_content    := '🎭 Стикер';

      IF length(final_media_url) < 1 OR length(final_media_url) > 2048 THEN
        RAISE EXCEPTION 'invalid_media_url' USING ERRCODE = '22023';
      END IF;

      -- Стикеры приходят из CDN (https://) или из shared storage (/storage/)
      IF NOT (final_media_url LIKE 'https://%' OR final_media_url LIKE '/storage/%') THEN
        RAISE EXCEPTION 'invalid_sticker_url' USING ERRCODE = '22023';
      END IF;

    ELSIF kind = 'gif' THEN
      -- GIF от внешнего сервиса (Tenor / Giphy), ownership-проверка НЕ нужна
      final_media_url  := btrim(coalesce(payload->>'media_url', ''));
      final_media_type := 'gif';
      final_content    := 'GIF';

      IF length(final_media_url) < 1 OR length(final_media_url) > 2048 THEN
        RAISE EXCEPTION 'invalid_media_url' USING ERRCODE = '22023';
      END IF;

      -- GIF должен быть HTTPS URL (защита от data:/file:/http:// tracking pixel)
      IF NOT (final_media_url LIKE 'https://%') THEN
        RAISE EXCEPTION 'invalid_gif_url' USING ERRCODE = '22023';
      END IF;

    ELSIF kind = 'gift' THEN
      -- Подарок: payload = JSON с gift_emoji, gift_name, gift_rarity, stars_spent, sent_gift_id, is_opened
      -- Весь payload сохраняется как content (JSON-строка)
      final_media_type := 'gift';
      final_content    := payload::text;

      IF length(final_content) < 1 OR length(final_content) > 4000 THEN
        RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
      END IF;

    ELSIF kind = 'poll' THEN
      -- Опрос: ссылка на существующий poll
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
      -- Контакт: payload->'contact' содержит { name, phone }
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

  -- Insert message (poll_id + message_effect добавлены)
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
    location_lat,
    location_lng,
    location_accuracy_m,
    location_is_live,
    poll_id,
    message_effect
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
    final_loc_lat,
    final_loc_lng,
    final_loc_acc,
    final_loc_is_live,
    final_poll_id,
    final_effect
  )
  ON CONFLICT (conversation_id, sender_id, client_msg_id) DO NOTHING
  RETURNING id, seq INTO inserted_id, inserted_seq;

  IF inserted_id IS NULL THEN
    -- Concurrent duplicate: fetch existing
    SELECT m.id, m.seq INTO inserted_id, inserted_seq
    FROM public.messages m
    WHERE m.conversation_id = send_message_v1.conversation_id
      AND m.sender_id = initiator
      AND m.client_msg_id = send_message_v1.client_msg_id
    LIMIT 1;
  END IF;

  IF inserted_id IS NULL THEN
    RAISE EXCEPTION 'send_failed' USING ERRCODE = 'P0001';
  END IF;

  -- If live location: insert initial live_locations row
  IF final_loc_is_live AND final_loc_lat IS NOT NULL THEN
    INSERT INTO public.live_locations(
      message_id, conversation_id, sender_id,
      lat, lng, accuracy_m, expires_at
    ) VALUES (
      inserted_id,
      send_message_v1.conversation_id,
      initiator,
      final_loc_lat,
      final_loc_lng,
      final_loc_acc,
      now() + make_interval(secs => live_duration_secs)
    )
    ON CONFLICT (message_id) DO NOTHING;
  END IF;

  message_id := inserted_id;
  seq := inserted_seq;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.send_message_v1(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message_v1(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.send_message_v1(UUID, UUID, TEXT)
  IS 'Отправка сообщения с поддержкой kind: text, media, document, location, share_post, share_reel, sticker, gif, gift, poll, contact + message_effect';
