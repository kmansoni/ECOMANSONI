-- Таблица быстрых ответов (шаблоны для бизнеса)
CREATE TABLE IF NOT EXISTS quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shortcut TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_user ON quick_replies(user_id);

ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_quick_replies" ON quick_replies
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
