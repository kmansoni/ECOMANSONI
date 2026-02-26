-- =====================================================
-- Chat protocol v1.1: expose top-message sender + peer read pointer in inbox projection
-- =====================================================

CREATE OR REPLACE FUNCTION public.chat_get_inbox_v11_with_pointers(
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
  last_sender_id UUID,
  peer_last_read_seq BIGINT,
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
    FROM public.chat_inbox_projection AS i
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
    FROM base AS b
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
    m.sender_id AS last_sender_id,
    COALESCE(peer.peer_last_read_seq, 0) AS peer_last_read_seq,
    CASE
      WHEN (SELECT COUNT(*) FROM base) = v_limit THEN
        (SELECT lr.sort_key || '|' || lr.dialog_id::text FROM last_row AS lr)
      ELSE NULL
    END AS next_cursor,
    now() AS server_ts
  FROM base AS b
  LEFT JOIN public.messages AS m
    ON m.conversation_id = b.dialog_id
   AND COALESCE(m.seq, 0) = COALESCE(b.activity_seq, 0)
  LEFT JOIN LATERAL (
    SELECT MAX(ip.last_read_seq) AS peer_last_read_seq
    FROM public.chat_inbox_projection AS ip
    WHERE ip.dialog_id = b.dialog_id
      AND ip.user_id <> v_user
  ) AS peer ON TRUE
  ORDER BY b.sort_key ASC, b.dialog_id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_get_inbox_v11_with_pointers(INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_get_inbox_v11_with_pointers(INTEGER, TEXT) TO authenticated;
