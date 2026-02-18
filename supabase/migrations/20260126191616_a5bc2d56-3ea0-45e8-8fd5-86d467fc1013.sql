-- Allow message recipients (conversation participants) to mark incoming messages as read
-- This is required for unread counters based on messages.is_read.

DO $$
BEGIN
  -- Ensure RLS is enabled (no-op if already enabled)
  EXECUTE 'ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY';
EXCEPTION
  WHEN others THEN
    -- ignore
    NULL;
END $$;

-- Drop if exists to keep migration idempotent
DROP POLICY IF EXISTS "Participants can mark incoming messages read" ON public.messages;

CREATE POLICY "Participants can mark incoming messages read"
ON public.messages
FOR UPDATE
USING (
  -- Must be a participant of the conversation
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
  )
  -- Only allow updating messages not sent by the current user
  AND messages.sender_id <> auth.uid()
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
  )
  AND messages.sender_id <> auth.uid()
);
