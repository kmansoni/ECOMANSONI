-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- Интересы пользователя (для content relevance)
CREATE TABLE IF NOT EXISTS public.user_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interest_tag TEXT NOT NULL,
  weight FLOAT DEFAULT 1.0,
  source TEXT DEFAULT 'implicit', -- implicit (из поведения), explicit (выбрал сам)
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, interest_tag)
);
CREATE INDEX IF NOT EXISTS idx_user_interests_user ON user_interests(user_id, weight DESC);

-- Feed impressions (для отслеживания просмотров)
CREATE TABLE IF NOT EXISTS public.feed_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL,
  impression_type TEXT DEFAULT 'view', -- view, scroll_past, engaged
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feed_impressions_user ON feed_impressions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_impressions_post ON feed_impressions(post_id, created_at DESC);

-- Post content tags (для matching с интересами)
CREATE TABLE IF NOT EXISTS public.post_content_tags (
  post_id UUID NOT NULL,
  tag TEXT NOT NULL,
  confidence FLOAT DEFAULT 1.0,
  PRIMARY KEY(post_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_post_content_tags_tag ON post_content_tags(tag);

-- Feed quality metrics
CREATE TABLE IF NOT EXISTS public.feed_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  posts_shown INT DEFAULT 0,
  posts_engaged INT DEFAULT 0,
  avg_scroll_depth FLOAT,
  time_spent_seconds INT,
  diversity_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, session_date)
);

-- RLS
ALTER TABLE user_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_content_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_quality_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own interests" ON user_interests FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own impressions" ON feed_impressions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone can read post tags" ON post_content_tags FOR SELECT USING (true);
CREATE POLICY "Users read own metrics" ON feed_quality_metrics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users write own metrics" ON feed_quality_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own metrics" ON feed_quality_metrics FOR UPDATE USING (auth.uid() = user_id);
