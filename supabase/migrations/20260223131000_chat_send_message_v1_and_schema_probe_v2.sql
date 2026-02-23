-- =============================================================================
-- Project B (Chats): RPC-only sends + monotonic ordering + schema probe v2
--
-- Goals:
-- - No client-side INSERT/UPSERT into public.messages.
-- - send_message_v1 enforces participant membership using auth.uid() internally.
-- - Strict idempotency via UNIQUE(conversation_id, sender_id, client_msg_id).
-- - Server assigns created_at and strictly monotonic seq (per conversation).
-- - chat_schema_probe_v2 blocks environment drift.
-- - Add basic server-side rate limiting (abuse resistance) WITHOUT granting table privileges.
--
-- Security:
-- - RLS stays enabled and unchanged (no weakening).
-- - SECURITY DEFINER functions lock search_path = public, pg_temp.
-- =============================================================================

-- 0) Ensure RLS is enabled (hardening; idempotent).
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 1) Ensure seq column exists and is NOT NULL for monotonic ordering.
-- Existing deployments may already have seq from 20260219090000_chat_seq_idempotency.sql.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS seq BIGINT;

-- Ensure rich message columns exist (used by the frontend already).
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- Backfill seq for any historical NULL seq rows.
-- Collision-safe: assigns after max(seq) per conversation.
WITH base AS (
  SELECT conversation_id, COALESCE(MAX(seq), 0) AS base_seq
  FROM public.messages
  GROUP BY conversation_id
),
ranked AS (
  SELECT
    m.id,
    m.conversation_id,
    b.base_seq,
    ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at ASC, m.id ASC) AS rn
  FROM public.messages m
  JOIN base b ON b.conversation_id = m.conversation_id
  WHERE m.seq IS NULL
)
UPDATE public.messages m
SET seq = r.base_seq + r.rn
FROM ranked r
WHERE m.id = r.id;

-- Resync conversations.last_message_seq to max(seq) after backfill.
UPDATE public.conversations c
SET last_message_seq = COALESCE(x.max_seq, 0)
FROM (
  SELECT conversation_id, MAX(seq) AS max_seq
  FROM public.messages
  GROUP BY conversation_id
) x
WHERE c.id = x.conversation_id;

-- Ensure per-conversation uniqueness of seq.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conv_seq_unique
  ON public.messages (conversation_id, seq);

-- Ensure seq is required going forward.
ALTER TABLE public.messages
  ALTER COLUMN seq SET NOT NULL;

-- 2) Ensure idempotency index exists.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS client_msg_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conv_sender_client_msg
  ON public.messages (conversation_id, sender_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;

-- 3) Tighten the seq assignment trigger function search_path.
-- (The logic itself already exists in 20260219090000_chat_seq_idempotency.sql)
CREATE OR REPLACE FUNCTION public.assign_message_seq_and_touch_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_seq BIGINT;
BEGIN
  UPDATE public.conversations
  SET
    last_message_seq = last_message_seq + 1,
    updated_at = now()
  WHERE id = NEW.conversation_id
  RETURNING last_message_seq INTO next_seq;

  IF next_seq IS NULL THEN
    RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = '22023';
  END IF;

  IF NEW.seq IS NULL THEN
    NEW.seq := next_seq;
  END IF;

  -- Server time only.
  NEW.created_at := now();

  RETURN NEW;
END;
$$;

-- 4) Abuse-resistant rate limiting table (server-only; no grants).
CREATE TABLE IF NOT EXISTS public.chat_rate_limits (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action, bucket_start)
);

ALTER TABLE public.chat_rate_limits ENABLE ROW LEVEL SECURITY;

-- No grants; only SECURITY DEFINER functions touch this.
REVOKE ALL ON TABLE public.chat_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.chat_rate_limits FROM anon;
REVOKE ALL ON TABLE public.chat_rate_limits FROM authenticated;

