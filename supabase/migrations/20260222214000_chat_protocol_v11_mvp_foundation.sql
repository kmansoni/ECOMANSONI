-- =====================================================
-- Chat protocol v1.1 foundation (MVP slice)
-- Durable write ledger + stream events + inbox projection + receipts
-- =====================================================

-- 0) Core tables
CREATE TABLE IF NOT EXISTS public.chat_stream_heads (
  stream_id TEXT PRIMARY KEY,
  last_event_seq BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_write_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  client_write_seq BIGINT NOT NULL,
  op_type TEXT NOT NULL,
  status TEXT NOT NULL,
  canonical_dialog_id UUID NULL REFERENCES public.conversations(id) ON DELETE SET NULL,
  canonical_msg_id UUID NULL REFERENCES public.messages(id) ON DELETE SET NULL,
  canonical_msg_seq BIGINT NULL,
  canonical_last_read_seq BIGINT NULL,
  error_code TEXT NULL,
  error_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  UNIQUE(actor_id, device_id, client_write_seq)
);

CREATE TABLE IF NOT EXISTS public.chat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id TEXT NOT NULL,
  event_seq BIGINT NOT NULL,
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  event_type TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  dialog_id UUID NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  actor_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  caused_by_device_id TEXT NULL,
  caused_by_client_write_seq BIGINT NULL,
  caused_by_client_msg_id UUID NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_hash TEXT NOT NULL,
  flags_json JSONB NOT NULL DEFAULT jsonb_build_object(
    'is_retry', false,
    'is_resync', false,
    'is_backfill', false
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stream_id, event_seq),
  UNIQUE(event_id)
);

CREATE TABLE IF NOT EXISTS public.chat_inbox_projection (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dialog_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sort_key TEXT NOT NULL,
  pinned_rank INTEGER NULL,
  has_draft BOOLEAN NOT NULL DEFAULT false,
  activity_seq BIGINT NOT NULL DEFAULT 0,
  preview_text TEXT NOT NULL DEFAULT '',
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_read_seq BIGINT NOT NULL DEFAULT 0,
  muted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dialog_id)
);

CREATE TABLE IF NOT EXISTS public.chat_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  client_write_seq BIGINT NOT NULL,
  status TEXT NOT NULL,
  result_stream_id TEXT NULL,
  result_event_seq BIGINT NULL,
  trace_id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id, client_write_seq)
);

-- 1) Indexes
CREATE INDEX IF NOT EXISTS idx_chat_write_ledger_expires_at
  ON public.chat_write_ledger (expires_at);

