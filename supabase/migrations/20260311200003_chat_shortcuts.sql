-- Chat Shortcuts: pinned chats on PWA home screen
-- Migration: 20260311200003

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS public.chat_shortcuts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chat_id UUID NOT NULL,
    chat_type TEXT NOT NULL CHECK (chat_type IN ('dm', 'group', 'channel', 'bot')),
    label TEXT NOT NULL,
    icon_url TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, chat_id)
  );
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_shortcuts_user ON public.chat_shortcuts(user_id, sort_order);

ALTER TABLE public.chat_shortcuts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'chat_shortcuts' AND policyname = 'cs_select_own'
  ) THEN
    CREATE POLICY "cs_select_own" ON public.chat_shortcuts
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'chat_shortcuts' AND policyname = 'cs_insert_own'
  ) THEN
    CREATE POLICY "cs_insert_own" ON public.chat_shortcuts
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'chat_shortcuts' AND policyname = 'cs_update_own'
  ) THEN
    CREATE POLICY "cs_update_own" ON public.chat_shortcuts
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'chat_shortcuts' AND policyname = 'cs_delete_own'
  ) THEN
    CREATE POLICY "cs_delete_own" ON public.chat_shortcuts
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
