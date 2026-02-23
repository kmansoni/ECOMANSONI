-- =============================================================================
-- Project B (Chats): server-first seq + ACK cursors + inbox rollup + audit (v3)
--
-- Requirements (from spec):
-- - Server-first deterministic ordering: seq is the ONLY ordering primitive.
-- - seq is strictly monotonic per conversation, assigned in a server transaction.
-- - ACK semantics: durable commit (RPC return), delivered cursor, read cursor.
-- - Inbox without N+1: single RPC query.
-- - Audit logging for RPC metadata only (no content).
-- - RLS stays enabled (no weakening).
-- =============================================================================

-- 0) Hardening: ensure RLS is enabled (idempotent).
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 1) Conversations: canonical server seq counter.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS server_seq BIGINT NOT NULL DEFAULT 0;

-- Backfill server_seq from existing last_message_seq / messages.seq.
UPDATE public.conversations c
SET server_seq = GREATEST(
  COALESCE(c.last_message_seq, 0),
  COALESCE(x.max_seq, 0)
)
FROM (
  SELECT conversation_id, MAX(seq) AS max_seq
  FROM public.messages
  GROUP BY conversation_id
) x
WHERE c.id = x.conversation_id
  AND c.server_seq = 0;

-- 2) Ensure messages.seq is NOT NULL and uniqueness is strict.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS seq BIGINT;

ALTER TABLE public.messages
  ALTER COLUMN seq SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conv_seq_unique_strict
  ON public.messages (conversation_id, seq);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conv_sender_client_msg
  ON public.messages (conversation_id, sender_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;

-- 3) Seq assignment trigger: keep compatibility for server-side direct inserts,
--    but avoid double-increment when seq is explicitly provided by RPC.
CREATE OR REPLACE FUNCTION public.assign_message_seq_and_touch_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_seq BIGINT;
BEGIN
  -- If seq is already provided, do NOT touch counters here.
  -- (RPC path is responsible for server_seq/updated_at.)
  IF NEW.seq IS NOT NULL THEN
    IF NEW.created_at IS NULL THEN
      NEW.created_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- Server-side inserts without seq (legacy server paths): assign deterministically.
  -- Row lock is taken via UPDATE on the conversation row.
  UPDATE public.conversations
  SET
    server_seq = server_seq + 1,
    last_message_seq = GREATEST(last_message_seq + 1, server_seq + 1),
    updated_at = now()
  WHERE id = NEW.conversation_id
  RETURNING server_seq INTO next_seq;

  IF next_seq IS NULL THEN
    RAISE EXCEPTION 'Conversation % not found', NEW.conversation_id USING ERRCODE = '22023';
  END IF;

  NEW.seq := next_seq;
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_assign_seq_touch_conversation ON public.messages;
CREATE TRIGGER trg_messages_assign_seq_touch_conversation
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.assign_message_seq_and_touch_conversation();

-- 4) Cursors: delivered/read per user per conversation.
CREATE TABLE IF NOT EXISTS public.conversation_cursors (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivered_up_to_seq BIGINT NOT NULL DEFAULT 0,
  read_up_to_seq BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE public.conversation_cursors ENABLE ROW LEVEL SECURITY;

-- Minimal RLS policies: users can read/update their own cursor if they are participants.
DROP POLICY IF EXISTS conversation_cursors_select_self ON public.conversation_cursors;
CREATE POLICY conversation_cursors_select_self
ON public.conversation_cursors FOR SELECT
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_cursors.conversation_id
      AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS conversation_cursors_upsert_self ON public.conversation_cursors;
CREATE POLICY conversation_cursors_upsert_self
ON public.conversation_cursors FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_cursors.conversation_id
      AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS conversation_cursors_update_self ON public.conversation_cursors;
CREATE POLICY conversation_cursors_update_self
ON public.conversation_cursors FOR UPDATE
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_cursors.conversation_id
      AND cp.user_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
);

