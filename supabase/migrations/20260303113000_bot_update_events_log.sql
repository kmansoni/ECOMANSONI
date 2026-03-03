-- Bot webhook durable event log
-- Stores incoming/outgoing Telegram updates without requiring internal chat/message UUID mapping.

CREATE TABLE IF NOT EXISTS public.bot_update_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  event_type TEXT NOT NULL,
  telegram_chat_id TEXT,
  telegram_message_id TEXT,
  telegram_user_id BIGINT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_update_events_bot ON public.bot_update_events(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_update_events_type ON public.bot_update_events(event_type);
CREATE INDEX IF NOT EXISTS idx_bot_update_events_tg_user ON public.bot_update_events(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_bot_update_events_created ON public.bot_update_events(created_at DESC);

ALTER TABLE public.bot_update_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bot owners can view update events" ON public.bot_update_events;
CREATE POLICY "Bot owners can view update events" ON public.bot_update_events
  FOR SELECT
  USING (bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Bot owners can insert update events" ON public.bot_update_events;
CREATE POLICY "Bot owners can insert update events" ON public.bot_update_events
  FOR INSERT
  WITH CHECK (bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid()));
