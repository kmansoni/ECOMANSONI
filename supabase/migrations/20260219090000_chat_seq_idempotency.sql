-- =====================================================
-- DM core: idempotent sends + stable per-conversation ordering
-- =====================================================

-- 1) Conversations: keep a monotonically increasing message sequence.
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS last_message_seq BIGINT NOT NULL DEFAULT 0;

-- 2) Messages: client-side id for retry safety + server-assigned seq.
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS client_msg_id UUID;

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS seq BIGINT;

-- 3) Uniqueness + read/query performance.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conv_sender_client_msg
  ON public.messages (conversation_id, sender_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conv_seq_unique
  ON public.messages (conversation_id, seq)
  WHERE seq IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conv_seq
  ON public.messages (conversation_id, seq)
  WHERE seq IS NOT NULL;

-- 4) Assign seq + touch conversation.updated_at in the same transaction.
--    This keeps conversation ordering fresh even if clients don't update conversations.
CREATE OR REPLACE FUNCTION public.assign_message_seq_and_touch_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_seq BIGINT;
BEGIN
  -- Bump seq and updated_at for the conversation.
  UPDATE public.conversations
  SET
    last_message_seq = last_message_seq + 1,
    updated_at = now()
  WHERE id = NEW.conversation_id
  RETURNING last_message_seq INTO next_seq;

  IF next_seq IS NULL THEN
    RAISE EXCEPTION 'Conversation % not found', NEW.conversation_id;
  END IF;

  -- Assign the sequence if not provided.
  IF NEW.seq IS NULL THEN
    NEW.seq := next_seq;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_assign_seq_touch_conversation ON public.messages;

CREATE TRIGGER trg_messages_assign_seq_touch_conversation
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.assign_message_seq_and_touch_conversation();
