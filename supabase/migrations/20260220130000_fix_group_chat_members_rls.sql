-- Fix infinite recursion in group_chat_members RLS

ALTER TABLE public.group_chat_members ENABLE ROW LEVEL SECURITY;

-- Ensure membership checks don't recurse through RLS.
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_chat_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$$;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Members can view members" ON public.group_chat_members';
  EXECUTE 'DROP POLICY IF EXISTS "Users can view their group memberships" ON public.group_chat_members';
  EXECUTE 'DROP POLICY IF EXISTS "Group members can view all members" ON public.group_chat_members';
  EXECUTE 'DROP POLICY IF EXISTS "Users can view group members" ON public.group_chat_members';
  EXECUTE 'DROP POLICY IF EXISTS "Users can view their own memberships" ON public.group_chat_members';
  EXECUTE 'DROP POLICY IF EXISTS "Group owners can manage members" ON public.group_chat_members';
END $$;

CREATE POLICY "Users can view their own memberships"
ON public.group_chat_members
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Group owners can manage members"
ON public.group_chat_members
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.group_chats
    WHERE id = group_chat_members.group_id
      AND owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.group_chats
    WHERE id = group_chat_members.group_id
      AND owner_id = auth.uid()
  )
);

-- Keep group visibility policy non-recursive.
DROP POLICY IF EXISTS "Members can view groups" ON public.group_chats;
DROP POLICY IF EXISTS "Users can view their groups" ON public.group_chats;
DROP POLICY IF EXISTS "Users can view groups they belong to" ON public.group_chats;

CREATE POLICY "Users can view their groups"
ON public.group_chats
FOR SELECT
USING (
  owner_id = auth.uid()
  OR public.is_group_member(id, auth.uid())
);

-- Refresh message policies to use the non-recursive helper.
DROP POLICY IF EXISTS "Group members can view messages" ON public.group_chat_messages;
DROP POLICY IF EXISTS "Group members can send messages" ON public.group_chat_messages;

CREATE POLICY "Group members can view messages"
ON public.group_chat_messages
FOR SELECT
USING (public.is_group_member(group_id, auth.uid()));

CREATE POLICY "Group members can send messages"
ON public.group_chat_messages
FOR INSERT
WITH CHECK (
  public.is_group_member(group_id, auth.uid())
  AND sender_id = auth.uid()
);
