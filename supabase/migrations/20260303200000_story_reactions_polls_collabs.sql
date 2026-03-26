-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- Story Reactions (реакции на Stories)
CREATE TABLE IF NOT EXISTS public.story_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL DEFAULT 'like', -- like, love, laugh, wow, sad, fire, clap, 100
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(story_id, user_id)
);
CREATE INDEX idx_story_reactions_story ON story_reactions(story_id, created_at DESC);
CREATE INDEX idx_story_reactions_user ON story_reactions(user_id, created_at DESC);

-- Story Polls (опросы в Stories)
CREATE TABLE IF NOT EXISTS public.story_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL,
  question TEXT NOT NULL,
  poll_type TEXT NOT NULL DEFAULT 'binary', -- binary, multiple, slider, quiz, emoji
  options JSONB NOT NULL DEFAULT '[]',
  correct_option_index INT, -- для quiz
  allow_multiple BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_story_polls_story ON story_polls(story_id);

CREATE TABLE IF NOT EXISTS public.story_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES story_polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index INT NOT NULL,
  slider_value FLOAT, -- для slider polls
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(poll_id, user_id, option_index)
);
CREATE INDEX idx_story_poll_votes_poll ON story_poll_votes(poll_id);

-- Story Questions (вопросы в Stories)
CREATE TABLE IF NOT EXISTS public.story_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL,
  question_text TEXT NOT NULL,
  is_anonymous BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.story_question_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES story_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Story Countdowns (обратный отсчёт)
CREATE TABLE IF NOT EXISTS public.story_countdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL,
  title TEXT NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.story_countdown_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  countdown_id UUID NOT NULL REFERENCES story_countdowns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(countdown_id, user_id)
);

-- Close Friends List
CREATE TABLE IF NOT EXISTS public.close_friends (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, friend_id)
);
CREATE INDEX idx_close_friends_user ON close_friends(user_id);

-- Collabs (совместные публикации)
CREATE TABLE IF NOT EXISTS public.post_collabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, declined
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE(post_id, invitee_id)
);
CREATE INDEX idx_post_collabs_invitee ON post_collabs(invitee_id, status);

-- Vanish Mode
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS vanish_mode BOOLEAN DEFAULT false;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS vanish_mode_activated_at TIMESTAMPTZ;

-- Music Integration
CREATE TABLE IF NOT EXISTS public.music_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  duration_seconds INT NOT NULL,
  preview_url TEXT,
  cover_url TEXT,
  genre TEXT,
  is_trending BOOLEAN DEFAULT false,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_music_tracks_trending ON music_tracks(is_trending, usage_count DESC);

CREATE TABLE IF NOT EXISTS public.story_music (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL,
  track_id UUID NOT NULL REFERENCES music_tracks(id),
  start_time_seconds FLOAT DEFAULT 0,
  duration_seconds FLOAT DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shop Integration
CREATE TABLE IF NOT EXISTS public.shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shop_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'RUB',
  images JSONB DEFAULT '[]',
  category TEXT,
  in_stock BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shop_products_shop ON shop_products(shop_id, in_stock);

CREATE TABLE IF NOT EXISTS public.product_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  x_position FLOAT NOT NULL, -- 0-1 relative position
  y_position FLOAT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Creator Fund
CREATE TABLE IF NOT EXISTS public.creator_fund_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance DECIMAL(10,2) DEFAULT 0,
  total_earned DECIMAL(10,2) DEFAULT 0,
  is_eligible BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creator_fund_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  payout_method TEXT, -- bank, card, crypto
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE story_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_question_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_countdowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_countdown_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE close_friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_collabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_music ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_fund_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_fund_payouts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can read story reactions" ON story_reactions FOR SELECT USING (true);
CREATE POLICY "Users can create own reactions" ON story_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reactions" ON story_reactions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read polls" ON story_polls FOR SELECT USING (true);
CREATE POLICY "Anyone can read poll votes" ON story_poll_votes FOR SELECT USING (true);
CREATE POLICY "Users can vote" ON story_poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can read questions" ON story_questions FOR SELECT USING (true);
CREATE POLICY "Users can answer" ON story_question_answers FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can read countdowns" ON story_countdowns FOR SELECT USING (true);
CREATE POLICY "Users can subscribe" ON story_countdown_subscribers FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage close friends" ON close_friends FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read collabs" ON post_collabs FOR SELECT USING (true);
CREATE POLICY "Users manage own collabs" ON post_collabs FOR ALL USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);

CREATE POLICY "Anyone can read music" ON music_tracks FOR SELECT USING (true);
CREATE POLICY "Anyone can read story music" ON story_music FOR SELECT USING (true);

CREATE POLICY "Anyone can read shops" ON shops FOR SELECT USING (true);
CREATE POLICY "Owners manage shops" ON shops FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Anyone can read products" ON shop_products FOR SELECT USING (true);
CREATE POLICY "Anyone can read product tags" ON product_tags FOR SELECT USING (true);

CREATE POLICY "Users read own fund" ON creator_fund_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own payouts" ON creator_fund_payouts FOR SELECT USING (auth.uid() = user_id);
