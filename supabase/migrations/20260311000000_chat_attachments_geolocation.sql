-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- =============================================================================
-- 20260311000000_chat_attachments_geolocation.sql
-- Chat Attachments v2: Geolocation + Document + Live Location
--
-- Security model:
--   - All writes go through SECURITY DEFINER RPCs
--   - Zero direct client writes
--   - Coordinate validation: lat ∈ [-90, 90], lng ∈ [-180, 180]
--   - Live location: sender-only stop, TTL enforced by cron
--   - Rate limit shared with msg_send bucket (no separate bypass vector)
--   - RLS on live_locations: only conversation participants may read
--
-- Attack vectors mitigated:
--   - Coordinate spoofing: server-side range check (not client trust)
--   - Live location hijack: only original sender can update/stop
--   - Media URL injection: URL must start with /storage/v1/object/media/<uid>/
--   - DoS via live updates: rate_limit_check_v1 40/min per user
--   - Document type bypass: explicit allowlist enforcement
-- =============================================================================

-- ── 1. Schema additions to public.messages ─────────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS location_lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_lng  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_accuracy_m INTEGER,
  ADD COLUMN IF NOT EXISTS location_is_live    BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index: only live-location messages (small set for TTL worker)
CREATE INDEX IF NOT EXISTS idx_messages_live_location
  ON public.messages (id, conversation_id)
  WHERE location_is_live = TRUE;

-- ── 2. live_locations — real-time coordinate stream ────────────────────────
-- Stores latest position per (message_id, sender). Realtime-enabled.
-- NOT a position history — only current position. History = privacy risk.

CREATE TABLE IF NOT EXISTS public.live_locations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,  -- denorm for RLS; never changes
  sender_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  accuracy_m      INTEGER,
  heading_deg     SMALLINT,       -- 0-359; NULL if unknown
  speed_mps       REAL,           -- m/s; NULL if unknown
  expires_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at      TIMESTAMPTZ,    -- NULL = still live
  CONSTRAINT live_locations_lat_check CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT live_locations_lng_check CHECK (lng BETWEEN -180 AND 180),
  CONSTRAINT live_locations_accuracy_check CHECK (accuracy_m IS NULL OR (accuracy_m >= 0 AND accuracy_m <= 100000)),
  CONSTRAINT live_locations_heading_check CHECK (heading_deg IS NULL OR (heading_deg >= 0 AND heading_deg <= 359)),
  CONSTRAINT live_locations_speed_check CHECK (speed_mps IS NULL OR speed_mps >= 0)
  -- NOTE: no expiry CHECK here — CHECK constraints with now() re-evaluate on every UPDATE,
  -- which would cause check_violation when stop_live_location_v1 / TTL worker touches
  -- expired rows. Live-duration is enforced in send_message_v1 RPC (60s..28800s).
);

-- One live record per message (UPSERT target)
CREATE UNIQUE INDEX IF NOT EXISTS live_locations_message_id_uniq
  ON public.live_locations (message_id);

-- Index for TTL sweep worker
CREATE INDEX IF NOT EXISTS live_locations_expires_at_idx
  ON public.live_locations (expires_at)
  WHERE stopped_at IS NULL;

ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;

-- RLS: Only conversation participants can read live locations
CREATE POLICY live_locations_select ON public.live_locations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = public.live_locations.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

-- No direct INSERT/UPDATE/DELETE for authenticated users — only via RPCs
REVOKE INSERT, UPDATE, DELETE ON TABLE public.live_locations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.live_locations FROM anon;

-- ── 3. extend send_message_v1 to handle kind='location' and kind='document' ─
-- Re-create the function adding two new kind branches.
-- Existing branches (text, media, share_post, share_reel) preserved verbatim.

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

  IF payload IS NOT NULL THEN
    kind := coalesce(payload->>'kind', '');

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

    END IF;

    IF final_content IS NULL OR length(btrim(final_content)) < 1 OR length(final_content) > 4000 THEN
      RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Insert message
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
    location_is_live
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
    final_loc_is_live
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

-- ── 4. update_live_location_v1 ─────────────────────────────────────────────
-- Called by sender every 30s while sharing live location.
-- Attack vectors:
--   - Only sender can update (sender_id = auth.uid() enforced)
--   - Cannot extend expiry beyond original TTL (no replay extension)
--   - Coordinate validation server-side
--   - Rate limit: 40/min (one update per 1.5s minimum, real GPS is ~1/s)

