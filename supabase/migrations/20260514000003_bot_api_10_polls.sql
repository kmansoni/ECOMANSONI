-- Polls table for Bot API 10.0 enhancements
CREATE TABLE IF NOT EXISTS public.polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  is_anonymous BOOLEAN DEFAULT true,
  type TEXT CHECK (type IN ('regular', 'quiz')) DEFAULT 'regular',
  allows_multiple_answers BOOLEAN DEFAULT false,
  correct_option_id INTEGER,
  explanation TEXT,
  explanation_parse_mode TEXT CHECK (explanation_parse_mode IN ('HTML', 'Markdown', 'MarkdownV2')),
  open_period INTEGER,
  close_date TIMESTAMP WITH TIME ZONE,
  is_closed BOOLEAN DEFAULT false,
  -- Bot API 10.0 additions
  members_only BOOLEAN DEFAULT false,
  country_codes TEXT[] DEFAULT '{}',
  allows_revoting BOOLEAN DEFAULT false,
  shuffle_ones BOOLEAN DEFAULT false,
  allow_adding_options BOOLEAN DEFAULT false,
  hide_results_until_closed BOOLEAN DEFAULT false,
  description TEXT,
  description_parse_mode TEXT CHECK (description_parse_mode IN ('HTML', 'Markdown', 'MarkdownV2')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Poll votes
CREATE TABLE IF NOT EXISTS public.poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  option_ids INTEGER[] NOT NULL,
  voted_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Poll options (for added options feature)
CREATE TABLE IF NOT EXISTS public.poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  added_by_user_id UUID REFERENCES auth.users(id),
  added_by_chat_id TEXT,
  addition_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  persistent_id TEXT
);

-- Enable RLS
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_polls_bot_id ON public.polls(bot_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON public.poll_votes(poll_id);