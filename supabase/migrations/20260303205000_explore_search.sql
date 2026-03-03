-- Полнотекстовый поиск по профилям
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS search_vector tsvector 
  GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(display_name, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(username, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(bio, '')), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_profiles_search ON profiles USING gin(search_vector);

-- Поиск по постам
ALTER TABLE posts ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(content, '')), 'A')
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_posts_search ON posts USING gin(search_vector);

-- Trending hashtags
CREATE TABLE IF NOT EXISTS public.trending_hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag TEXT NOT NULL UNIQUE,
  post_count INT DEFAULT 0,
  recent_count INT DEFAULT 0,
  growth_rate FLOAT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trending_tag ON trending_hashtags(recent_count DESC);

-- История поиска
CREATE TABLE IF NOT EXISTS public.search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  type TEXT DEFAULT 'general',
  result_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id, created_at DESC);

-- Explore кэш
CREATE TABLE IF NOT EXISTS public.explore_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  score FLOAT DEFAULT 0,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_explore_cache_user ON explore_cache(user_id, score DESC);

-- RLS
ALTER TABLE trending_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE explore_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads trending" ON trending_hashtags;
CREATE POLICY "Anyone reads trending" ON trending_hashtags FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users manage search history" ON search_history;
CREATE POLICY "Users manage search history" ON search_history FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read explore" ON explore_cache;
CREATE POLICY "Users read explore" ON explore_cache FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
