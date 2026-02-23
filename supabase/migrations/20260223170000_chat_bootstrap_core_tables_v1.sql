-- =============================================================================
-- Chat bootstrap (Project B): ensure core tables exist
--
-- Why:
-- Some Supabase projects may be linked/used without having chat migrations applied,
-- or migrations might have been applied partially. In that case the app hard-fails
-- with "conversation_participants not found" and chat is unusable.
--
-- This migration is intentionally conservative:
-- - Creates the core tables if missing (idempotent)
-- - Adds a minimal set of columns used by the app/migrations (idempotent)
-- - Enables RLS and installs non-recursive read policies so inbox can load
-- - Does NOT grant any extra table privileges beyond Supabase defaults
-- =============================================================================

BEGIN;

-- 1) Core tables (create if missing)
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Column alignment (in case tables existed but were created differently)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS seq BIGINT,
  ADD COLUMN IF NOT EXISTS client_msg_id UUID,
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS shared_post_id UUID,
  ADD COLUMN IF NOT EXISTS shared_reel_id UUID;

-- 3) RLS on (safe to call repeatedly)
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 4) Minimal non-recursive helper for RLS
CREATE OR REPLACE FUNCTION public.get_user_conversation_ids(user_uuid UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT conversation_id
  FROM public.conversation_participants
  WHERE user_id = user_uuid
$$;

REVOKE ALL ON FUNCTION public.get_user_conversation_ids(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_conversation_ids(UUID) TO authenticated;

-- 5) Minimal policies so chat/inbox can load.
--    (Other migrations may later drop/recreate these policies.)

-- conversation_participants
DROP POLICY IF EXISTS "View own and conversation participants" ON public.conversation_participants;
CREATE POLICY "View own and conversation participants"
ON public.conversation_participants
FOR SELECT
USING (
  user_id = auth.uid()
  OR conversation_id IN (SELECT public.get_user_conversation_ids(auth.uid()))
);

DROP POLICY IF EXISTS "Add self as participant" ON public.conversation_participants;
CREATE POLICY "Add self as participant"
ON public.conversation_participants
FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Update own participation" ON public.conversation_participants;
CREATE POLICY "Update own participation"
ON public.conversation_participants
FOR UPDATE
USING (user_id = auth.uid());

-- conversations
DROP POLICY IF EXISTS "View own conversations" ON public.conversations;
CREATE POLICY "View own conversations"
ON public.conversations
FOR SELECT
USING (id IN (SELECT public.get_user_conversation_ids(auth.uid())));

DROP POLICY IF EXISTS "Create conversation" ON public.conversations;
CREATE POLICY "Create conversation"
ON public.conversations
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Update own conversations" ON public.conversations;
CREATE POLICY "Update own conversations"
ON public.conversations
FOR UPDATE
USING (id IN (SELECT public.get_user_conversation_ids(auth.uid())));

-- messages
DROP POLICY IF EXISTS "View conversation messages" ON public.messages;
CREATE POLICY "View conversation messages"
ON public.messages
FOR SELECT
USING (conversation_id IN (SELECT public.get_user_conversation_ids(auth.uid())));

-- Intentionally do not create any client INSERT policy for messages here.
-- Project B uses RPC-only sends (send_message_v1 / chat_send_message_v11).

-- 6) Performance indexes (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS conversation_participants_conv_user_uidx
  ON public.conversation_participants (conversation_id, user_id);
CREATE INDEX IF NOT EXISTS conversation_participants_user_id_idx
  ON public.conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS conversation_participants_conversation_id_idx
  ON public.conversation_participants (conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON public.messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created
  ON public.messages (created_at DESC);

COMMIT;
