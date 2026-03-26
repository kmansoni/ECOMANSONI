-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- AI Assistant: chat messages + usage limits
-- Migration: 20260311100001

CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens_used INT DEFAULT 0,
  model TEXT DEFAULT 'gpt-4o-mini',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_user ON public.ai_chat_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_conv ON public.ai_chat_messages(conversation_id, created_at);

ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_chat_messages' AND policyname = 'ai_chat_select_own'
  ) THEN
    CREATE POLICY "ai_chat_select_own" ON public.ai_chat_messages
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_chat_messages' AND policyname = 'ai_chat_insert_own'
  ) THEN
    CREATE POLICY "ai_chat_insert_own" ON public.ai_chat_messages
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_chat_messages' AND policyname = 'ai_chat_delete_own'
  ) THEN
    CREATE POLICY "ai_chat_delete_own" ON public.ai_chat_messages
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Usage limits table
CREATE TABLE IF NOT EXISTS public.ai_usage_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_messages_used INT DEFAULT 0,
  daily_reset_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 day'),
  total_tokens_used BIGINT DEFAULT 0,
  is_premium BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_usage_limits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_usage_limits' AND policyname = 'ai_limits_select_own'
  ) THEN
    CREATE POLICY "ai_limits_select_own" ON public.ai_usage_limits
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