CREATE INDEX IF NOT EXISTS idx_chat_write_ledger_actor_device_created
  ON public.chat_write_ledger (actor_id, device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_events_stream_created
  ON public.chat_events (stream_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_events_dialog_seq
  ON public.chat_events (dialog_id, event_seq)
  WHERE dialog_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_inbox_projection_user_sort
  ON public.chat_inbox_projection (user_id, sort_key DESC);

CREATE INDEX IF NOT EXISTS idx_chat_inbox_projection_user_updated
  ON public.chat_inbox_projection (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_receipts_created
  ON public.chat_receipts (user_id, created_at DESC);

-- 2) RLS (tables are backend-controlled, read via security definer RPC)
ALTER TABLE public.chat_stream_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_write_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_inbox_projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_receipts ENABLE ROW LEVEL SECURITY;

-- 3) Utility functions
CREATE OR REPLACE FUNCTION public.chat_sha256_hex(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(extensions.digest(convert_to(coalesce(input, ''), 'utf8'), 'sha256'::text), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.chat_next_stream_seq(p_stream_id TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq BIGINT;
BEGIN
  LOOP
    UPDATE public.chat_stream_heads
       SET last_event_seq = last_event_seq + 1,
           updated_at = now()
     WHERE stream_id = p_stream_id
     RETURNING last_event_seq INTO v_seq;

    IF FOUND THEN
      RETURN v_seq;
    END IF;

    BEGIN
      INSERT INTO public.chat_stream_heads(stream_id, last_event_seq)
      VALUES (p_stream_id, 1)
      RETURNING last_event_seq INTO v_seq;
      RETURN v_seq;
    EXCEPTION WHEN unique_violation THEN
      -- retry
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_build_sort_key(
  p_pinned_rank INTEGER,
  p_has_draft BOOLEAN,
  p_activity_seq BIGINT,
  p_dialog_id UUID
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lpad(COALESCE(p_pinned_rank, 2147483647)::text, 10, '0')
    || ':' || CASE WHEN COALESCE(p_has_draft, false) THEN '1' ELSE '0' END
    || ':' || lpad((999999999999999 - COALESCE(p_activity_seq, 0))::text, 15, '0')
    || ':' || COALESCE(p_dialog_id::text, '00000000-0000-0000-0000-000000000000');
$$;

-- 4) RPC: get_inbox (projection read path)
CREATE OR REPLACE FUNCTION public.chat_get_inbox_v11(
  p_limit INTEGER DEFAULT 50,
  p_cursor TEXT DEFAULT NULL
)
RETURNS TABLE(
  dialog_id UUID,
  sort_key TEXT,
  pinned_rank INTEGER,
  has_draft BOOLEAN,
  activity_seq BIGINT,
  preview TEXT,
  unread_count INTEGER,
  last_read_seq BIGINT,
  muted BOOLEAN,
  next_cursor TEXT,
  server_ts TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT i.*
    FROM public.chat_inbox_projection i
    WHERE i.user_id = v_user
      AND (
        p_cursor IS NULL
        OR ((i.sort_key, i.dialog_id::text) > (split_part(p_cursor, '|', 1), split_part(p_cursor, '|', 2)))
      )
    ORDER BY i.sort_key ASC, i.dialog_id ASC
    LIMIT v_limit
  ),
  last_row AS (
    SELECT b.sort_key, b.dialog_id
    FROM base b
    ORDER BY b.sort_key DESC, b.dialog_id DESC
    LIMIT 1
  )
  SELECT
    b.dialog_id,
    b.sort_key,
    b.pinned_rank,
    b.has_draft,
    b.activity_seq,
    b.preview_text,
    b.unread_count,
    b.last_read_seq,
    b.muted,
    CASE
      WHEN (SELECT COUNT(*) FROM base) = v_limit THEN
        (SELECT lr.sort_key || '|' || lr.dialog_id::text FROM last_row lr)
      ELSE NULL
    END AS next_cursor,
    now() AS server_ts
  FROM base b
  ORDER BY b.sort_key ASC, b.dialog_id ASC;
END;
$$;

-- 5) RPC: status_write
CREATE OR REPLACE FUNCTION public.chat_status_write_v11(
  p_device_id TEXT,
  p_client_write_seq BIGINT
)
RETURNS TABLE(
  status TEXT,
  dialog_id UUID,
  msg_id UUID,
  msg_seq BIGINT,
  last_read_seq_applied BIGINT,
  server_ts TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT
    l.status,
    l.canonical_dialog_id,
    l.canonical_msg_id,
    l.canonical_msg_seq,
    l.canonical_last_read_seq,
    now()
  FROM public.chat_write_ledger l
  WHERE l.actor_id = v_user
    AND l.device_id = p_device_id
    AND l.client_write_seq = p_client_write_seq
  LIMIT 1;
END;
$$;

-- 6) RPC: resync_stream
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
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_stream_id LIKE 'dialog:%' THEN
    v_dialog_id := substring(p_stream_id from 8)::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = v_dialog_id
        AND cp.user_id = v_user
    ) THEN
      RAISE EXCEPTION 'ERR_FORBIDDEN';
    END IF;
  ELSIF p_stream_id LIKE 'user:%' THEN
    IF split_part(p_stream_id, ':', 2)::uuid <> v_user THEN
      RAISE EXCEPTION 'ERR_FORBIDDEN';
    END IF;
  END IF;

  SELECT COALESCE(MAX(e.event_seq), 0), COALESCE(MIN(e.event_seq), 0)
    INTO v_head, v_min
  FROM public.chat_events e
  WHERE e.stream_id = p_stream_id;

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

-- 7) RPC: send_message (durable ledger + events + projection + receipt)
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

  INSERT INTO public.messages(conversation_id, sender_id, content, client_msg_id)
  VALUES (p_dialog_id, v_user, trim(p_content), p_client_msg_id)
  ON CONFLICT (conversation_id, sender_id, client_msg_id)
  DO UPDATE SET content = EXCLUDED.content
  RETURNING * INTO v_msg;

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

-- 8) RPC: mark_read (monotonic)
CREATE OR REPLACE FUNCTION public.chat_mark_read_v11(
  p_dialog_id UUID,
  p_device_id TEXT,
  p_client_write_seq BIGINT,
  p_client_op_id UUID,
  p_last_read_seq BIGINT,
  p_client_sent_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE(
  ack_id UUID,
  ack_status TEXT,
  dialog_id UUID,
  last_read_seq_applied BIGINT,
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
  v_ack_id UUID := gen_random_uuid();
  v_ledger public.chat_write_ledger%ROWTYPE;
  v_current BIGINT := 0;
  v_applied BIGINT := 0;
  v_head BIGINT := 0;
  v_unread INTEGER := 0;
  v_read_event_seq BIGINT;
  v_inbox_event_seq BIGINT;
BEGIN
  IF v_user IS NULL THEN
    RETURN QUERY SELECT v_ack_id, 'rejected', p_dialog_id, 0::BIGINT, p_client_write_seq, now(), 'ERR_UNAUTHORIZED';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_dialog_id
      AND cp.user_id = v_user
  ) THEN
    RETURN QUERY SELECT v_ack_id, 'rejected', p_dialog_id, 0::BIGINT, p_client_write_seq, now(), 'ERR_FORBIDDEN';
    RETURN;
  END IF;

  SELECT * INTO v_ledger
  FROM public.chat_write_ledger l
  WHERE l.actor_id = v_user
    AND l.device_id = p_device_id
    AND l.client_write_seq = p_client_write_seq
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_ack_id, 'duplicate', COALESCE(v_ledger.canonical_dialog_id, p_dialog_id), COALESCE(v_ledger.canonical_last_read_seq, 0), p_client_write_seq, now(), v_ledger.error_code;
    RETURN;
  END IF;

  INSERT INTO public.chat_write_ledger(actor_id, device_id, client_write_seq, op_type, status, canonical_dialog_id)
  VALUES (v_user, p_device_id, p_client_write_seq, 'mark_read', 'pending', p_dialog_id);

  SELECT COALESCE(i.last_read_seq, 0)
    INTO v_current
  FROM public.chat_inbox_projection i
  WHERE i.user_id = v_user
    AND i.dialog_id = p_dialog_id;

  SELECT COALESCE(c.last_message_seq, 0)
    INTO v_head
  FROM public.conversations c
  WHERE c.id = p_dialog_id;

  v_applied := GREATEST(v_current, LEAST(COALESCE(p_last_read_seq, 0), v_head));

  SELECT COUNT(*)::INTEGER
    INTO v_unread
  FROM public.messages m
  WHERE m.conversation_id = p_dialog_id
    AND COALESCE(m.seq, 0) > v_applied
    AND m.sender_id <> v_user;

  INSERT INTO public.chat_inbox_projection(
    user_id, dialog_id, sort_key, pinned_rank, has_draft, activity_seq, preview_text, unread_count, last_read_seq, muted, updated_at
  )
  VALUES (
    v_user,
    p_dialog_id,
    public.chat_build_sort_key(NULL, false, v_head, p_dialog_id),
    NULL,
    false,
    v_head,
    COALESCE((SELECT i.preview_text FROM public.chat_inbox_projection i WHERE i.user_id = v_user AND i.dialog_id = p_dialog_id), ''),
    v_unread,
    v_applied,
    COALESCE((SELECT i.muted FROM public.chat_inbox_projection i WHERE i.user_id = v_user AND i.dialog_id = p_dialog_id), false),
    now()
  )
  ON CONFLICT (user_id, dialog_id)
  DO UPDATE SET
    last_read_seq = GREATEST(public.chat_inbox_projection.last_read_seq, EXCLUDED.last_read_seq),
    unread_count = EXCLUDED.unread_count,
    activity_seq = GREATEST(public.chat_inbox_projection.activity_seq, EXCLUDED.activity_seq),
    sort_key = EXCLUDED.sort_key,
    updated_at = now();

  v_read_event_seq := public.chat_next_stream_seq('user:' || v_user::text || ':reads');
  INSERT INTO public.chat_events(
    stream_id, event_seq, scope, event_type, partition_key, dialog_id, actor_id,
    caused_by_device_id, caused_by_client_write_seq, caused_by_client_msg_id,
    payload_json, payload_hash
  ) VALUES (
    'user:' || v_user::text || ':reads',
    v_read_event_seq,
    'user',
    'read.cursor_updated',
    v_user::text,
    p_dialog_id,
    v_user,
    p_device_id,
    p_client_write_seq,
    NULL,
    jsonb_build_object('dialog_id', p_dialog_id, 'last_read_seq', v_applied),
    public.chat_sha256_hex(v_user::text || ':' || p_dialog_id::text || ':' || v_applied::text)
  );

  v_inbox_event_seq := public.chat_next_stream_seq('user:' || v_user::text || ':inbox');
  INSERT INTO public.chat_events(
    stream_id, event_seq, scope, event_type, partition_key, dialog_id, actor_id,
    caused_by_device_id, caused_by_client_write_seq, caused_by_client_msg_id,
    payload_json, payload_hash
  ) VALUES (
    'user:' || v_user::text || ':inbox',
    v_inbox_event_seq,
    'user',
    'inbox.item_updated',
    v_user::text,
    p_dialog_id,
    v_user,
    p_device_id,
    p_client_write_seq,
    NULL,
    jsonb_build_object('dialog_id', p_dialog_id, 'last_read_seq', v_applied, 'unread_count', v_unread),
    public.chat_sha256_hex(v_user::text || ':' || p_dialog_id::text || ':inbox:' || v_applied::text)
  );

  INSERT INTO public.chat_receipts(user_id, device_id, client_write_seq, status, result_stream_id, result_event_seq)
  VALUES (v_user, p_device_id, p_client_write_seq, 'delivered', 'user:' || v_user::text || ':reads', v_read_event_seq)
  ON CONFLICT (user_id, device_id, client_write_seq) DO NOTHING;

  UPDATE public.chat_write_ledger
  SET status = 'accepted',
      canonical_last_read_seq = v_applied,
      error_code = NULL,
      error_details = '{}'::jsonb,
      updated_at = now()
  WHERE actor_id = v_user
    AND device_id = p_device_id
    AND client_write_seq = p_client_write_seq;

  RETURN QUERY SELECT v_ack_id, 'accepted', p_dialog_id, v_applied, p_client_write_seq, now(), NULL::TEXT;
END;
$$;

-- 9) Grants
GRANT EXECUTE ON FUNCTION public.chat_get_inbox_v11(INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_status_write_v11(TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_resync_stream_v11(TEXT, BIGINT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_send_message_v11(UUID, TEXT, BIGINT, UUID, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_mark_read_v11(UUID, TEXT, BIGINT, UUID, BIGINT, TIMESTAMPTZ) TO authenticated;

-- 10) Realtime publication for events/receipts/projection (if used by clients)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_receipts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_inbox_projection;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


