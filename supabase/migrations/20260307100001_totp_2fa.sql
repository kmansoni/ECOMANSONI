-- ─── TOTP 2FA ────────────────────────────────────────────────────────────────
-- Safe for repeated runs (idempotent).

CREATE TABLE IF NOT EXISTS public.user_totp_secrets (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  -- AES-256-GCM encrypted TOTP secret; format: "aes256gcm:<iv_hex>:<tag_hex>:<ciphertext_hex>"
  -- Encryption is performed inside the Edge Function using a server-side key.
  encrypted_secret text      NOT NULL,
  -- 10 backup codes stored as bcrypt-like tokens; each entry is either
  -- "sha256:<hex>" (unused) or "used:<timestamp>" (consumed).
  -- Using text[] to allow atomic CAS update via UPDATE ... WHERE backup_codes[i] = old_value.
  backup_codes   text[]      NOT NULL DEFAULT '{}',
  is_enabled     boolean     NOT NULL DEFAULT false,
  verified_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Only the owning user may read/write their TOTP row.
ALTER TABLE public.user_totp_secrets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_totp_secrets' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY owner_rw ON public.user_totp_secrets
      USING      (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_totp_secrets_user_id_idx
  ON public.user_totp_secrets (user_id);

-- Grant edge function service role full access (bypasses RLS via service_role).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_totp_secrets TO service_role;
