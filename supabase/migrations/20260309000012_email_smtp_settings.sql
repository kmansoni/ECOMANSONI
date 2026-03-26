-- ============================================================
-- Migration: Email SMTP settings per user/organisation
-- ============================================================
-- Design:
--   • Each authenticated user can store ONE outgoing SMTP config.
--   • SMTP password is stored encrypted via pgcrypto (AES-256-CBC).
--     The encryption key is the Supabase SECRET_KEY from Vault.
--     This is a defence-in-depth measure: even if the table is
--     exfiltrated, passwords remain encrypted.
--   • RLS: users can only SELECT/UPDATE/DELETE their own row.
--     Admins (admin_users) can SELECT all rows for support purposes.
--   • The table additionally stores:
--       - from_name:     display name for the From header
--       - from_email:    the verified sender address (must match SMTP auth)
--       - reply_to:      optional Reply-To override
--       - tls_mode:      STARTTLS | SSL | NONE
--       - verified_at:   timestamp of last successful SMTP test
--       - created_at, updated_at for audit trail
-- ============================================================

-- Require pgcrypto for symmetric encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_smtp_settings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- SMTP connection
  smtp_host       TEXT        NOT NULL,
  smtp_port       INTEGER     NOT NULL DEFAULT 587
                              CHECK (smtp_port BETWEEN 1 AND 65535),
  smtp_user       TEXT        NOT NULL,
  -- Password stored as AES-256-CBC encrypted hex blob.
  -- Decryption happens only inside Edge Functions with the server-side key.
  smtp_password_enc TEXT      NOT NULL,

  -- TLS mode: 'starttls' | 'ssl' | 'none'
  tls_mode        TEXT        NOT NULL DEFAULT 'starttls'
                              CHECK (tls_mode IN ('starttls', 'ssl', 'none')),

  -- Email identity
  from_name       TEXT,
  from_email      TEXT        NOT NULL,
  reply_to        TEXT,

  -- Optional custom Message-ID domain (for DKIM alignment)
  message_id_domain TEXT,

  -- Verification
  verified_at     TIMESTAMPTZ,
  last_error      TEXT,

  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One SMTP config per user (can extend to org-level later)
  UNIQUE (user_id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Lookup by user is the hot path; covered by PRIMARY KEY + UNIQUE(user_id)
CREATE INDEX IF NOT EXISTS idx_email_smtp_settings_user_id
  ON public.email_smtp_settings (user_id);

-- ─── Updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_smtp_settings_updated_at ON public.email_smtp_settings;
CREATE TRIGGER trg_email_smtp_settings_updated_at
  BEFORE UPDATE ON public.email_smtp_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.email_smtp_settings ENABLE ROW LEVEL SECURITY;

-- Users can manage only their own row
CREATE POLICY "smtp_settings_owner_select"
  ON public.email_smtp_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "smtp_settings_owner_insert"
  ON public.email_smtp_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "smtp_settings_owner_update"
  ON public.email_smtp_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "smtp_settings_owner_delete"
  ON public.email_smtp_settings FOR DELETE
  USING (auth.uid() = user_id);

-- Admins (from admin_users table) can SELECT for support
CREATE POLICY "smtp_settings_admin_select"
  ON public.email_smtp_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.id = auth.uid()
        AND au.status = 'active'
    )
  );

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_smtp_settings TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- ─── IMAP/POP3 incoming settings (for future use) ────────────────────────────
-- NOTE: Receiving email via IMAP is handled by the email-router service which
-- runs inside a private network. These settings are stored here for the
-- admin UI to configure the email-router fetch rules.

CREATE TABLE IF NOT EXISTS public.email_imap_settings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  imap_host       TEXT        NOT NULL,
  imap_port       INTEGER     NOT NULL DEFAULT 993
                              CHECK (imap_port BETWEEN 1 AND 65535),
  imap_user       TEXT        NOT NULL,
  imap_password_enc TEXT      NOT NULL,
  tls_mode        TEXT        NOT NULL DEFAULT 'ssl'
                              CHECK (tls_mode IN ('ssl', 'starttls', 'none')),

  -- Which IMAP folders to sync
  sync_folders    TEXT[]      NOT NULL DEFAULT ARRAY['INBOX', 'Sent', 'Drafts', 'Spam', 'Trash'],
  -- Poll interval in seconds (minimum 60)
  poll_interval_s INTEGER     NOT NULL DEFAULT 60
                              CHECK (poll_interval_s >= 60),

  verified_at     TIMESTAMPTZ,
  last_error      TEXT,
  last_synced_at  TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id)
);

ALTER TABLE public.email_imap_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imap_settings_owner_select"
  ON public.email_imap_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "imap_settings_owner_insert"
  ON public.email_imap_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "imap_settings_owner_update"
  ON public.email_imap_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "imap_settings_owner_delete"
  ON public.email_imap_settings FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_imap_settings TO authenticated;

DROP TRIGGER IF EXISTS trg_email_imap_settings_updated_at ON public.email_imap_settings;
CREATE TRIGGER trg_email_imap_settings_updated_at
  BEFORE UPDATE ON public.email_imap_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Supabase Storage bucket for email attachments ───────────────────────────
-- NOTE: The bucket is created via Supabase dashboard or CLI.
-- This migration documents the required policies.
--
-- bucket: email-attachments
-- Policy: authenticated users can upload to their own user_id/* prefix
-- Policy: public read (URLs are signed, so this is safe for download links)
--
-- Required CLI:
--   supabase storage create email-attachments --public
--
-- RLS example (supabase_realtime.objects table):
--   CREATE POLICY "email_attachments_upload"
--     ON storage.objects FOR INSERT TO authenticated
--     WITH CHECK (bucket_id = 'email-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
--
--   CREATE POLICY "email_attachments_read"
--     ON storage.objects FOR SELECT TO authenticated
--     USING (bucket_id = 'email-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMENT ON TABLE public.email_smtp_settings IS
  'Per-user SMTP configuration for outgoing email. Passwords encrypted with pgcrypto AES-256-CBC. Decrypted only server-side in Edge Functions.';

COMMENT ON TABLE public.email_imap_settings IS
  'Per-user IMAP configuration for incoming email polling. Used by email-router service. Passwords encrypted with pgcrypto.';
