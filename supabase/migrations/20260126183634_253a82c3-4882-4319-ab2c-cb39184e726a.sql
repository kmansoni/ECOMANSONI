-- Drop broken policies
DROP POLICY IF EXISTS "Members can view members" ON public.group_chat_members;
DROP POLICY IF EXISTS "Group admins can add members" ON public.group_chat_members;

-- Recreate with correct conditions using the security definer function
CREATE POLICY "Members can view members" ON public.group_chat_members
FOR SELECT
USING (
  public.is_group_member(group_id, auth.uid())
);

CREATE POLICY "Group admins can add members" ON public.group_chat_members
FOR INSERT
WITH CHECK (
  (SELECT role FROM public.group_chat_members WHERE group_id = group_chat_members.group_id AND user_id = auth.uid() LIMIT 1) IN ('owner', 'admin')
  OR user_id = auth.uid()
);