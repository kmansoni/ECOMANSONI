-- =============================================================================
-- REQ-0137: Deterministic DM Pair and Idempotent Create (block policy enforcement)
--
-- Acceptance criteria:
-- - ✅ dm_pairs unique(user_low, user_high) [ALREADY DONE in 20260223120000]
-- - ✅ dialog_get_or_create_dm_v1 idempotent [ALREADY DONE in 20260223120000]
-- - ✅ Parallel create returns same dialog_id [ALREADY DONE via advisory lock]
-- - ✅ No duplicate DM rows [ALREADY DONE via PRIMARY KEY]
-- - ❌ Blocked pair policy enforced server-side [THIS MIGRATION]
--
-- This migration adds blocked_users check to get_or_create_dm RPC.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_dm(target_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  initiator UUID := auth.uid();
  a UUID;
  b UUID;
  conv_id UUID;
  lock_key BIGINT;
  is_blocked BOOLEAN;
BEGIN
  -- 1. Authentication check
  IF initiator IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF target_user_id IS NULL OR target_user_id = initiator THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023';
  END IF;

  -- 2. REQ-0137: Blocked pair policy enforcement (server-side)
  -- Check if either user has blocked the other.
  SELECT EXISTS (
    SELECT 1
    FROM public.blocked_users bu
    WHERE (bu.blocker_id = initiator AND bu.blocked_id = target_user_id)
       OR (bu.blocker_id = target_user_id AND bu.blocked_id = initiator)
  ) INTO is_blocked;

  IF is_blocked THEN
    RAISE EXCEPTION 'blocked_user' USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- 3. Deterministic normalization (user_a < user_b)
  a := LEAST(initiator, target_user_id);
  b := GREATEST(initiator, target_user_id);

  -- 4. Advisory lock to prevent race conditions on DM pair creation
  lock_key := (('x' || SUBSTR(MD5(a::text || ':' || b::text), 1, 16))::bit(64)::bigint);
  PERFORM pg_advisory_xact_lock(lock_key);

  -- 5. Check if DM pair already exists
  SELECT dp.conversation_id
    INTO conv_id
  FROM public.dm_pairs dp
  WHERE dp.user_a = a
    AND dp.user_b = b
  LIMIT 1;

  IF conv_id IS NOT NULL THEN
    -- Best-effort: ensure both participants exist (idempotent, avoids historical drift).
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (conv_id, initiator)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (conv_id, target_user_id)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    RETURN conv_id;
  END IF;

  -- 6. Create new conversation + dm_pair + participants
  INSERT INTO public.conversations DEFAULT VALUES
  RETURNING id INTO conv_id;

  INSERT INTO public.dm_pairs (user_a, user_b, conversation_id)
  VALUES (a, b, conv_id);

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES
    (conv_id, initiator),
    (conv_id, target_user_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_dm(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_or_create_dm(UUID)
  IS 'REQ-0137: Create or get DM conversation between auth.uid() and target. Enforces blocked_users policy server-side. Idempotent via advisory lock + dm_pairs PK.';
