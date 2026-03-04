-- ============================================================
-- E2EE schema alignment v2
-- Aligns DB contract with src/lib/e2ee/keyDistribution.ts
-- ============================================================

-- ---------- chat_encryption_keys alignment ----------

ALTER TABLE public.chat_encryption_keys
  ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS wrapped_key TEXT,
  ADD COLUMN IF NOT EXISTS sender_public_key_raw TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.chat_encryption_keys
  ALTER COLUMN encrypted_key DROP NOT NULL,
  ALTER COLUMN created_by DROP NOT NULL;

-- Drop legacy unique constraint (conversation_id,key_version) if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'chat_encryption_keys'
      AND constraint_name = 'chat_encryption_keys_conversation_id_key_version_key'
      AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.chat_encryption_keys
      DROP CONSTRAINT chat_encryption_keys_conversation_id_key_version_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_encryption_keys_v2
  ON public.chat_encryption_keys (conversation_id, key_version, recipient_id)
  WHERE recipient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_encryption_keys_recipient_active
  ON public.chat_encryption_keys (recipient_id, conversation_id, key_version)
  WHERE is_active = true;

-- ---------- user_encryption_keys alignment ----------

ALTER TABLE public.user_encryption_keys
  ADD COLUMN IF NOT EXISTS public_key_raw TEXT,
  ADD COLUMN IF NOT EXISTS fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.user_encryption_keys
  ALTER COLUMN conversation_id DROP NOT NULL,
  ALTER COLUMN key_version DROP NOT NULL,
  ALTER COLUMN encrypted_group_key DROP NOT NULL;

-- Full unique constraint on user_id so that Supabase client upsert
-- ON CONFLICT (user_id) resolves correctly.
-- PostgreSQL ON CONFLICT column inference requires a non-partial unique
-- constraint matching the column list exactly; a partial index alone
-- is NOT eligible as a conflict target unless the matching WHERE clause
-- is explicitly provided in the INSERT statement (which the Supabase
-- PostgREST client does not do automatically).
DO $$
BEGIN
  -- Self-heal legacy duplicates before enforcing uniqueness.
  DELETE FROM public.user_encryption_keys u
  USING (
    SELECT ctid
    FROM (
      SELECT
        ctid,
        ROW_NUMBER() OVER (
          PARTITION BY user_id
          ORDER BY updated_at DESC NULLS LAST, id DESC NULLS LAST
        ) AS rn
      FROM public.user_encryption_keys
      WHERE user_id IS NOT NULL
    ) ranked
    WHERE ranked.rn > 1
  ) d
  WHERE u.ctid = d.ctid;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'user_encryption_keys'
      AND constraint_name = 'uq_user_encryption_keys_user_id'
      AND constraint_type = 'UNIQUE'
  ) THEN
    -- If a same-named index already exists from a partial run, try to reuse it.
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'i'
        AND c.relname = 'uq_user_encryption_keys_user_id'
    ) THEN
      BEGIN
        ALTER TABLE public.user_encryption_keys
          ADD CONSTRAINT uq_user_encryption_keys_user_id
          UNIQUE USING INDEX uq_user_encryption_keys_user_id;
      EXCEPTION WHEN OTHERS THEN
        DROP INDEX IF EXISTS public.uq_user_encryption_keys_user_id;
        ALTER TABLE public.user_encryption_keys
          ADD CONSTRAINT uq_user_encryption_keys_user_id UNIQUE (user_id);
      END;
    ELSE
      ALTER TABLE public.user_encryption_keys
        ADD CONSTRAINT uq_user_encryption_keys_user_id UNIQUE (user_id);
    END IF;
  END IF;
END $$;

-- Keep the partial index for query performance on the public key lookup path.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_encryption_keys_identity
  ON public.user_encryption_keys (user_id)
  WHERE public_key_raw IS NOT NULL;

-- ---------- RLS policies for v2 flow ----------

ALTER TABLE public.chat_encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_encryption_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chat_encryption_keys'
      AND policyname = 'Users can read own wrapped keys v2'
  ) THEN
    CREATE POLICY "Users can read own wrapped keys v2"
      ON public.chat_encryption_keys
      FOR SELECT
      USING (recipient_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chat_encryption_keys'
      AND policyname = 'Users can insert wrapped keys v2'
  ) THEN
    CREATE POLICY "Users can insert wrapped keys v2"
      ON public.chat_encryption_keys
      FOR INSERT
      WITH CHECK (sender_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chat_encryption_keys'
      AND policyname = 'Users can update own wrapped keys v2'
  ) THEN
    CREATE POLICY "Users can update own wrapped keys v2"
      ON public.chat_encryption_keys
      FOR UPDATE
      USING (sender_id = auth.uid())
      WITH CHECK (sender_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_encryption_keys'
      AND policyname = 'Users can read public keys v2'
  ) THEN
    CREATE POLICY "Users can read public keys v2"
      ON public.user_encryption_keys
      FOR SELECT
      USING (public_key_raw IS NOT NULL OR user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_encryption_keys'
      AND policyname = 'Users can upsert own public keys v2'
  ) THEN
    CREATE POLICY "Users can upsert own public keys v2"
      ON public.user_encryption_keys
      FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_encryption_keys'
      AND policyname = 'Users can update own public keys v2'
  ) THEN
    CREATE POLICY "Users can update own public keys v2"
      ON public.user_encryption_keys
      FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
