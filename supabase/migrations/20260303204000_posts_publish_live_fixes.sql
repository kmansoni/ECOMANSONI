-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- Таблица публикаций (posts) если не существует
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT,
  media JSONB DEFAULT '[]', -- [{url, type: 'image'|'video', width, height}]
  location TEXT,
  tagged_users JSONB DEFAULT '[]',
  hashtags TEXT[] DEFAULT '{}',
  likes_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  shares_count INT DEFAULT 0,
  saves_count INT DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  visibility TEXT DEFAULT 'public', -- public, followers, close_friends
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

-- Лайки постов
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(post_id, user_id)
);

-- Комментарии
CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES post_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON post_comments(parent_id);

-- Сохранённые посты
CREATE TABLE IF NOT EXISTS public.saved_posts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, post_id)
);

-- RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anyone can read posts" ON posts FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Authors manage posts" ON posts FOR ALL USING (auth.uid() = author_id);
CREATE POLICY IF NOT EXISTS "Anyone can read likes" ON post_likes FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Users manage likes" ON post_likes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Anyone can read comments" ON post_comments FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Users manage comments" ON post_comments FOR ALL USING (auth.uid() = author_id);
CREATE POLICY IF NOT EXISTS "Users manage saves" ON saved_posts FOR ALL USING (auth.uid() = user_id);
