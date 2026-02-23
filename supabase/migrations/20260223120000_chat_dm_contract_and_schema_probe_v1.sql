-- =============================================================================
-- Project B (Chats): Contract-first DM creation + schema probe
--
-- Goals:
-- - DM creation is done ONLY via SECURITY DEFINER RPC (client must not insert other participants).
-- - Prevent duplicate DMs for the same pair (A,B) == (B,A).
-- - Provide a safe schema probe for env drift detection (no secrets, no RLS weakening).
--
-- IMPORTANT:
-- - RLS policies are NOT changed here.
-- - conversation_participants INSERT stays self-only for clients.
-- =============================================================================

-- 1) Symmetric uniqueness for DM pairs.
CREATE TABLE IF NOT EXISTS public.dm_pairs (
  user_a UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CONSTRAINT dm_pairs_normalized_chk CHECK (user_a < user_b),
  CONSTRAINT dm_pairs_conversation_id_uidx UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS dm_pairs_conversation_id_idx ON public.dm_pairs(conversation_id);

-- Best-effort backfill for existing 1:1 conversations (exactly 2 participants).
-- If duplicates exist historically, this will pick one per pair; the others remain but are not used.
INSERT INTO public.dm_pairs (user_a, user_b, conversation_id)
WITH pairs AS (
  SELECT
    cp.conversation_id,
    (array_agg(cp.user_id ORDER BY cp.user_id))[1] AS user_a,
    (array_agg(cp.user_id ORDER BY cp.user_id))[2] AS user_b,
    COUNT(*) AS row_count,
    COUNT(DISTINCT cp.user_id) AS distinct_users
  FROM public.conversation_participants cp
  GROUP BY cp.conversation_id
)
SELECT
  p.user_a,
  p.user_b,
  p.conversation_id
FROM pairs p
WHERE p.row_count = 2
  AND p.distinct_users = 2
ON CONFLICT (user_a, user_b) DO NOTHING;

-- 2) Race-free SECURITY DEFINER RPC: get_or_create_dm
-- Uses an advisory xact lock + dm_pairs PK to guarantee uniqueness.
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
BEGIN
  IF initiator IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF target_user_id IS NULL OR target_user_id = initiator THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023';
  END IF;

  a := LEAST(initiator, target_user_id);
  b := GREATEST(initiator, target_user_id);

  -- Deterministic per-pair lock within the current transaction.
  -- NOTE: this is safe and avoids duplicates without weakening RLS.
  lock_key := (('x' || SUBSTR(MD5(a::text || ':' || b::text), 1, 16))::bit(64)::bigint);
  PERFORM pg_advisory_xact_lock(lock_key);

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

-- 3) Schema probe (safe, no secrets). Authenticated-only (no anon grants by default).
CREATE OR REPLACE FUNCTION public.chat_schema_probe_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_get_or_create_dm BOOLEAN := FALSE;
  get_or_create_dm_security_definer BOOLEAN := FALSE;
  has_dm_pairs BOOLEAN := FALSE;
  has_dm_uniqueness BOOLEAN := FALSE;
  participants_insert_policy_self_only BOOLEAN := FALSE;
  required TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT
    TRUE,
    p.prosecdef
  INTO has_get_or_create_dm, get_or_create_dm_security_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_or_create_dm'
    AND pg_get_function_identity_arguments(p.oid) = 'uuid'
  LIMIT 1;

  has_dm_pairs := EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'dm_pairs'
  );

  -- dm_pairs PRIMARY KEY (user_a,user_b) is the DM uniqueness mechanism.
  has_dm_uniqueness := has_dm_pairs;

  -- Check INSERT policy with CHECK ~= (user_id = auth.uid())
  participants_insert_policy_self_only := EXISTS (
    SELECT 1
    FROM pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.tablename = 'conversation_participants'
      AND pol.cmd = 'INSERT'
      AND (
        COALESCE(pol.with_check, '') ILIKE '%user_id%auth.uid()%'
        OR COALESCE(pol.with_check, '') ILIKE '%auth.uid()%user_id%'
        OR REPLACE(REPLACE(COALESCE(pol.with_check, ''), ' ', ''), E'\n', '') ILIKE '%user_id=auth.uid()%'
        OR REPLACE(REPLACE(COALESCE(pol.with_check, ''), ' ', ''), E'\n', '') ILIKE '%auth.uid()=user_id%'
      )
  );

  IF NOT has_get_or_create_dm THEN
    required := array_append(required, 'get_or_create_dm(uuid)');
  ELSIF NOT get_or_create_dm_security_definer THEN
    required := array_append(required, 'get_or_create_dm SECURITY DEFINER');
  END IF;

  IF NOT has_dm_pairs THEN
    required := array_append(required, 'dm_pairs');
  END IF;

  IF NOT participants_insert_policy_self_only THEN
    required := array_append(required, 'conversation_participants INSERT policy self-only');
  END IF;

  RETURN jsonb_build_object(
    'ok', (cardinality(required) = 0),
    'has_get_or_create_dm', (has_get_or_create_dm AND get_or_create_dm_security_definer),
    'has_dm_uniqueness', has_dm_uniqueness,
    'participants_insert_policy_self_only', participants_insert_policy_self_only,
    'required_migrations', required,
    'server_time', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.chat_schema_probe_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_schema_probe_v1() TO authenticated;

COMMENT ON FUNCTION public.chat_schema_probe_v1()
  IS 'Project B: schema health probe for env drift detection. Returns non-secret booleans (no secrets, no table contents).';
