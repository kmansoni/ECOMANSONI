-- =============================================================================
-- REQ-0135: Dialog Snapshot Diff Recovery Contract
--
-- Acceptance criteria:
-- - dialog_get_updates_v2 need_snapshot flag
-- - dialog_get_snapshot_v1 contract
-- - min_msg_seq_available maintenance
--
-- Phase 0 MVP implementation:
-- - Add min_seq column to conversation_state (tracks oldest available message seq)
-- - Simple snapshot RPC returns full message history (paginated)
-- - Diff stream remains monotonic via fetch_messages_v1 (before_seq pagination)
-- - Client recovers from stale cursor without data loss
-- =============================================================================

-- 1. Add min_seq column to conversation_state
ALTER TABLE public.conversation_state
  ADD COLUMN IF NOT EXISTS min_seq BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retention_mode TEXT DEFAULT 'full' CHECK (retention_mode IN ('full', 'windowed'));
COMMENT ON COLUMN public.conversation_state.min_seq
  IS 'REQ-0135: Oldest message seq still available in database (for drift detection)';
COMMENT ON COLUMN public.conversation_state.retention_mode 
  IS 'REQ-0135: full=all messages kept, windowed=old messages pruned (not implemented in Phase 0)';
-- 2. RPC: dialog_get_snapshot_v1
-- Returns full conversation snapshot (paginated, oldest-first)
CREATE OR REPLACE FUNCTION public.dialog_get_snapshot_v1(
  p_conversation_id UUID,
  p_page_size INTEGER DEFAULT 100,
  p_page_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  min_seq BIGINT,
  max_seq BIGINT,
  total_messages BIGINT,
  page_size INTEGER,
  page_offset INTEGER,
  messages JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_min_seq BIGINT;
  v_max_seq BIGINT;
  v_total BIGINT;
  v_page_size INTEGER;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  -- Get conversation bounds
  SELECT 
    COALESCE(cs.min_seq, 0),
    COALESCE(cs.last_seq, 0)
  INTO v_min_seq, v_max_seq
  FROM public.conversation_state cs
  WHERE cs.conversation_id = p_conversation_id;

  -- Count total messages
  SELECT COUNT(*) INTO v_total
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id;

  v_page_size := LEAST(GREATEST(COALESCE(p_page_size, 100), 1), 500);

  RETURN QUERY
  SELECT
    v_min_seq,
    v_max_seq,
    v_total,
    v_page_size,
    p_page_offset,
    (
      SELECT jsonb_agg(
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
        ) ORDER BY m.seq ASC
      )
      FROM (
        SELECT *
        FROM public.messages m
        WHERE m.conversation_id = p_conversation_id
        ORDER BY m.seq ASC
        LIMIT v_page_size
        OFFSET p_page_offset
      ) m
    );
END;
$$;
REVOKE ALL ON FUNCTION public.dialog_get_snapshot_v1(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dialog_get_snapshot_v1(UUID, INTEGER, INTEGER) TO authenticated;
COMMENT ON FUNCTION public.dialog_get_snapshot_v1(UUID, INTEGER, INTEGER)
  IS 'REQ-0135: Full conversation snapshot for cursor drift recovery. Returns oldest-to-newest messages in pages.';
-- 3. Trigger: maintain min_seq on message INSERT
CREATE OR REPLACE FUNCTION public.update_conversation_min_seq()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_min BIGINT;
BEGIN
  SELECT cs.min_seq INTO v_current_min
  FROM public.conversation_state cs
  WHERE cs.conversation_id = NEW.conversation_id;

  -- If this is first message or seq is lower than current min, update
  IF v_current_min IS NULL OR v_current_min = 0 OR NEW.seq < v_current_min THEN
    UPDATE public.conversation_state
    SET min_seq = NEW.seq
    WHERE conversation_id = NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_messages_update_min_seq ON public.messages;
CREATE TRIGGER trg_messages_update_min_seq
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_conversation_min_seq();
-- 4. Backfill min_seq for existing conversations (best-effort)
UPDATE public.conversation_state cs
SET min_seq = COALESCE(
  (
    SELECT MIN(m.seq)
    FROM public.messages m
    WHERE m.conversation_id = cs.conversation_id
  ),
  0
)
WHERE cs.min_seq IS NULL OR cs.min_seq = 0;
