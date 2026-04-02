-- Trial Reels: A/B тестирование аудитории
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS trial_audience_percent INTEGER DEFAULT 10
  CHECK (trial_audience_percent BETWEEN 1 AND 50);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS trial_ended_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS trial_stats JSONB DEFAULT '{}'::jsonb;

-- Индекс для фильтрации trial reels
CREATE INDEX IF NOT EXISTS idx_posts_trial ON posts(author_id) WHERE is_trial = true;