-- Helper: increment and enforce a fixed window limit.
CREATE OR REPLACE FUNCTION public.chat_rate_limit_check_v1(
  p_action TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_bucket TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_action IS NULL OR length(trim(p_action)) = 0 THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100000 THEN
    RAISE EXCEPTION 'invalid_limit' USING ERRCODE = '22023';
  END IF;

  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid_window' USING ERRCODE = '22023';
  END IF;

  v_bucket := date_trunc('second', now()) - make_interval(secs => (extract(epoch from date_trunc('second', now()))::bigint % p_window_seconds));

  INSERT INTO public.chat_rate_limits(user_id, action, bucket_start, count)
  VALUES (v_user, p_action, v_bucket, 1)
  ON CONFLICT (user_id, action, bucket_start)
  DO UPDATE SET count = public.chat_rate_limits.count + 1, updated_at = now()
  RETURNING count INTO v_count;

  IF v_count > p_limit THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_rate_limit_check_v1(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_rate_limit_check_v1(TEXT, INTEGER, INTEGER) TO authenticated;

-- 5) RPC-only message send: send_message_v1
-- Contract:
-- - initiator := auth.uid()
-- - validate initiator is participant
-- - idempotent on (conversation_id, initiator, client_msg_id)
-- - server assigns created_at + seq via trigger
-- - returns only msg_id + seq
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

  -- Optional structured payload in body (JSON) to support media/share without changing signature.
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

  -- Participant check (mandatory; SECURITY DEFINER bypasses RLS).
  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_id
      AND cp.user_id = initiator
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  -- Rate limit: 60 messages / 60s per user (tunable).
  PERFORM public.chat_rate_limit_check_v1('msg_send', 60, 60);

  -- Idempotency fast-path: return existing if already stored.
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

  -- Structured parsing (best-effort). If parsing fails, treat as plain text.
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

    IF final_content IS NULL OR length(btrim(final_content)) < 1 OR length(final_content) > 4000 THEN
      RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Insert idempotently; trigger assigns created_at + seq.
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
  ON CONFLICT (conversation_id, sender_id, client_msg_id)
  DO NOTHING
  RETURNING id, seq INTO inserted_id, inserted_seq;

  IF inserted_id IS NULL THEN
    -- Concurrent duplicate: fetch existing.
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

COMMENT ON FUNCTION public.send_message_v1(UUID, UUID, TEXT)
  IS 'Project B: RPC-only message send. Enforces membership, idempotency, server seq/time. Body may be plain text or a strict JSON envelope.';

-- 6) Environment integrity gate: chat_schema_probe_v2()
CREATE OR REPLACE FUNCTION public.chat_schema_probe_v2()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_get_or_create_dm BOOLEAN := FALSE;
  has_send_message_v1 BOOLEAN := FALSE;
  has_dm_uniqueness BOOLEAN := FALSE;
  has_seq_column BOOLEAN := FALSE;
  rls_messages BOOLEAN := FALSE;
  rls_participants BOOLEAN := FALSE;
  required_objects_present BOOLEAN := FALSE;
BEGIN
  -- Functions exist?
  has_get_or_create_dm := EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_or_create_dm'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid'
  );

  has_send_message_v1 := EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'send_message_v1'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, text'
  );

  -- DM uniqueness mechanism present?
  has_dm_uniqueness := EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'dm_pairs'
  );

  -- messages.seq exists?
  has_seq_column := EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'seq'
  );

  -- RLS enabled?
  rls_messages := EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'messages'
      AND c.relrowsecurity = true
  );

  rls_participants := EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'conversation_participants'
      AND c.relrowsecurity = true
  );

  required_objects_present := (
    has_get_or_create_dm
    AND has_send_message_v1
    AND has_dm_uniqueness
    AND has_seq_column
    AND rls_messages
    AND rls_participants
  );

  RETURN jsonb_build_object(
    'ok', required_objects_present,
    'schema_version', 2,
    'required_objects_present', required_objects_present,
    'server_time', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.chat_schema_probe_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_schema_probe_v2() TO authenticated;

COMMENT ON FUNCTION public.chat_schema_probe_v2()
  IS 'Project B: env integrity gate v2. Validates required RPCs, uniqueness mechanism, seq column and RLS enabled. No secrets.';
