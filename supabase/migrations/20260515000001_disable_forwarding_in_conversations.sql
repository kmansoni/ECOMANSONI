-- Migration: Add disable_forwarding to conversations for 1-on-1 chat privacy
-- Feature: "Disable Sharing in Private Chats" (Telegram March 2026)
-- When true, prevents forwarding messages from this conversation
-- Date: 2025-05-15

BEGIN;

-- Add disable_forwarding column to conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS disable_forwarding BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON COLUMN public.conversations.disable_forwarding IS 'Prevent forwarding messages from this conversation (Telegram March 2026 Privacy feature)';

-- RLS policy: only conversation participants can update this setting
CREATE POLICY IF NOT EXISTS "Users can update disable_forwarding for their conversations"
ON public.conversations FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = conversations.id
    AND user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = conversations.id
    AND user_id = auth.uid()
  )
);

COMMIT;