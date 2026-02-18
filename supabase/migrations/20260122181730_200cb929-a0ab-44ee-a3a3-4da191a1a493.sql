
-- Add UPDATE policy for conversations so users can update updated_at
CREATE POLICY "Users can update their conversations" 
ON public.conversations 
FOR UPDATE 
USING (
  id IN (
    SELECT cp.conversation_id 
    FROM public.conversation_participants cp 
    WHERE cp.user_id = auth.uid()
  )
);
