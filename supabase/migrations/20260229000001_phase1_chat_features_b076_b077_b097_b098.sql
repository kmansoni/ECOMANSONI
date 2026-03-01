-- ============================================================================
-- PHASE 1: Messaging Core Features (B-076, B-077, B-097, B-098)
-- ============================================================================
-- 1. B-098: Message Threads (Nested Replies, Conversation Trees)
-- 2. B-077: Scheduled Messages (Send at Specific Time)
-- 3. B-076: Disappearing Messages (Ephemeral Messages)
-- 4. B-097: Message Translation (Real-time, Optional)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. MESSAGE THREADS (B-098)
-- ============================================================================

-- Add thread-related columns to messages table
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thread_root_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

-- Add indexes for thread queries
CREATE INDEX IF NOT EXISTS idx_messages_thread_root ON public.messages(thread_root_message_id) WHERE thread_root_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;

-- Create thread muted table for thread notifications
CREATE TABLE IF NOT EXISTS public.threads_muted (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  muted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, message_id)
);

-- RLS for threads_muted
ALTER TABLE public.threads_muted ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own thread mutes" ON public.threads_muted
  FOR ALL USING (user_id = auth.uid());

-- ============================================================================
-- 2. SCHEDULED MESSAGES (B-077)
-- ============================================================================

-- Create scheduled_messages table
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  duration_seconds INTEGER,
  scheduled_for TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'cancelled', 'failed')),
  
  -- Thread support for scheduled messages
  reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  thread_root_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL
);

-- Indexes for scheduled messages
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_scheduled_for ON public.scheduled_messages(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user ON public.scheduled_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_conversation ON public.scheduled_messages(conversation_id);

-- RLS for scheduled_messages
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own scheduled messages" ON public.scheduled_messages
  FOR ALL USING (user_id = auth.uid());

-- ============================================================================
-- 3. DISAPPEARING MESSAGES (B-076)
-- ============================================================================

-- Add disappearing message columns to messages table
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS disappear_in_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS disappear_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disappear_notified BOOLEAN DEFAULT false;

-- Add disappearing message columns to group_chat_messages
ALTER TABLE public.group_chat_messages
  ADD COLUMN IF NOT EXISTS disappear_in_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS disappear_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disappear_notified BOOLEAN DEFAULT false;

-- Add disappearing message columns to channel_messages
ALTER TABLE public.channel_messages
  ADD COLUMN IF NOT EXISTS disappear_in_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS disappear_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disappear_notified BOOLEAN DEFAULT false;

-- Add conversation-level default disappear timer
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS default_disappear_seconds INTEGER;

ALTER TABLE public.group_chats
  ADD COLUMN IF NOT EXISTS default_disappear_seconds INTEGER;

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS default_disappear_seconds INTEGER;

-- Index for disappearing messages cleanup job
CREATE INDEX IF NOT EXISTS idx_messages_disappear_at ON public.messages(disappear_at) 
  WHERE disappear_at IS NOT NULL;

-- ============================================================================
-- 4. MESSAGE TRANSLATION (B-097)
-- ============================================================================

-- Create translated_messages table
CREATE TABLE IF NOT EXISTS public.translated_messages (
  translation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  source_language VARCHAR(10) NOT NULL,
  target_language VARCHAR(10) NOT NULL,
  translated_text TEXT NOT NULL,
  translated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, source_language, target_language)
);

-- Index for translation lookups
CREATE INDEX IF NOT EXISTS idx_translated_messages_message ON public.translated_messages(message_id);

-- RLS for translated_messages
ALTER TABLE public.translated_messages ENABLE ROW LEVEL SECURITY;

-- Translation visibility: users can see translations for messages they can access
CREATE POLICY "Users can read translations for accessible messages" ON public.translated_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_participants cp ON m.conversation_id = cp.conversation_id
      WHERE m.id = translated_messages.message_id AND cp.user_id = auth.uid()
    )
  );

-- Allow users to insert translations they've generated
CREATE POLICY "Users can insert own translations" ON public.translated_messages
  FOR INSERT WITH CHECK (true);

-- Add conversation-level translation setting
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS translation_enabled BOOLEAN DEFAULT true;

COMMIT;
