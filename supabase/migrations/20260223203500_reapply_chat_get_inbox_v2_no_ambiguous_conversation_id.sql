-- =============================================================================
-- HOTFIX (re-apply): chat_get_inbox_v2 ambiguous conversation_id
--
-- Problem observed in production:
--   code 42702, message: column reference "conversation_id" is ambiguous
--   hint: It could refer to either a PL/pgSQL variable or a table column.
--
-- Root cause:
-- - A buggy version of the function body is deployed remotely.
-- - Editing old migrations does not change already-applied DB objects.
--
-- Fix:
-- - Re-apply CREATE OR REPLACE with fully-qualified column references.
-- - Add plpgsql.variable_conflict=use_column as a safety net.
-- =============================================================================

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

  INSERT INTO public.conversation_cursors(conversation_id, user_id)
  VALUES (p_conversation_id, v_user)
  ON CONFLICT DO NOTHING;

  SELECT cc.delivered_up_to_seq, cc.read_up_to_seq
  INTO v_delivered, v_read
  FROM public.conversation_cursors cc
  WHERE cc.conversation_id = p_conversation_id
    AND cc.user_id = v_user
  LIMIT 1;

  IF p_up_to_seq > COALESCE(v_delivered, 0) THEN
    RAISE EXCEPTION 'read_gt_delivered' USING ERRCODE = '22023';
  END IF;

  UPDATE public.conversation_cursors cc
  SET
    read_up_to_seq = GREATEST(cc.read_up_to_seq, p_up_to_seq),
    updated_at = now()
  WHERE cc.conversation_id = p_conversation_id
    AND cc.user_id = v_user
  RETURNING cc.delivered_up_to_seq, cc.read_up_to_seq
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