CREATE OR REPLACE FUNCTION public.update_live_location_v1(
  p_message_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_accuracy_m INTEGER DEFAULT NULL,
  p_heading_deg SMALLINT DEFAULT NULL,
  p_speed_mps REAL DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender UUID := auth.uid();
  v_expires TIMESTAMPTZ;
  v_stopped TIMESTAMPTZ;
BEGIN
  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'invalid_message_id' USING ERRCODE = '22023';
  END IF;

  -- Coordinate validation
  IF p_lat NOT BETWEEN -90 AND 90 THEN
    RAISE EXCEPTION 'invalid_latitude' USING ERRCODE = '22023';
  END IF;
  IF p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'invalid_longitude' USING ERRCODE = '22023';
  END IF;
  IF p_accuracy_m IS NOT NULL AND (p_accuracy_m < 0 OR p_accuracy_m > 100000) THEN
    RAISE EXCEPTION 'invalid_accuracy' USING ERRCODE = '22023';
  END IF;
  IF p_heading_deg IS NOT NULL AND (p_heading_deg < 0 OR p_heading_deg > 359) THEN
    RAISE EXCEPTION 'invalid_heading' USING ERRCODE = '22023';
  END IF;
  IF p_speed_mps IS NOT NULL AND p_speed_mps < 0 THEN
    RAISE EXCEPTION 'invalid_speed' USING ERRCODE = '22023';
  END IF;

  -- Rate limit: 40 updates / 60s (generous, GPS is 1Hz max on mobile)
  PERFORM public.chat_rate_limit_check_v1('live_loc_update', 40, 60);

  -- Fetch record ensuring ownership + active state
  SELECT ll.expires_at, ll.stopped_at
    INTO v_expires, v_stopped
  FROM public.live_locations ll
  WHERE ll.message_id = p_message_id
    AND ll.sender_id = v_sender;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'live_location_not_found' USING ERRCODE = '42703';
  END IF;

  IF v_stopped IS NOT NULL THEN
    RAISE EXCEPTION 'live_location_stopped' USING ERRCODE = 'P0001';
  END IF;

  IF v_expires <= now() THEN
    RAISE EXCEPTION 'live_location_expired' USING ERRCODE = 'P0001';
  END IF;

  -- Update position — do NOT extend expires_at (prevents TTL replay)
  UPDATE public.live_locations
  SET
    lat         = p_lat,
    lng         = p_lng,
    accuracy_m  = p_accuracy_m,
    heading_deg = p_heading_deg,
    speed_mps   = p_speed_mps,
    updated_at  = now()
  WHERE message_id = p_message_id
    AND sender_id  = v_sender;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'expires_at', v_expires,
    'updated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_live_location_v1(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, SMALLINT, REAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_live_location_v1(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, SMALLINT, REAL) TO authenticated;

-- ── 5. stop_live_location_v1 ───────────────────────────────────────────────
-- Sender explicitly stops sharing. Also marks message as non-live.

CREATE OR REPLACE FUNCTION public.stop_live_location_v1(
  p_message_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender UUID := auth.uid();
  v_rows   INTEGER;
BEGIN
  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'invalid_message_id' USING ERRCODE = '22023';
  END IF;

  UPDATE public.live_locations
  SET stopped_at = now(),
      updated_at = now()
  WHERE message_id = p_message_id
    AND sender_id  = v_sender
    AND stopped_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- Either not found or already stopped — idempotent OK
    IF NOT EXISTS (
      SELECT 1 FROM public.live_locations
      WHERE message_id = p_message_id AND sender_id = v_sender
    ) THEN
      RAISE EXCEPTION 'live_location_not_found' USING ERRCODE = '42703';
    END IF;
  END IF;

  -- Mark parent message as no longer live
  UPDATE public.messages
  SET location_is_live = FALSE
  WHERE id = p_message_id
    AND sender_id = v_sender;

  RETURN jsonb_build_object('ok', TRUE, 'stopped_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.stop_live_location_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stop_live_location_v1(UUID) TO authenticated;

-- ── 6. get_live_location_v1 ────────────────────────────────────────────────
-- Read latest live position for a message.
-- RLS enforced: caller must be conversation participant (via live_locations policy).

CREATE OR REPLACE FUNCTION public.get_live_location_v1(
  p_message_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_row public.live_locations;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- RLS check: must be conversation participant
  SELECT ll.* INTO v_row
  FROM public.live_locations ll
  WHERE ll.message_id = p_message_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = ll.conversation_id
        AND cp.user_id = v_caller
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'live_location_not_found_or_access_denied' USING ERRCODE = '42703';
  END IF;

  RETURN jsonb_build_object(
    'message_id',  v_row.message_id,
    'sender_id',   v_row.sender_id,
    'lat',         v_row.lat,
    'lng',         v_row.lng,
    'accuracy_m',  v_row.accuracy_m,
    'heading_deg', v_row.heading_deg,
    'speed_mps',   v_row.speed_mps,
    'expires_at',  v_row.expires_at,
    'updated_at',  v_row.updated_at,
    'is_active',   (v_row.stopped_at IS NULL AND v_row.expires_at > now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_live_location_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_location_v1(UUID) TO authenticated;

-- ── 7. TTL sweep: expire_live_locations_v1 ────────────────────────────────
-- Called by pg_cron every 5 minutes. Marks expired live locations as stopped.
-- SECURITY DEFINER + no auth.uid() dependency: runs as migration owner.

CREATE OR REPLACE FUNCTION public.expire_live_locations_v1()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Stop expired live locations
  WITH expired AS (
    UPDATE public.live_locations
    SET stopped_at = now(),
        updated_at = now()
    WHERE stopped_at IS NULL
      AND expires_at <= now()
    RETURNING message_id, sender_id
  )
  UPDATE public.messages m
  SET location_is_live = FALSE
  FROM expired e
  WHERE m.id = e.message_id
    AND m.sender_id = e.sender_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- No public grant needed — called only by pg_cron or internal job
REVOKE ALL ON FUNCTION public.expire_live_locations_v1() FROM PUBLIC;

-- Schedule TTL sweep every 5 minutes (pg_cron must be installed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'expire-live-locations',
      '*/5 * * * *',
      'SELECT public.expire_live_locations_v1()'
    );
  END IF;
EXCEPTION WHEN others THEN
  -- pg_cron not available in all environments; skip silently
  NULL;
END$$;

-- ── 8. Storage bucket policies for 'media' ─────────────────────────────────
-- Users may upload only to their own prefix: media/<uid>/...
-- Prevents one user from overwriting another user's objects.

DO $$
BEGIN
  -- Create bucket if missing (idempotent)
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'media', 'media', FALSE, 104857600, -- 100 MB
    ARRAY[
      'image/jpeg','image/png','image/gif','image/webp',
      'video/mp4','video/webm','video/quicktime',
      'audio/mpeg','audio/ogg','audio/webm','audio/mp4',
      'application/pdf',
      'application/zip','application/x-zip-compressed',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ]
  )
  ON CONFLICT (id) DO UPDATE
    SET file_size_limit   = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION WHEN undefined_table THEN
  -- Storage extension not present; skip
  NULL;
END$$;

-- Storage RLS: upload only to own prefix
DO $$
BEGIN
  DROP POLICY IF EXISTS "media_upload_own_prefix" ON storage.objects;
  CREATE POLICY "media_upload_own_prefix" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'media'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  DROP POLICY IF EXISTS "media_select_own" ON storage.objects;
  CREATE POLICY "media_select_own" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'media'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  DROP POLICY IF EXISTS "media_delete_own" ON storage.objects;
  CREATE POLICY "media_delete_own" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'media'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN undefined_table THEN
  NULL;
END$$;

-- ── 9. Enable Realtime replication on live_locations ──────────────────────
-- Allows clients to subscribe to live position updates via Supabase Realtime.
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_locations;

COMMENT ON TABLE public.live_locations
  IS 'Real-time live location stream. One row per active share. Updated in-place (not append). Realtime subscription enabled. TTL enforced by expire_live_locations_v1 pg_cron job.';

COMMENT ON FUNCTION public.send_message_v1(UUID, UUID, TEXT)
  IS 'RPC-only message send. Handles kinds: text, media (image/video/voice/video_circle), document, location (static+live), share_post, share_reel. Zero client direct writes.';
