-- Chat folders: system tabs + hidden + passcode

ALTER TABLE public.chat_folders
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_kind TEXT,
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS passcode_hash TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_folders_system_kind_check'
  ) THEN
    ALTER TABLE public.chat_folders
      ADD CONSTRAINT chat_folders_system_kind_check
      CHECK (system_kind IS NULL OR system_kind IN ('all','chats','groups','channels'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS chat_folders_user_system_kind_uniq
  ON public.chat_folders(user_id, system_kind)
  WHERE system_kind IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_folders_user_sort_order_idx
  ON public.chat_folders(user_id, sort_order);
