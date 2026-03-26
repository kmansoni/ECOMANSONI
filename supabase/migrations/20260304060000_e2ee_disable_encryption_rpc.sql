-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- ============================================================
-- E2EE: server-side disable_conversation_encryption RPC
-- Fixes:
--   1. Incomplete key deactivation in disableEncryption()
--      (client-side RLS only deactivated sender's own rows)
--   2. Missing server-side ownership check for encryption_enabled toggle
-- ============================================================

-- ── RLS for conversations (encryption_enabled) ──────────────

-- Allow any authenticated participant to SELECT their conversation
-- (keep existing SELECT policies untouched; only ADD UPDATE guard).
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'conversations'
      AND policyname = 'Participants can toggle encryption'
  ) THEN
    CREATE POLICY "Participants can toggle encryption"
      ON public.conversations
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1
            FROM public.conversation_participants cp
           WHERE cp.conversation_id = conversations.id
             AND cp.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
            FROM public.conversation_participants cp
           WHERE cp.conversation_id = conversations.id
             AND cp.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── SECURITY DEFINER RPC ──────────────────────────────────────────────────────
-- Atomically:
--   1. Verifies caller is conversation creator (server-side, not client-side).
--   2. Deactivates ALL wrapped keys for the conversation regardless of sender_id.
--   3. Sets conversations.encryption_enabled = false.
--
-- Runs as SECURITY DEFINER so it can bypass per-row RLS on chat_encryption_keys
-- and update rows where sender_id != caller — which RLS would normally block.
-- The explicit ownership check inside the function enforces zero-trust.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.disable_conversation_encryption(
  p_conversation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_participant BOOLEAN;
  v_deactivated INT;
BEGIN
  -- 1. Verify conversation exists
  SELECT TRUE
    INTO v_is_participant
    FROM public.conversations
   WHERE id = p_conversation_id
   FOR UPDATE;           -- row-level lock prevents concurrent disable/enable

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conversation_not_found');
  END IF;

  -- 2. Verify caller is conversation participant
  SELECT EXISTS (
    SELECT 1
      FROM public.conversation_participants cp
     WHERE cp.conversation_id = p_conversation_id
       AND cp.user_id = auth.uid()
  )
    INTO v_is_participant;

  IF NOT v_is_participant THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  -- 3. Deactivate ALL wrapped keys for the conversation (all senders)
  UPDATE public.chat_encryption_keys
     SET is_active = false
   WHERE conversation_id = p_conversation_id
     AND is_active = true;

  GET DIAGNOSTICS v_deactivated = ROW_COUNT;

  -- 4. Mark conversation as unencrypted
  UPDATE public.conversations
     SET encryption_enabled = false
   WHERE id = p_conversation_id;

  RETURN jsonb_build_object(
    'ok',          true,
    'deactivated', v_deactivated
  );
END;
$$;

-- Revoke public execute; grant only to authenticated users
REVOKE ALL ON FUNCTION public.disable_conversation_encryption(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disable_conversation_encryption(UUID) TO authenticated;
