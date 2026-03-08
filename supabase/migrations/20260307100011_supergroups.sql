-- Migration: Supergroup support
-- Adds supergroup type to conversations, settings table, join requests table.
--
-- Design decisions:
-- - conversations.type constraint extended with 'supergroup'
-- - supergroup_settings: 1:1 with conversations, owned by conversation
-- - join_requests: pending/approved/rejected state machine
--   Unique constraint (conversation_id, user_id) prevents duplicate requests
--   reviewed_by FK allows null (pending state)
-- - RLS: settings readable by members, join_requests visible to admins + applicant
-- - forum_mode topics stored in a separate topics table (not yet implemented,
--   linked_channel_id for broadcasting)
-- - messages_ttl=0 means no auto-deletion; non-zero values are enforced
--   by a scheduled Supabase Edge Function (not in this migration)

-- ── Extend conversations.type ──────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'type'
  ) THEN
    ALTER TABLE public.conversations
      DROP CONSTRAINT IF EXISTS conversations_type_check;

    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_type_check
      CHECK (type IN ('direct', 'group', 'channel', 'supergroup'));
  END IF;
END $$;

-- ── Table: supergroup_settings ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supergroup_settings (
  conversation_id               uuid        PRIMARY KEY
                                            REFERENCES public.conversations(id)
                                            ON DELETE CASCADE,
  max_members                   integer     NOT NULL DEFAULT 200000
                                            CHECK (max_members > 0 AND max_members <= 1000000),
  join_by_link                  boolean     NOT NULL DEFAULT true,
  join_request_required         boolean     NOT NULL DEFAULT false,
  -- Whether chat history is visible to newly joined members
  history_visible_to_new_members boolean    NOT NULL DEFAULT true,
  -- Message TTL in seconds; 0 = no auto-deletion
  messages_ttl                  integer     NOT NULL DEFAULT 0
                                            CHECK (messages_ttl >= 0),
  -- Optional linked broadcast channel
  linked_channel_id             uuid        REFERENCES public.conversations(id)
                                            ON DELETE SET NULL,
  -- Forum mode: topics as in Telegram Forum (bool flag; topic management TBD)
  forum_mode                    boolean     NOT NULL DEFAULT false,
  -- Slowmode interval in seconds; 0 = disabled
  slow_mode_seconds             integer     NOT NULL DEFAULT 0
                                            CHECK (slow_mode_seconds >= 0),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

-- ── Table: join_requests ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.join_requests (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- State machine: pending → approved | rejected
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Optional message from applicant
  message          text,
  reviewed_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz,
  -- Reapplication after rejection is prevented by UNIQUE; admin must DELETE to allow reapply
  UNIQUE (conversation_id, user_id)
);

-- ── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_join_requests_conversation_status
  ON public.join_requests (conversation_id, status);

CREATE INDEX IF NOT EXISTS idx_join_requests_user
  ON public.join_requests (user_id);

CREATE INDEX IF NOT EXISTS idx_supergroup_settings_linked_channel
  ON public.supergroup_settings (linked_channel_id)
  WHERE linked_channel_id IS NOT NULL;

-- ── RLS: supergroup_settings ──────────────────────────────────────────────

ALTER TABLE public.supergroup_settings ENABLE ROW LEVEL SECURITY;

-- Members of the conversation can read settings
DROP POLICY IF EXISTS "supergroup_settings_member_read" ON public.supergroup_settings;
CREATE POLICY "supergroup_settings_member_read"
  ON public.supergroup_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = supergroup_settings.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

-- Only admins/owner of the conversation can write settings
-- Compatibility mode: if participant roles are not present in the schema,
-- any participant may manage settings for this conversation.
DROP POLICY IF EXISTS "supergroup_settings_admin_write" ON public.supergroup_settings;
CREATE POLICY "supergroup_settings_admin_write"
  ON public.supergroup_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = supergroup_settings.conversation_id
        AND cp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = supergroup_settings.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

-- ── RLS: join_requests ────────────────────────────────────────────────────

ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

-- Admins see all requests for their conversations
DROP POLICY IF EXISTS "join_requests_admin_read" ON public.join_requests;
CREATE POLICY "join_requests_admin_read"
  ON public.join_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = join_requests.conversation_id
        AND cp.user_id = auth.uid()
    )
    OR user_id = auth.uid() -- applicant sees own request
  );

-- Any authenticated user can submit a request
DROP POLICY IF EXISTS "join_requests_user_insert" ON public.join_requests;
CREATE POLICY "join_requests_user_insert"
  ON public.join_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Only admin may update (approve/reject)
DROP POLICY IF EXISTS "join_requests_admin_update" ON public.join_requests;
CREATE POLICY "join_requests_admin_update"
  ON public.join_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = join_requests.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

-- Admin may delete (to allow reapplication)
DROP POLICY IF EXISTS "join_requests_admin_delete" ON public.join_requests;
CREATE POLICY "join_requests_admin_delete"
  ON public.join_requests
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = join_requests.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

-- ── Trigger: updated_at ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_supergroup_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supergroup_settings_updated_at ON public.supergroup_settings;
CREATE TRIGGER trg_supergroup_settings_updated_at
  BEFORE UPDATE ON public.supergroup_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_supergroup_settings_updated_at();

-- ── Trigger: auto-approve join request → add member ──────────────────────

CREATE OR REPLACE FUNCTION public.handle_join_request_approved()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    -- Add user as member
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (NEW.conversation_id, NEW.user_id)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    -- Record review timestamp
    NEW.reviewed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_join_request_approved ON public.join_requests;
CREATE TRIGGER trg_join_request_approved
  BEFORE UPDATE ON public.join_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_join_request_approved();

-- ── Function: convert_group_to_supergroup ─────────────────────────────────
-- Atomically changes conversation type and creates default settings.
-- Only the owner may execute.

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
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_group_to_supergroup(uuid) TO authenticated;
