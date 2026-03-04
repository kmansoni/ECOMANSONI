-- ============================================================
-- E2EE: server-side enable_conversation_encryption RPC
-- Purpose:
--   1. Avoid client-side blind UPDATE under RLS policy "Only creator can toggle encryption"
--   2. Enforce participant check + active key version validation
--   3. Atomically set conversations.encryption_enabled = true
-- ============================================================

CREATE OR REPLACE FUNCTION public.enable_conversation_encryption(
  p_conversation_id UUID,
  p_key_version INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
  v_is_participant BOOLEAN;
  v_active_key_version INT;
BEGIN
  -- 1) Ensure conversation exists (lock row to serialize concurrent enable/disable)
  SELECT TRUE
    INTO v_exists
    FROM public.conversations
   WHERE id = p_conversation_id
   FOR UPDATE;

  IF NOT FOUND OR NOT v_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conversation_not_found');
  END IF;

  -- 2) Ensure caller is a participant of the conversation
  SELECT EXISTS (
    SELECT 1
      FROM public.conversation_participants cp
     WHERE cp.conversation_id = p_conversation_id
       AND cp.user_id = auth.uid()
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  -- 3) Validate that an active key exists and key_version matches latest active
  SELECT cek.key_version
    INTO v_active_key_version
    FROM public.chat_encryption_keys cek
   WHERE cek.conversation_id = p_conversation_id
     AND cek.is_active = true
   ORDER BY cek.key_version DESC
   LIMIT 1;

  IF v_active_key_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_active_key');
  END IF;

  IF v_active_key_version <> p_key_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'key_version_mismatch',
      'active_key_version', v_active_key_version
    );
  END IF;

  -- 4) Enable encryption flag
  UPDATE public.conversations
     SET encryption_enabled = true
   WHERE id = p_conversation_id;

  RETURN jsonb_build_object('ok', true, 'active_key_version', v_active_key_version);
END;
$$;

REVOKE ALL ON FUNCTION public.enable_conversation_encryption(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enable_conversation_encryption(UUID, INT) TO authenticated;
