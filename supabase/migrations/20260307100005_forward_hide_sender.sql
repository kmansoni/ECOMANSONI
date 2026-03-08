-- ─────────────────────────────────────────────────────────────────────────────
-- Forward without author: add forward_hide_sender column to messages
-- Safe to re-run: uses IF NOT EXISTS column add guard
-- ─────────────────────────────────────────────────────────────────────────────

-- Direct Messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'messages'
       AND column_name  = 'forward_hide_sender'
  ) THEN
    ALTER TABLE public.messages
      ADD COLUMN forward_hide_sender boolean NOT NULL DEFAULT false;
  END IF;
END;
$$;

-- Group chat messages table (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name   = 'group_chat_messages'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'group_chat_messages'
       AND column_name  = 'forward_hide_sender'
  ) THEN
    ALTER TABLE public.group_chat_messages
      ADD COLUMN forward_hide_sender boolean NOT NULL DEFAULT false;
  END IF;
END;
$$;

-- Channel messages table (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name   = 'channel_messages'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'channel_messages'
       AND column_name  = 'forward_hide_sender'
  ) THEN
    ALTER TABLE public.channel_messages
      ADD COLUMN forward_hide_sender boolean NOT NULL DEFAULT false;
  END IF;
END;
$$;

-- Index for querying forwarded messages with hidden sender
-- (useful for moderation dashboards)
CREATE INDEX IF NOT EXISTS idx_messages_forward_hide_sender
  ON public.messages(forward_hide_sender)
  WHERE forward_hide_sender = true;
