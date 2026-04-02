-- ============================================================================
-- Boosted Posts — продвижение постов
-- ============================================================================

CREATE TABLE IF NOT EXISTS boosted_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  budget_cents INTEGER NOT NULL CHECK (budget_cents >= 100),
  spent_cents INTEGER NOT NULL DEFAULT 0 CHECK (spent_cents >= 0),
  duration_hours INTEGER NOT NULL CHECK (duration_hours BETWEEN 1 AND 720),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  target_reach INTEGER NOT NULL DEFAULT 0,
  actual_reach INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_boosted_posts_user
  ON boosted_posts(user_id);

CREATE INDEX IF NOT EXISTS idx_boosted_posts_status
  ON boosted_posts(status)
  WHERE status = 'active';

ALTER TABLE boosted_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "boosted_posts_select_own"
  ON boosted_posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "boosted_posts_insert_own"
  ON boosted_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "boosted_posts_update_own"
  ON boosted_posts FOR UPDATE
  USING (auth.uid() = user_id);
