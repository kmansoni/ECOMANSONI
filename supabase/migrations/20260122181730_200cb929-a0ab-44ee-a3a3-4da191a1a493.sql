-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.

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
