-- Fix infinite recursion in group_chat_members policies
-- Drop all existing problematic policies
DROP POLICY IF EXISTS "Members can view members" ON public.group_chat_members;
DROP POLICY IF EXISTS "Group admins can add members" ON public.group_chat_members;
DROP POLICY IF EXISTS "Users can view group members" ON public.group_chat_members;
DROP POLICY IF EXISTS "Group members can view other members" ON public.group_chat_members;
DROP POLICY IF EXISTS "Owners can manage members" ON public.group_chat_members;

-- Create new non-recursive policies using the security definer function
CREATE POLICY "Members can view group members"
ON public.group_chat_members
FOR SELECT
USING (public.is_group_member(group_id, auth.uid()));

CREATE POLICY "Owners and admins can add members"
ON public.group_chat_members
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_chat_members gcm
    WHERE gcm.group_id = group_chat_members.group_id
    AND gcm.user_id = auth.uid()
    AND gcm.role IN ('owner', 'admin')
  )
  OR (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.group_chats gc
    WHERE gc.id = group_chat_members.group_id
    AND gc.owner_id = auth.uid()
  ))
);

CREATE POLICY "Owners can delete members"
ON public.group_chat_members
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.group_chats gc
    WHERE gc.id = group_id
    AND gc.owner_id = auth.uid()
  )
  OR user_id = auth.uid()
);