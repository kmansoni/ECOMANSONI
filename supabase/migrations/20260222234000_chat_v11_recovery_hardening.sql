-- =====================================================
-- Chat protocol v1.1: recovery hardening
-- - resync retention boundary enforcement
-- - full_state_dialog RPC with throttle (1/60s per dialog/device/user)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.chat_recovery_throttle (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  dialog_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  op_name TEXT NOT NULL,
  last_called_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id, dialog_id, op_name)
);

CREATE INDEX IF NOT EXISTS idx_chat_recovery_throttle_called
  ON public.chat_recovery_throttle (last_called_at DESC);

ALTER TABLE public.chat_recovery_throttle ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.chat_resync_stream_v11(
  p_stream_id TEXT,
  p_since_event_seq BIGINT DEFAULT 0,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE(
  stream_id TEXT,
  event_seq BIGINT,
  event_id UUID,
  scope TEXT,
  event_type TEXT,
  dialog_id UUID,
  actor_id UUID,
  payload_json JSONB,
  payload_hash TEXT,
  flags_json JSONB,
  created_at TIMESTAMPTZ,
  head_event_seq BIGINT,
  retention_min_seq BIGINT,
  server_ts TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
  v_dialog_id UUID;
  v_head BIGINT;
  v_min BIGINT;
  v_user_stream_owner UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_stream_id IS NULL OR trim(p_stream_id) = '' THEN
    RAISE EXCEPTION 'ERR_INVALID_ARGUMENT';
  END IF;

  IF p_stream_id LIKE 'dialog:%' THEN
    BEGIN
      v_dialog_id := substring(p_stream_id from 8)::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ERR_INVALID_ARGUMENT';
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = v_dialog_id
        AND cp.user_id = v_user
    ) THEN
      RAISE EXCEPTION 'ERR_FORBIDDEN';
    END IF;
  ELSIF p_stream_id LIKE 'user:%' THEN
    BEGIN
      v_user_stream_owner := split_part(p_stream_id, ':', 2)::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ERR_INVALID_ARGUMENT';
    END;

    IF v_user_stream_owner <> v_user THEN
      RAISE EXCEPTION 'ERR_FORBIDDEN';
    END IF;
  ELSE
    RAISE EXCEPTION 'ERR_INVALID_ARGUMENT';
  END IF;

  SELECT COALESCE(MAX(e.event_seq), 0), COALESCE(MIN(e.event_seq), 0)
    INTO v_head, v_min
  FROM public.chat_events e
  WHERE e.stream_id = p_stream_id;

  -- Since pointer must still be inside retained window:
  -- earliest valid "since" is (retention_min_seq - 1).
  IF v_min > 0 AND COALESCE(p_since_event_seq, 0) < (v_min - 1) THEN
    RAISE EXCEPTION 'ERR_RESYNC_RANGE_UNAVAILABLE';
  END IF;

  RETURN QUERY
  SELECT
    e.stream_id,
    e.event_seq,
    e.event_id,
    e.scope,
    e.event_type,
    e.dialog_id,
    e.actor_id,
    e.payload_json,
    e.payload_hash,
    e.flags_json,
    e.created_at,
    v_head,
    v_min,
    now()
  FROM public.chat_events e
  WHERE e.stream_id = p_stream_id
    AND e.event_seq > COALESCE(p_since_event_seq, 0)
  ORDER BY e.event_seq ASC
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_full_state_dialog_v11(
  p_dialog_id UUID,
  p_device_id TEXT,
  p_message_limit INTEGER DEFAULT 200
)
RETURNS TABLE(
  snapshot JSONB,
  covers_event_seq_until BIGINT,
  head_event_seq BIGINT,
  server_ts TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_message_limit, 200), 500));
  v_last_called TIMESTAMPTZ;
  v_head BIGINT := 0;
  v_snapshot_seq BIGINT := 0;
  v_messages JSONB := '[]'::jsonb;
  v_inbox_item JSONB := '{}'::jsonb;
  v_snapshot JSONB;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_dialog_id IS NULL OR p_device_id IS NULL OR trim(p_device_id) = '' THEN
    RAISE EXCEPTION 'ERR_INVALID_ARGUMENT';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_dialog_id
      AND cp.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN';
  END IF;

  SELECT t.last_called_at
    INTO v_last_called
  FROM public.chat_recovery_throttle t
  WHERE t.user_id = v_user
    AND t.device_id = p_device_id
    AND t.dialog_id = p_dialog_id
    AND t.op_name = 'full_state_dialog'
  FOR UPDATE;

  IF v_last_called IS NOT NULL AND v_last_called > (now() - interval '60 seconds') THEN
    RAISE EXCEPTION 'ERR_RESYNC_THROTTLED';
  END IF;

  INSERT INTO public.chat_recovery_throttle(user_id, device_id, dialog_id, op_name, last_called_at)
  VALUES (v_user, p_device_id, p_dialog_id, 'full_state_dialog', now())
  ON CONFLICT (user_id, device_id, dialog_id, op_name)
  DO UPDATE SET last_called_at = EXCLUDED.last_called_at;

  SELECT COALESCE(MAX(e.event_seq), 0)
    INTO v_head
  FROM public.chat_events e
  WHERE e.stream_id = 'dialog:' || p_dialog_id::text;

  SELECT COALESCE(c.last_message_seq, 0)
    INTO v_snapshot_seq
  FROM public.conversations c
  WHERE c.id = p_dialog_id;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'msg_id', x.id,
               'msg_seq', x.seq,
               'sender_id', x.sender_id,
               'content', x.content,
               'created_at', x.created_at
             )
             ORDER BY x.seq ASC
           ),
           '[]'::jsonb
         )
    INTO v_messages
  FROM (
    SELECT m.id, m.seq, m.sender_id, m.content, m.created_at
    FROM public.messages m
    WHERE m.conversation_id = p_dialog_id
      AND m.seq IS NOT NULL
    ORDER BY m.seq DESC
    LIMIT v_limit
  ) x;

  SELECT COALESCE(
           jsonb_build_object(
             'dialog_id', i.dialog_id,
             'sort_key', i.sort_key,
             'activity_seq', i.activity_seq,
             'preview', i.preview_text,
             'unread_count', i.unread_count,
             'last_read_seq', i.last_read_seq,
             'muted', i.muted
           ),
           jsonb_build_object(
             'dialog_id', p_dialog_id,
             'sort_key', NULL,
             'activity_seq', 0,
             'preview', '',
             'unread_count', 0,
             'last_read_seq', 0,
             'muted', false
           )
         )
    INTO v_inbox_item
  FROM public.chat_inbox_projection i
  WHERE i.user_id = v_user
    AND i.dialog_id = p_dialog_id;

  v_snapshot := jsonb_build_object(
    'snapshot_seq', v_snapshot_seq,
    'covers_event_seq_until', v_head,
    'state_version', 1,
    'dialog_id', p_dialog_id,
    'messages', v_messages,
    'inbox_item', v_inbox_item
  );

  v_snapshot := v_snapshot || jsonb_build_object(
    'hash', public.chat_sha256_hex(v_snapshot::text)
  );

  RETURN QUERY
  SELECT
    v_snapshot,
    v_head,
    v_head,
    now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_resync_stream_v11(TEXT, BIGINT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_full_state_dialog_v11(UUID, TEXT, INTEGER) TO authenticated;

