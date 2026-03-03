-- Geolocation для постов
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_name TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_lat FLOAT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_lng FLOAT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS alt_text TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_paid_partnership BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments_policy TEXT DEFAULT 'all'; -- all, followers, off

-- Закреплённые посты
ALTER TABLE posts ADD COLUMN IF NOT EXISTS pin_position INT; -- 1,2,3 или NULL

-- Ограничения пользователей (restrict)
CREATE TABLE IF NOT EXISTS public.restricted_users (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restricted_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, restricted_id)
);

-- Story стикеры
CREATE TABLE IF NOT EXISTS public.story_stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL,
  type TEXT NOT NULL, -- text, mention, hashtag, location, gif, link, music, poll, question, quiz, emoji_slider, countdown
  data JSONB NOT NULL DEFAULT '{}',
  position_x FLOAT DEFAULT 0.5,
  position_y FLOAT DEFAULT 0.5,
  scale FLOAT DEFAULT 1.0,
  rotation FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_story_stickers ON story_stickers(story_id);

-- Story quiz
CREATE TABLE IF NOT EXISTS public.story_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  correct_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.story_quiz_answers (
  quiz_id UUID NOT NULL REFERENCES story_quizzes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selected_index INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(quiz_id, user_id)
);

-- Story emoji slider
CREATE TABLE IF NOT EXISTS public.story_emoji_sliders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL,
  emoji TEXT NOT NULL DEFAULT '😍',
  prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.story_emoji_slider_votes (
  slider_id UUID NOT NULL REFERENCES story_emoji_sliders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value FLOAT NOT NULL DEFAULT 0.5, -- 0.0-1.0
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(slider_id, user_id)
);

-- Story links
ALTER TABLE stories ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS link_text TEXT;

-- Post reminders
CREATE TABLE IF NOT EXISTS public.post_reminders (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(post_id, user_id)
);

-- Reel remix
ALTER TABLE reels ADD COLUMN IF NOT EXISTS remix_of UUID;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS audio_id UUID;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS speed FLOAT DEFAULT 1.0;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS captions JSONB; -- [{time, text}]
ALTER TABLE reels ADD COLUMN IF NOT EXISTS allow_remix BOOLEAN DEFAULT true;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS allow_download BOOLEAN DEFAULT true;

-- Reel audio (tracks)
CREATE TABLE IF NOT EXISTS public.reel_audios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT,
  cover_url TEXT,
  audio_url TEXT NOT NULL,
  duration_seconds FLOAT DEFAULT 0,
  reels_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reel_audios_popular ON reel_audios(reels_count DESC);

-- Add Yours sticker chains
CREATE TABLE IF NOT EXISTS public.add_yours_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt TEXT NOT NULL,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participants_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.add_yours_entries (
  chain_id UUID NOT NULL REFERENCES add_yours_chains(id) ON DELETE CASCADE,
  story_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(chain_id, user_id)
);

-- RLS
ALTER TABLE restricted_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_quiz_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_emoji_sliders ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_emoji_slider_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE reel_audios ENABLE ROW LEVEL SECURITY;
ALTER TABLE add_yours_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE add_yours_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage restrictions" ON restricted_users FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone reads stickers" ON story_stickers FOR SELECT USING (true);
CREATE POLICY "Anyone reads quizzes" ON story_quizzes FOR SELECT USING (true);
CREATE POLICY "Users answer quizzes" ON story_quiz_answers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone reads sliders" ON story_emoji_sliders FOR SELECT USING (true);
CREATE POLICY "Users vote sliders" ON story_emoji_slider_votes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage reminders" ON post_reminders FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone reads audios" ON reel_audios FOR SELECT USING (true);
CREATE POLICY "Anyone reads chains" ON add_yours_chains FOR SELECT USING (true);
CREATE POLICY "Users join chains" ON add_yours_entries FOR ALL USING (auth.uid() = user_id);
