-- Ensure DELETE events carry enough old-row data for Realtime + RLS evaluation
-- and allow users to delete their own messages.

-- 1) Realtime DELETE payloads may not include conversation_id unless replica identity is FULL.
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- 2) Allow authenticated users to delete their own messages in conversations they participate in.
DO $$
BEGIN
  CREATE POLICY "Users can delete own messages" ON public.messages
    FOR DELETE
    USING (
      auth.uid() = sender_id
      AND EXISTS (
        SELECT 1
        FROM public.conversation_participants cp
        WHERE cp.conversation_id = conversation_id
          AND cp.user_id = auth.uid()
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3) Ensure authenticated role has DELETE privilege (RLS still applies).
GRANT DELETE ON TABLE public.messages TO authenticated;
