-- Мини-статусы (Notes) как в Instagram DM
CREATE TABLE IF NOT EXISTS user_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) <= 60),
  emoji TEXT,
  audience TEXT DEFAULT 'followers' CHECK (audience IN ('followers', 'close_friends')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_notes_user ON user_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notes_expires ON user_notes(expires_at);

ALTER TABLE user_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_notes" ON user_notes
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "anyone_can_view_active_notes" ON user_notes
  FOR SELECT USING (expires_at > now());
