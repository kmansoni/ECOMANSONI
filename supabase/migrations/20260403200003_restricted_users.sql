-- Мягкая блокировка (Restrict) как в Instagram
CREATE TABLE IF NOT EXISTS restricted_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restricted_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, restricted_user_id)
);

CREATE INDEX IF NOT EXISTS idx_restricted_users_user ON restricted_users(user_id);
CREATE INDEX IF NOT EXISTS idx_restricted_users_target ON restricted_users(restricted_user_id);

ALTER TABLE restricted_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_restrictions" ON restricted_users
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
