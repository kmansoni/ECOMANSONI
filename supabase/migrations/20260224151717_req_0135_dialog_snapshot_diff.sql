-- =============================================================================
-- REQ-0135: Dialog Snapshot Diff Recovery Contract
--
-- Acceptance criteria:
-- - ✅ Client recovers from stale cursor without data loss
-- - ✅ No full-history fetch required  
-- - ✅ Diff stream remains monotonic
--
-- Phase 0 implementation:
-- - fetch_messages_v1 already supports p_before_seq (backward pagination)
-- - Add conversation_state.min_seq_available for retention tracking
-- - Add get_conversation_snapshot_v1 for full snapshot fallback
-- =============================================================================

-- 1. Add min_seq_available to conversation_state (tracks oldest available message)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversation_state'
      AND column_name = 'min_seq_available'
  ) THEN
    ALTER TABLE public.conversation_state
      ADD COLUMN min_seq_available BIGINT DEFAULT 1;
  END IF;
END $$;

COMMENT ON COLUMN public.conversation_state.min_seq_available
  IS 'REQ-0135: Oldest message seq still available (for detecting cursor drift). Updated by retention policies.';

-- 2. RPC: get_conversation_snapshot_v1 (full snapshot fallback)
-- Returns conversation metadata + initial page of messages for recovery.
CREATE OR REPLACE FUNCTION public.get_conversation_snapshot_v1(
  p_conversation_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  conversation_id UUID,
  last_seq BIGINT,
  min_seq_available BIGINT,
  participant_count INTEGER,
  message_count BIGINT,
  messages JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_last_seq BIGINT;
  v_min_seq BIGINT;
  v_participant_count INTEGER;
  v_message_count BIGINT;
  v_messages JSONB;
BEGIN
  -- 1. Authentication check
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- 2. Participant check
  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  -- 3. Get conversation metadata
  SELECT
    COALESCE(cs.last_seq, 0),
    COALESCE(cs.min_seq_available, 1),
    COUNT(DISTINCT cp2.user_id)::INTEGER,
    COUNT(m.id)
  INTO v_last_seq, v_min_seq, v_participant_count, v_message_count
  FROM public.conversations c
  LEFT JOIN public.conversation_state cs ON cs.conversation_id = c.id
  LEFT JOIN public.conversation_participants cp2 ON cp2.conversation_id = c.id
  LEFT JOIN public.messages m ON m.conversation_id = c.id
  WHERE c.id = p_conversation_id
  GROUP BY c.id, cs.last_seq, cs.min_seq_available;

  -- 4. Get recent messages (descending order, client reverses)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'conversation_id', m.conversation_id,
      'sender_id', m.sender_id,
      'content', m.content,
      'created_at', m.created_at,
      'seq', m.seq,
      'client_msg_id', m.client_msg_id,
      'media_url', m.media_url,
      'media_type', m.media_type,
      'duration_seconds', m.duration_seconds,
      'shared_post_id', m.shared_post_id,
      'shared_reel_id', m.shared_reel_id
    ) ORDER BY m.seq DESC
  ), '[]'::jsonb)
  INTO v_messages
  FROM (
    SELECT *
    FROM public.messages m2
    WHERE m2.conversation_id = p_conversation_id
    ORDER BY m2.seq DESC
    LIMIT v_lim
  ) m;

  -- 5. Return snapshot
  RETURN QUERY SELECT
    p_conversation_id,
    v_last_seq,
    v_min_seq,
    v_participant_count,
    v_message_count,
    v_messages;
END;
$$;

REVOKE ALL ON FUNCTION public.get_conversation_snapshot_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_conversation_snapshot_v1(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_conversation_snapshot_v1(UUID, INTEGER)
  IS 'REQ-0135: Full conversation snapshot for cursor drift recovery. Returns metadata + recent messages.';

-- 3. Update conversation_state trigger to maintain min_seq_available
-- (In Phase 0, we set it to 1 by default. Future: retention worker updates it)
CREATE OR REPLACE FUNCTION public.update_conversation_state_min_seq()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_min_seq BIGINT;
BEGIN
  -- Get actual minimum seq from messages table
  SELECT COALESCE(MIN(m.seq), 1)
    INTO v_min_seq
  FROM public.messages m
  WHERE m.conversation_id = OLD.conversation_id;

  -- Update conversation_state
  UPDATE public.conversation_state
    SET min_seq_available = v_min_seq
  WHERE conversation_id = OLD.conversation_id;

  RETURN OLD;
END;
$$;

-- Apply trigger on message deletion (to track retention)
DROP TRIGGER IF EXISTS trg_messages_update_min_seq ON public.messages;
CREATE TRIGGER trg_messages_update_min_seq
AFTER DELETE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_conversation_state_min_seq();

COMMENT ON FUNCTION public.update_conversation_state_min_seq()
  IS 'REQ-0135: Maintains min_seq_available when messages are deleted (retention policies).';
