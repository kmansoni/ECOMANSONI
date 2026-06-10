-- =========================================================================
-- Guest AI Bots: mention UI/backend contract, query ledger, bot messages
-- =========================================================================

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS supports_guest_queries BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_bots BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.bot_handlers
  DROP CONSTRAINT IF EXISTS bot_handlers_trigger_type_check;
ALTER TABLE public.bot_handlers
  ADD CONSTRAINT bot_handlers_trigger_type_check CHECK (trigger_type IN (
    'keyword', 'command', 'callback', 'regex', 'ai', 'inline_query', 'mention', 'schedule',
    'welcome', 'fallback', 'media', 'reaction', 'member_joined', 'member_left'
  ));

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender_type TEXT NOT NULL DEFAULT 'user' CHECK (sender_type IN ('user', 'bot')),
  ADD COLUMN IF NOT EXISTS bot_id UUID REFERENCES public.bots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.messages
  ALTER COLUMN content DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.bot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  raw_update JSONB NOT NULL DEFAULT '{}',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_messages_bot_created ON public.bot_messages(bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_messages_chat_created ON public.bot_messages(chat_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bot_guest_queries (
  id UUID PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  query_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'failed', 'expired')),
  response_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  response_payload JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_guest_queries_bot_status ON public.bot_guest_queries(bot_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_guest_queries_conversation_created ON public.bot_guest_queries(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_guest_queries_requester_created ON public.bot_guest_queries(requester_id, created_at DESC);

ALTER TABLE public.bot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_guest_queries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bot owners view bot messages" ON public.bot_messages;
CREATE POLICY "Bot owners view bot messages" ON public.bot_messages
  FOR SELECT
  USING (bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Conversation members view bot messages" ON public.bot_messages;
CREATE POLICY "Conversation members view bot messages" ON public.bot_messages
  FOR SELECT
  USING (chat_id IN (SELECT public.get_user_conversation_ids(auth.uid())));

DROP POLICY IF EXISTS "Bot owners view guest queries" ON public.bot_guest_queries;
CREATE POLICY "Bot owners view guest queries" ON public.bot_guest_queries
  FOR SELECT
  USING (bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Conversation members view guest queries" ON public.bot_guest_queries;
CREATE POLICY "Conversation members view guest queries" ON public.bot_guest_queries
  FOR SELECT
  USING (conversation_id IN (SELECT public.get_user_conversation_ids(auth.uid())));

DROP POLICY IF EXISTS "Conversation members create guest queries" ON public.bot_guest_queries;
CREATE POLICY "Conversation members create guest queries" ON public.bot_guest_queries
  FOR INSERT
  WITH CHECK (
    requester_id = auth.uid()
    AND conversation_id IN (SELECT public.get_user_conversation_ids(auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.expire_old_bot_guest_queries()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.bot_guest_queries
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_old_bot_guest_queries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_old_bot_guest_queries() TO authenticated;