-- 5) Inbox rollup: conversation_state (materialized latest message metadata).
CREATE TABLE IF NOT EXISTS public.conversation_state (
  conversation_id UUID PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  last_seq BIGINT NOT NULL DEFAULT 0,
  last_message_id UUID NULL REFERENCES public.messages(id) ON DELETE SET NULL,
  last_sender_id UUID NULL,
  last_preview_text TEXT NULL,
  last_created_at TIMESTAMPTZ NULL,
  last_media_kind TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_state ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_conversation_state_last_seq
  ON public.conversation_state (last_seq DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_state_last_created_at
  ON public.conversation_state (last_created_at DESC);

-- Only participants can SELECT conversation_state.
DROP POLICY IF EXISTS conversation_state_select_participants ON public.conversation_state;
CREATE POLICY conversation_state_select_participants
ON public.conversation_state FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_state.conversation_id
      AND cp.user_id = auth.uid()
  )
);

-- No direct writes from clients.
REVOKE ALL ON TABLE public.conversation_state FROM anon;
REVOKE ALL ON TABLE public.conversation_state FROM authenticated;

CREATE OR REPLACE FUNCTION public.update_conversation_state_from_message_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind TEXT;
  v_preview TEXT;
BEGIN
  v_preview := COALESCE(NULLIF(btrim(NEW.content), ''), '');
  IF length(v_preview) > 180 THEN
    v_preview := left(v_preview, 177) || '...';
  END IF;

  v_kind := CASE
    WHEN NEW.shared_post_id IS NOT NULL THEN 'share_post'
    WHEN NEW.shared_reel_id IS NOT NULL THEN 'share_reel'
    WHEN NEW.media_url IS NOT NULL OR NEW.media_type IS NOT NULL THEN 'media'
    ELSE 'text'
  END;

  INSERT INTO public.conversation_state(
    conversation_id,
    last_seq,
    last_message_id,
    last_sender_id,
    last_preview_text,
    last_created_at,
    last_media_kind,
    updated_at
  )
  VALUES (
    NEW.conversation_id,
    NEW.seq,
    NEW.id,
    NEW.sender_id,
    v_preview,
    NEW.created_at,
    v_kind,
    now()
  )
  ON CONFLICT (conversation_id)
  DO UPDATE SET
    last_seq = GREATEST(public.conversation_state.last_seq, EXCLUDED.last_seq),
    last_message_id = CASE WHEN EXCLUDED.last_seq >= public.conversation_state.last_seq THEN EXCLUDED.last_message_id ELSE public.conversation_state.last_message_id END,
    last_sender_id = CASE WHEN EXCLUDED.last_seq >= public.conversation_state.last_seq THEN EXCLUDED.last_sender_id ELSE public.conversation_state.last_sender_id END,
    last_preview_text = CASE WHEN EXCLUDED.last_seq >= public.conversation_state.last_seq THEN EXCLUDED.last_preview_text ELSE public.conversation_state.last_preview_text END,
    last_created_at = CASE WHEN EXCLUDED.last_seq >= public.conversation_state.last_seq THEN EXCLUDED.last_created_at ELSE public.conversation_state.last_created_at END,
    last_media_kind = CASE WHEN EXCLUDED.last_seq >= public.conversation_state.last_seq THEN EXCLUDED.last_media_kind ELSE public.conversation_state.last_media_kind END,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_state_from_message_v1 ON public.messages;
CREATE TRIGGER trg_conversation_state_from_message_v1
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_conversation_state_from_message_v1();

