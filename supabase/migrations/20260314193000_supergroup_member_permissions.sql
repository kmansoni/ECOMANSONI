-- Migration: Supergroup per-member permissions
-- Adds explicit restriction controls for supergroup members and
-- enforces them on message inserts.

-- ── 1. Table: supergroup_member_permissions ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supergroup_member_permissions (
  conversation_id    uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_send_messages  boolean     NOT NULL DEFAULT true,
  can_send_media     boolean     NOT NULL DEFAULT true,
  can_send_links     boolean     NOT NULL DEFAULT true,
  muted_until        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_supergroup_member_permissions_conv
  ON public.supergroup_member_permissions(conversation_id);

CREATE INDEX IF NOT EXISTS idx_supergroup_member_permissions_user
  ON public.supergroup_member_permissions(user_id);

-- ── 2. updated_at trigger ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_supergroup_member_permissions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supergroup_member_permissions_updated_at
  ON public.supergroup_member_permissions;
CREATE TRIGGER trg_supergroup_member_permissions_updated_at
  BEFORE UPDATE ON public.supergroup_member_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_supergroup_member_permissions_updated_at();

-- ── 3. RLS policies ────────────────────────────────────────────────────────

ALTER TABLE public.supergroup_member_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supergroup_member_permissions_read" ON public.supergroup_member_permissions;
CREATE POLICY "supergroup_member_permissions_read"
  ON public.supergroup_member_permissions
  FOR SELECT
  TO authenticated
  USING (
    -- Any conversation member can read restrictions
    EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = supergroup_member_permissions.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "supergroup_member_permissions_admin_write" ON public.supergroup_member_permissions;
CREATE POLICY "supergroup_member_permissions_admin_write"
  ON public.supergroup_member_permissions
  FOR ALL
  TO authenticated
  USING (
    public.get_participant_role(conversation_id, auth.uid()) IN ('owner', 'admin')
  )
  WITH CHECK (
    public.get_participant_role(conversation_id, auth.uid()) IN ('owner', 'admin')
    AND (
      -- Owner can manage everyone, admin cannot manage owner.
      public.get_participant_role(conversation_id, auth.uid()) = 'owner'
      OR public.get_participant_role(conversation_id, user_id) != 'owner'
    )
  );

-- ── 4. Message guard trigger for supergroups ───────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_supergroup_member_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_supergroup      boolean;
  v_can_send_messages  boolean;
  v_can_send_media     boolean;
  v_can_send_links     boolean;
  v_muted_until        timestamptz;
  v_raw_content        text;
  v_text_content       text;
  v_media_type         text;
  v_payload            jsonb;
BEGIN
  -- Only enforce for conversations that have supergroup settings.
  SELECT EXISTS (
    SELECT 1
    FROM public.supergroup_settings s
    WHERE s.conversation_id = NEW.conversation_id
  ) INTO v_is_supergroup;

  IF NOT v_is_supergroup THEN
    RETURN NEW;
  END IF;

  -- Owners/admins bypass member restrictions.
  IF public.get_participant_role(NEW.conversation_id, NEW.sender_id) IN ('owner', 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT
    p.can_send_messages,
    p.can_send_media,
    p.can_send_links,
    p.muted_until
  INTO
    v_can_send_messages,
    v_can_send_media,
    v_can_send_links,
    v_muted_until
  FROM public.supergroup_member_permissions p
  WHERE p.conversation_id = NEW.conversation_id
    AND p.user_id = NEW.sender_id;

  v_can_send_messages := COALESCE(v_can_send_messages, true);
  v_can_send_media := COALESCE(v_can_send_media, true);
  v_can_send_links := COALESCE(v_can_send_links, true);

  IF NOT v_can_send_messages THEN
    RAISE EXCEPTION 'member cannot send messages in this supergroup' USING ERRCODE = '42501';
  END IF;

  IF v_muted_until IS NOT NULL AND v_muted_until > now() THEN
    RAISE EXCEPTION 'member is muted until %', v_muted_until USING ERRCODE = '42501';
  END IF;

  v_raw_content := COALESCE(NEW.content, '');
  v_text_content := v_raw_content;
  v_media_type := NULL;

  BEGIN
    v_payload := v_raw_content::jsonb;
    v_text_content := COALESCE(v_payload->>'text', v_raw_content);
    v_media_type := NULLIF(v_payload->>'media_type', '');
  EXCEPTION
    WHEN others THEN
      -- Non-JSON plain text message.
      v_payload := NULL;
  END;

  IF NOT v_can_send_media AND v_media_type IS NOT NULL THEN
    RAISE EXCEPTION 'member cannot send media in this supergroup' USING ERRCODE = '42501';
  END IF;

  IF NOT v_can_send_links AND v_text_content ~* '(https?://|www\.)' THEN
    RAISE EXCEPTION 'member cannot send links in this supergroup' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_supergroup_member_permissions ON public.messages;
CREATE TRIGGER trg_enforce_supergroup_member_permissions
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_supergroup_member_permissions();
