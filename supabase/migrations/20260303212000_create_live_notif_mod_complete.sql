-- Черновики контента
CREATE TABLE IF NOT EXISTS public.content_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- post, reel, story
  content TEXT,
  media JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}', -- hashtags, location, tagged_users, etc
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drafts_user ON content_drafts(user_id, updated_at DESC);

-- Запланированные публикации
ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;

-- People tags на фото
CREATE TABLE IF NOT EXISTS public.post_people_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_index INT DEFAULT 0,
  x FLOAT DEFAULT 0.5,
  y FLOAT DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_tags_post ON post_people_tags(post_id);

-- Live: расширения
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS replay_url TEXT;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS max_guests INT DEFAULT 1;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS pinned_comment TEXT;

-- Live Q&A
CREATE TABLE IF NOT EXISTS public.live_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  is_answered BOOLEAN DEFAULT false,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_questions ON live_questions(session_id, is_answered, created_at);

-- Live donations
CREATE TABLE IF NOT EXISTS public.live_donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  donor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  streamer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount FLOAT NOT NULL,
  currency TEXT DEFAULT 'stars',
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Скрытые слова пользователя
CREATE TABLE IF NOT EXISTS public.user_hidden_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hidden_words_user ON user_hidden_words(user_id);

-- RLS
ALTER TABLE content_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_people_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_hidden_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage drafts" ON content_drafts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone reads people tags" ON post_people_tags FOR SELECT USING (true);
CREATE POLICY "Users manage people tags" ON post_people_tags FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone reads live questions" ON live_questions FOR SELECT USING (true);
CREATE POLICY "Users ask questions" ON live_questions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone reads donations" ON live_donations FOR SELECT USING (true);
CREATE POLICY "Users donate" ON live_donations FOR INSERT WITH CHECK (auth.uid() = donor_id);
CREATE POLICY "Users manage hidden words" ON user_hidden_words FOR ALL USING (auth.uid() = user_id);
