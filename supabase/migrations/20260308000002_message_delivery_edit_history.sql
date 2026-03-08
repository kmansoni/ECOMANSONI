-- ============================================================
-- Migration: Message delivery status + edit history + thread read positions
-- Priority: P1 — required for Telegram-parity UX
-- Date: 2026-03-08
-- ============================================================

-- ============================================================
-- 1. messages.delivery_status — per-message delivery state
--    Values: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
--    Default 'sent' for back-compat (all existing messages are "sent")
-- ============================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('sending', 'sent', 'delivered', 'read', 'failed'));

-- ============================================================
-- 2. messages.client_local_id — client-generated UUID for outbox dedup
--    Allows server to deduplicate retries from the offline outbox.
--    UNIQUE per author to prevent replay across users.
-- ============================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS client_local_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'messages'
      AND indexname = 'idx_messages_client_local_id'
      AND schemaname = 'public'
  ) THEN
    CREATE UNIQUE INDEX idx_messages_client_local_id
      ON public.messages(sender_id, client_local_id)
      WHERE client_local_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 3. messages.edit_count — incremented on every successful edit
-- ============================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edit_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- 4. messages.edited_at — timestamp of last edit (NULL if never edited)
-- ============================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- ============================================================
-- 5. message_edit_history — append-only log of all edits
--    Never updated; only inserted. Supports "view edit history" UX.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.message_edit_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id     UUID NOT NULL,
  -- NULL when the editor's account is deleted (FK ON DELETE SET NULL).
  -- Keeps the audit trail intact for content moderation after user removal.
  editor_id      UUID,
  old_content    TEXT NOT NULL,
  new_content    TEXT NOT NULL,
  edited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  edit_number    INTEGER NOT NULL, -- mirrors messages.edit_count at time of edit
  -- Soft-delete: set to true when the message is deleted; history is retained
  -- for moderation purposes but hidden from clients.
  hidden         BOOLEAN NOT NULL DEFAULT false
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_edit_history_message_id'
      AND table_name = 'message_edit_history'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.message_edit_history
      ADD CONSTRAINT fk_edit_history_message_id
      FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_edit_history_editor_id'
      AND table_name = 'message_edit_history'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.message_edit_history
      ADD CONSTRAINT fk_edit_history_editor_id
      FOREIGN KEY (editor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_edit_history_message_id
  ON public.message_edit_history(message_id, edit_number DESC);

-- ============================================================
-- 6. message_read_receipts — per-user read timestamps for DMs + groups
--    Replaces any ad-hoc solution; enables "seen by 45 of 100" in channels.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.message_read_receipts (
  message_id     UUID NOT NULL,
  user_id        UUID NOT NULL,
  read_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_read_receipts_message_id'
      AND table_name = 'message_read_receipts'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.message_read_receipts
      ADD CONSTRAINT fk_read_receipts_message_id
      FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_read_receipts_user_id'
      AND table_name = 'message_read_receipts'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.message_read_receipts
      ADD CONSTRAINT fk_read_receipts_user_id
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Efficient lookup: "who has read this message?"
CREATE INDEX IF NOT EXISTS idx_read_receipts_message_id
  ON public.message_read_receipts(message_id);

-- Efficient lookup: "what's the last message this user has read in a conversation?"
-- (Used to compute unread count efficiently without full table scan)
CREATE INDEX IF NOT EXISTS idx_read_receipts_user_id
  ON public.message_read_receipts(user_id, read_at DESC);

-- ============================================================
-- 7. Trigger: auto-update messages.delivery_status to 'read'
--    when a read receipt is inserted.
--    Only for DMs (group delivery_status handled at channel level).
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_message_read_receipt_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Advance delivery status to 'read' — never regress
  UPDATE public.messages
    SET delivery_status = 'read'
  WHERE id = NEW.message_id
    AND delivery_status IN ('sending', 'sent', 'delivered');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_read_receipt ON public.message_read_receipts;
CREATE TRIGGER trg_message_read_receipt
  AFTER INSERT ON public.message_read_receipts
  FOR EACH ROW EXECUTE FUNCTION public.on_message_read_receipt_insert();

-- ============================================================
-- 8. Trigger: auto-record edit history when messages.content changes
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_message_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only record when content actually changes
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    INSERT INTO public.message_edit_history (
      message_id, editor_id, old_content, new_content,
      edited_at, edit_number
    ) VALUES (
      NEW.id,
      -- auth.uid() tracks who actually performed the edit (may differ from sender
      -- in moderated groups). Falls back to sender_id when called from a trigger
      -- context where auth.uid() is NULL (e.g. service-role direct UPDATE).
      COALESCE(auth.uid(), NEW.sender_id),
      OLD.content,
      NEW.content,
      now(),
      NEW.edit_count
    );

    NEW.edit_count := OLD.edit_count + 1;
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_edit ON public.messages;
CREATE TRIGGER trg_message_edit
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.on_message_edit();

-- ============================================================
-- 9. RLS policies for message_edit_history
--    - Read: participants of the conversation can read non-hidden edits
--    - Insert: server-side trigger only (no direct client insert)
-- ============================================================
ALTER TABLE public.message_edit_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'message_edit_history'
      AND policyname = 'message_edit_history_read'
      AND schemaname = 'public'
  ) THEN
    -- Participants can read edit history for messages in their conversations
    EXECUTE $pol$
      CREATE POLICY message_edit_history_read
        ON public.message_edit_history
        FOR SELECT
        USING (
          hidden = false
          AND EXISTS (
            SELECT 1 FROM public.messages m
            JOIN public.conversation_participants cp
              ON cp.conversation_id = m.conversation_id
            WHERE m.id = message_edit_history.message_id
              AND cp.user_id = auth.uid()
          )
        )
    $pol$;
  END IF;
END $$;

-- ============================================================
-- 10. RLS policies for message_read_receipts
--     - READ: sender of the message + all participants can see receipts
--     - INSERT: only own receipt (user_id = auth.uid())
-- ============================================================
ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'message_read_receipts'
      AND policyname = 'read_receipts_select'
      AND schemaname = 'public'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY read_receipts_select
        ON public.message_read_receipts
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.messages m
            JOIN public.conversation_participants cp
              ON cp.conversation_id = m.conversation_id
            WHERE m.id = message_read_receipts.message_id
              AND cp.user_id = auth.uid()
          )
        )
    $pol$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'message_read_receipts'
      AND policyname = 'read_receipts_insert'
      AND schemaname = 'public'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY read_receipts_insert
        ON public.message_read_receipts
        FOR INSERT
        WITH CHECK (user_id = auth.uid())
    $pol$;
  END IF;
END $$;

-- ============================================================
-- 11. thread_read_positions — tracks last-read position per thread
--     Required by useThreadBadge to calculate unread counts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.thread_read_positions (
  user_id                  UUID NOT NULL,
  conversation_id          UUID NOT NULL,
  thread_root_message_id   UUID NOT NULL,
  last_read_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, thread_root_message_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_thread_read_pos_user'
      AND table_name = 'thread_read_positions'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.thread_read_positions
      ADD CONSTRAINT fk_thread_read_pos_user
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_thread_read_pos_conv
  ON public.thread_read_positions(user_id, conversation_id);

ALTER TABLE public.thread_read_positions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'thread_read_positions'
      AND policyname = 'thread_read_pos_own'
      AND schemaname = 'public'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY thread_read_pos_own
        ON public.thread_read_positions
        FOR ALL
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid())
    $pol$;
  END IF;
END $$;