-- 6) RPC audit log (metadata only).
CREATE TABLE IF NOT EXISTS public.rpc_audit_log (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID NULL,
  rpc_name TEXT NOT NULL,
  conversation_id UUID NULL,
  client_msg_id UUID NULL,
  request_id UUID NULL,
  result TEXT NOT NULL,
  error_code TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_rpc_audit_ts ON public.rpc_audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_rpc_audit_actor ON public.rpc_audit_log(actor_user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_rpc_audit_conv ON public.rpc_audit_log(conversation_id, ts DESC);

ALTER TABLE public.rpc_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rpc_audit_log FROM anon;
REVOKE ALL ON TABLE public.rpc_audit_log FROM authenticated;

CREATE OR REPLACE FUNCTION public.rpc_audit_write_v1(
  p_rpc_name TEXT,
  p_conversation_id UUID,
  p_client_msg_id UUID,
  p_request_id UUID,
  p_result TEXT,
  p_error_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    INSERT INTO public.rpc_audit_log(actor_user_id, rpc_name, conversation_id, client_msg_id, request_id, result, error_code)
    VALUES (auth.uid(), p_rpc_name, p_conversation_id, p_client_msg_id, p_request_id, p_result, p_error_code);
  EXCEPTION WHEN OTHERS THEN
    -- Best effort: never block the main flow.
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_audit_write_v1(TEXT, UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_audit_write_v1(TEXT, UUID, UUID, UUID, TEXT, TEXT) TO authenticated;

-- 7) ACK RPCs.
CREATE OR REPLACE FUNCTION public.ack_delivered_v1(
  p_conversation_id UUID,
  p_up_to_seq BIGINT
)
RETURNS TABLE (
  conversation_id UUID,
  user_id UUID,
  delivered_up_to_seq BIGINT,
  read_up_to_seq BIGINT,
  server_time TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_delivered BIGINT;
  v_read BIGINT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_conversation' USING ERRCODE = '22023';
  END IF;
  IF p_up_to_seq IS NULL OR p_up_to_seq < 0 THEN
    RAISE EXCEPTION 'invalid_seq' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.conversation_cursors(conversation_id, user_id, delivered_up_to_seq, read_up_to_seq, updated_at)
  VALUES (p_conversation_id, v_user, p_up_to_seq, 0, now())
  ON CONFLICT (conversation_id, user_id)
  DO UPDATE SET
    delivered_up_to_seq = GREATEST(public.conversation_cursors.delivered_up_to_seq, EXCLUDED.delivered_up_to_seq),
    updated_at = now()
  RETURNING public.conversation_cursors.delivered_up_to_seq, public.conversation_cursors.read_up_to_seq
  INTO v_delivered, v_read;

  PERFORM public.rpc_audit_write_v1('ack_delivered_v1', p_conversation_id, NULL, NULL, 'ok', NULL);

  conversation_id := p_conversation_id;
  user_id := v_user;
  delivered_up_to_seq := v_delivered;
  read_up_to_seq := v_read;
  server_time := now();
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.ack_delivered_v1(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ack_delivered_v1(UUID, BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.ack_read_v1(
  p_conversation_id UUID,
  p_up_to_seq BIGINT
)
RETURNS TABLE (
  conversation_id UUID,
  user_id UUID,
  delivered_up_to_seq BIGINT,
  read_up_to_seq BIGINT,
  server_time TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_delivered BIGINT;
  v_read BIGINT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_conversation' USING ERRCODE = '22023';
  END IF;
  IF p_up_to_seq IS NULL OR p_up_to_seq < 0 THEN
    RAISE EXCEPTION 'invalid_seq' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  -- Ensure a row exists.
  INSERT INTO public.conversation_cursors(conversation_id, user_id)
  VALUES (p_conversation_id, v_user)
  ON CONFLICT DO NOTHING;

  SELECT delivered_up_to_seq, read_up_to_seq
  INTO v_delivered, v_read
  FROM public.conversation_cursors
  WHERE conversation_id = p_conversation_id
    AND user_id = v_user
  LIMIT 1;

  IF p_up_to_seq > COALESCE(v_delivered, 0) THEN
    RAISE EXCEPTION 'read_gt_delivered' USING ERRCODE = '22023';
  END IF;

  UPDATE public.conversation_cursors
  SET
    read_up_to_seq = GREATEST(read_up_to_seq, p_up_to_seq),
    updated_at = now()
  WHERE conversation_id = p_conversation_id
    AND user_id = v_user
  RETURNING delivered_up_to_seq, read_up_to_seq
  INTO v_delivered, v_read;

  PERFORM public.rpc_audit_write_v1('ack_read_v1', p_conversation_id, NULL, NULL, 'ok', NULL);

  conversation_id := p_conversation_id;
  user_id := v_user;
  delivered_up_to_seq := v_delivered;
  read_up_to_seq := v_read;
  server_time := now();
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.ack_read_v1(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ack_read_v1(UUID, BIGINT) TO authenticated;

-- 8) RPC: fetch_messages_v1 (pagination by seq).
CREATE OR REPLACE FUNCTION public.fetch_messages_v1(
  p_conversation_id UUID,
  p_before_seq BIGINT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  sender_id UUID,
  content TEXT,
  created_at TIMESTAMPTZ,
  seq BIGINT,
  client_msg_id UUID,
  media_url TEXT,
  media_type TEXT,
  duration_seconds INTEGER,
  shared_post_id UUID,
  shared_reel_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_conversation' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  PERFORM public.rpc_audit_write_v1('fetch_messages_v1', p_conversation_id, NULL, NULL, 'ok', NULL);

  RETURN QUERY
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.content,
    m.created_at,
    m.seq,
    m.client_msg_id,
    m.media_url,
    m.media_type,
    m.duration_seconds,
    m.shared_post_id,
    m.shared_reel_id
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
    AND (p_before_seq IS NULL OR m.seq < p_before_seq)
  ORDER BY m.seq DESC
  LIMIT v_lim;
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_messages_v1(UUID, BIGINT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_messages_v1(UUID, BIGINT, INTEGER) TO authenticated;

-- 9) RPC: inbox without N+1 (participants + last preview + unread).
CREATE OR REPLACE FUNCTION public.chat_get_inbox_v2(
  p_limit INTEGER DEFAULT 100,
  p_cursor_seq BIGINT DEFAULT NULL
)
RETURNS TABLE (
  conversation_id UUID,
  updated_at TIMESTAMPTZ,
  last_seq BIGINT,
  last_message_id UUID,
  last_sender_id UUID,
  last_preview_text TEXT,
  last_created_at TIMESTAMPTZ,
  unread_count BIGINT,
  participants JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM public.rpc_audit_write_v1('chat_get_inbox_v2', NULL, NULL, NULL, 'ok', NULL);

  RETURN QUERY
  WITH my_convs AS (
    SELECT cp.conversation_id
    FROM public.conversation_participants cp
    WHERE cp.user_id = v_user
  ),
  roll AS (
    SELECT
      c.id AS conversation_id,
      c.updated_at,
      COALESCE(cs.last_seq, 0) AS last_seq,
      cs.last_message_id,
      cs.last_sender_id,
      cs.last_preview_text,
      cs.last_created_at,
      COALESCE(cur.read_up_to_seq, 0) AS read_up_to_seq
    FROM my_convs mc
    JOIN public.conversations c ON c.id = mc.conversation_id
    LEFT JOIN public.conversation_state cs ON cs.conversation_id = c.id
    LEFT JOIN public.conversation_cursors cur
      ON cur.conversation_id = c.id
     AND cur.user_id = v_user
    WHERE (p_cursor_seq IS NULL OR COALESCE(cs.last_seq, 0) < p_cursor_seq)
    ORDER BY COALESCE(cs.last_seq, 0) DESC, c.updated_at DESC
    LIMIT v_lim
  ),
  parts AS (
    SELECT
      cp.conversation_id,
      jsonb_agg(
        jsonb_build_object(
          'user_id', cp.user_id,
          'profile', jsonb_build_object(
            'display_name', pr.display_name,
            'avatar_url', pr.avatar_url
          )
        )
        ORDER BY cp.user_id
      ) AS participants
    FROM public.conversation_participants cp
    LEFT JOIN public.profiles pr ON pr.user_id = cp.user_id
    WHERE cp.conversation_id IN (SELECT r2.conversation_id FROM roll r2)
    GROUP BY cp.conversation_id
  )
  SELECT
    r.conversation_id,
    r.updated_at,
    r.last_seq,
    r.last_message_id,
    r.last_sender_id,
    r.last_preview_text,
    r.last_created_at,
    GREATEST(r.last_seq - r.read_up_to_seq, 0) AS unread_count,
    COALESCE(p.participants, '[]'::jsonb) AS participants
  FROM roll r
  LEFT JOIN parts p ON p.conversation_id = r.conversation_id
  ORDER BY r.last_seq DESC, r.updated_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_get_inbox_v2(INTEGER, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_get_inbox_v2(INTEGER, BIGINT) TO authenticated;

-- 10) Rework send_message_v1 to assign seq via conversation row lock and update server_seq.
-- NOTE: Signature must match existing v2 migration (uuid, uuid, text).
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

  -- Rate limit: 60 messages / 60s per user.
  PERFORM public.chat_rate_limit_check_v1('msg_send', 60, 60);

  -- Lock the conversation row to ensure deterministic seq assignment.
  SELECT c.server_seq
  INTO current_seq
  FROM public.conversations c
  WHERE c.id = conversation_id
  FOR UPDATE;

  IF current_seq IS NULL THEN
    RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: if already inserted, return existing WITHOUT consuming seq.
  SELECT m.id, m.seq
  INTO existing_id, existing_seq
  FROM public.messages m
  WHERE m.conversation_id = conversation_id
    AND m.sender_id = initiator
    AND m.client_msg_id = client_msg_id
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    PERFORM public.rpc_audit_write_v1('send_message_v1', conversation_id, client_msg_id, NULL, 'duplicate', NULL);
    message_id := existing_id;
    seq := existing_seq;
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
      final_content := btrim(coalesce(payload->>'text', ''));

    ELSIF kind = 'media' THEN
      final_media_type := btrim(coalesce(payload->>'media_type', ''));
      final_media_url := btrim(coalesce(payload->>'media_url', ''));
      final_content := btrim(coalesce(payload->>'text', ''));
      final_duration := NULLIF((payload->>'duration_seconds')::int, 0);
      IF final_content = '' THEN
        final_content := 'рџ“Ћ';
      END IF;
      IF final_media_type NOT IN ('image','video','voice','video_circle') THEN
        RAISE EXCEPTION 'invalid_media_type' USING ERRCODE = '22023';
      END IF;
      IF length(final_media_url) < 1 OR length(final_media_url) > 2048 THEN
        RAISE EXCEPTION 'invalid_media_url' USING ERRCODE = '22023';
      END IF;

    ELSIF kind = 'share_post' THEN
      final_shared_post := (payload->>'shared_post_id')::uuid;
      final_content := btrim(coalesce(payload->>'text', 'рџ“Њ РџРѕСЃС‚'));

    ELSIF kind = 'share_reel' THEN
      final_shared_reel := (payload->>'shared_reel_id')::uuid;
      final_content := btrim(coalesce(payload->>'text', 'рџЋ¬ Р РёР»СЃ'));
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
    conversation_id,
    initiator,
    final_content,
    client_msg_id,
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
  RETURNING id, seq INTO inserted_id, inserted_seq;

  IF inserted_id IS NULL THEN
    -- Extremely unlikely due to pre-check under lock, but keep correct.
    SELECT m.id, m.seq
      INTO inserted_id, inserted_seq
    FROM public.messages m
    WHERE m.conversation_id = conversation_id
      AND m.sender_id = initiator
      AND m.client_msg_id = client_msg_id
    LIMIT 1;
  END IF;

  IF inserted_id IS NULL THEN
    PERFORM public.rpc_audit_write_v1('send_message_v1', conversation_id, client_msg_id, NULL, 'error', 'send_failed');
    RAISE EXCEPTION 'send_failed' USING ERRCODE = 'P0001';
  END IF;

  -- Persist the conversation counter only after successful insert.
  UPDATE public.conversations
  SET
    server_seq = new_seq,
    last_message_seq = GREATEST(last_message_seq, new_seq),
    updated_at = now()
  WHERE id = conversation_id;

  PERFORM public.rpc_audit_write_v1('send_message_v1', conversation_id, client_msg_id, NULL, 'ok', NULL);

  message_id := inserted_id;
  seq := inserted_seq;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.send_message_v1(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message_v1(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.send_message_v1(UUID, UUID, TEXT)
  IS 'Project B: RPC-only durable commit ACK. Assigns seq via conversation row lock, enforces membership and idempotency, returns (message_id, seq).';

