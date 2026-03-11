-- ============================================================
-- Batch 3: Chat Shortcuts (PWA home screen pinned chats)
-- ============================================================

CREATE TABLE public.chat_shortcuts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL, -- ÃÃÂ¼ÃÃÂ¾ÃÃÂ¶ÃÃÂµÃ ÃÃÂ±ÃÃÃ conversation_id, channel_id, group_id
  chat_type TEXT NOT NULL CHECK (chat_type IN ('dm', 'group', 'channel', 'bot')),
  label TEXT NOT NULL, -- ÃÃÂ¾ÃÃÃÂ¾ÃÃÂ±ÃÃÃÂ°ÃÃÂµÃÃÂ¼ÃÃÂ¾ÃÃÂµ ÃÃÂ¸ÃÃÂ¼Ã
  icon_url TEXT, -- ÃÃÂ°ÃÃÂ²ÃÃÂ°ÃÃÃÂ°Ã ÃÃÃÂ°ÃÃÂ°
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, chat_id)
);

CREATE INDEX idx_chat_shortcuts_user ON public.chat_shortcuts(user_id, sort_order);

ALTER TABLE public.chat_shortcuts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs_select_own" ON public.chat_shortcuts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cs_insert_own" ON public.chat_shortcuts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cs_update_own" ON public.chat_shortcuts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "cs_delete_own" ON public.chat_shortcuts
  FOR DELETE USING (auth.uid() = user_id);
