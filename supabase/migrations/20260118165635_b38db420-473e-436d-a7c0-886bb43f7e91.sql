-- Fix permissive INSERT policy for conversations
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
CREATE POLICY "Authenticated users can create conversations" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Fix permissive INSERT policy for participants
DROP POLICY IF EXISTS "Users can add participants" ON public.conversation_participants;
CREATE POLICY "Users can add themselves as participants" ON public.conversation_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);