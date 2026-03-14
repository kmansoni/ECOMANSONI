-- Migration: Supergroup member roles
-- Adds `role` column to conversation_participants so supergroup admins
-- can promote/demote/kick members.
--
-- Roles: 'owner' | 'admin' | 'member'
-- - owner: set when converting group to supergroup (one per conversation)
-- - admin: set by owner or existing admin
-- - member: default for all new participants
--
-- RLS safety: uses a SECURITY DEFINER helper to avoid policy self-recursion.

-- ── 1. Add role column ─────────────────────────────────────────────────────

ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('owner', 'admin', 'member'));

-- ── 2. Security-definer role lookup (avoids RLS infinite recursion) ────────

CREATE OR REPLACE FUNCTION public.get_participant_role(
  p_conversation_id uuid,
  p_user_id         uuid
)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role
  FROM public.conversation_participants
  WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_participant_role(uuid, uuid) TO authenticated;

-- ── 3. RLS: admins/owners can update participant roles ─────────────────────

DROP POLICY IF EXISTS "Admin can update participant roles" ON public.conversation_participants;
CREATE POLICY "Admin can update participant roles"
  ON public.conversation_participants
  FOR UPDATE
  TO authenticated
  USING (
    public.get_participant_role(conversation_id, auth.uid()) IN ('owner', 'admin')
  )
  WITH CHECK (
    public.get_participant_role(conversation_id, auth.uid()) IN ('owner', 'admin')
    -- Owners may set any role; admins may not set 'owner' role
    AND (
      public.get_participant_role(conversation_id, auth.uid()) = 'owner'
      OR role != 'owner'
    )
  );

-- ── 4. RLS: admins/owners can kick (delete) participants ───────────────────

DROP POLICY IF EXISTS "Admin can remove participants" ON public.conversation_participants;
CREATE POLICY "Admin can remove participants"
  ON public.conversation_participants
  FOR DELETE
  TO authenticated
  USING (
    user_id != auth.uid()  -- cannot kick yourself
    AND public.get_participant_role(conversation_id, auth.uid()) IN ('owner', 'admin')
    -- owners can kick anyone; admins cannot kick the owner
    AND (
      public.get_participant_role(conversation_id, auth.uid()) = 'owner'
      OR public.get_participant_role(conversation_id, user_id) != 'owner'
    )
  );

-- ── 5. Update convert_group_to_supergroup to set caller as owner ──────────

CREATE OR REPLACE FUNCTION public.convert_group_to_supergroup(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller participates in the conversation
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'only participants can initialize supergroup settings';
  END IF;

  -- Create default settings
  INSERT INTO public.supergroup_settings (conversation_id)
  VALUES (p_conversation_id)
  ON CONFLICT (conversation_id) DO NOTHING;

  -- Mark caller as owner (first time conversion)
  UPDATE public.conversation_participants
  SET role = 'owner'
  WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid()
    AND role = 'member';  -- only promote if not already admin/owner
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_group_to_supergroup(uuid) TO authenticated;

-- ── 6. Index for role lookups ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_conv_participants_role
  ON public.conversation_participants (conversation_id, role);
