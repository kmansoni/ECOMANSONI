-- ============================================================================
-- AI Stickers — пользовательские стикеры, созданные через AI
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 500),
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_stickers_user
  ON ai_stickers(user_id);

ALTER TABLE ai_stickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_stickers_select_own"
  ON ai_stickers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "ai_stickers_insert_own"
  ON ai_stickers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ai_stickers_delete_own"
  ON ai_stickers FOR DELETE
  USING (auth.uid() = user_id);
