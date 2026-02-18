-- Step 1: Create SECURITY DEFINER function to get user's conversation IDs (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_conversation_ids(user_uuid UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT conversation_id 
  FROM public.conversation_participants 
  WHERE user_id = user_uuid
$$;

-- Step 2: Drop all existing chat-related policies to recreate them properly

-- Drop conversation_participants policies
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add themselves as participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update own participation" ON public.conversation_participants;

-- Drop conversations policies
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON public.conversations;

-- Drop messages policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;

-- Step 3: Create new non-recursive policies for conversation_participants

-- SELECT: user can see their own row OR rows of participants in their conversations
CREATE POLICY "View own and conversation participants"
ON public.conversation_participants
FOR SELECT
USING (
  user_id = auth.uid() 
  OR conversation_id IN (SELECT public.get_user_conversation_ids(auth.uid()))
);

-- INSERT: user can only add themselves
CREATE POLICY "Add self as participant"
ON public.conversation_participants
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- UPDATE: user can only update their own participation
CREATE POLICY "Update own participation"
ON public.conversation_participants
FOR UPDATE
USING (user_id = auth.uid());

-- Step 4: Create new non-recursive policies for conversations

-- SELECT: use the function
CREATE POLICY "View own conversations"
ON public.conversations
FOR SELECT
USING (id IN (SELECT public.get_user_conversation_ids(auth.uid())));

-- INSERT: any authenticated user can create
CREATE POLICY "Create conversation"
ON public.conversations
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: use the function
CREATE POLICY "Update own conversations"
ON public.conversations
FOR UPDATE
USING (id IN (SELECT public.get_user_conversation_ids(auth.uid())));

-- Step 5: Create new non-recursive policies for messages

-- SELECT: use the function
CREATE POLICY "View conversation messages"
ON public.messages
FOR SELECT
USING (conversation_id IN (SELECT public.get_user_conversation_ids(auth.uid())));

-- INSERT: user can send to their conversations only
CREATE POLICY "Send messages to own conversations"
ON public.messages
FOR INSERT
WITH CHECK (
  sender_id = auth.uid() 
  AND conversation_id IN (SELECT public.get_user_conversation_ids(auth.uid()))
);