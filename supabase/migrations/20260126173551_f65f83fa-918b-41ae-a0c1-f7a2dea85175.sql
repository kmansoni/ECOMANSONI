-- Create SECURITY DEFINER function to check group membership without RLS recursion
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_chat_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$$;

-- Drop existing policies on group_chat_members
DROP POLICY IF EXISTS "Users can view their group memberships" ON public.group_chat_members;
DROP POLICY IF EXISTS "Group members can view all members" ON public.group_chat_members;
DROP POLICY IF EXISTS "Users can view group members" ON public.group_chat_members;

-- Create new non-recursive policy for group_chat_members
CREATE POLICY "Users can view their own memberships"
ON public.group_chat_members
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Group owners can manage members"
ON public.group_chat_members
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM group_chats 
    WHERE id = group_chat_members.group_id 
    AND owner_id = auth.uid()
  )
);

-- Update group_chats policy to avoid recursion
DROP POLICY IF EXISTS "Members can view their groups" ON public.group_chats;
DROP POLICY IF EXISTS "Users can view groups they belong to" ON public.group_chats;

CREATE POLICY "Users can view their groups"
ON public.group_chats
FOR SELECT
USING (
  owner_id = auth.uid() 
  OR is_group_member(id, auth.uid())
);

-- Update group_chat_messages policy
DROP POLICY IF EXISTS "Group members can view messages" ON public.group_chat_messages;
DROP POLICY IF EXISTS "Group members can send messages" ON public.group_chat_messages;

CREATE POLICY "Group members can view messages"
ON public.group_chat_messages
FOR SELECT
USING (is_group_member(group_id, auth.uid()));

CREATE POLICY "Group members can send messages"
ON public.group_chat_messages
FOR INSERT
WITH CHECK (is_group_member(group_id, auth.uid()) AND sender_id = auth.uid());