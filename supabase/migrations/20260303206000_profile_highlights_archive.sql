-- Highlights (подборки из Stories)
CREATE TABLE IF NOT EXISTS public.highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cover_url TEXT,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_highlights_user ON highlights(user_id, position);

-- Story в Highlight
CREATE TABLE IF NOT EXISTS public.highlight_stories (
  highlight_id UUID NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  story_id UUID NOT NULL,
  position INT DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(highlight_id, story_id)
);

-- Архив постов
CREATE TABLE IF NOT EXISTS public.archived_posts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  archived_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, post_id)
);

-- Архив Stories
CREATE TABLE IF NOT EXISTS public.archived_stories (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id UUID NOT NULL,
  archived_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, story_id)
);

-- Блокировки пользователей
CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(blocker_id, blocked_id)
);

-- Настройки приватности профиля
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- RLS
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE highlight_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE archived_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE archived_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads highlights" ON highlights FOR SELECT USING (true);
CREATE POLICY "Users manage highlights" ON highlights FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone reads highlight stories" ON highlight_stories FOR SELECT USING (true);
CREATE POLICY "Users manage highlight stories" ON highlight_stories FOR ALL USING (
  EXISTS(SELECT 1 FROM highlights WHERE id = highlight_id AND user_id = auth.uid())
);
CREATE POLICY "Users manage archived posts" ON archived_posts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage archived stories" ON archived_stories FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage blocks" ON blocked_users FOR ALL USING (auth.uid() = blocker_id);
