-- ============================================================================
-- EMAIL ROUTER MAILBOXES: folders for inbox/outbox + drafts support
-- ============================================================================

ALTER TABLE public.email_inbox
  ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.email_outbox
  ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_inbox_folder_check'
      AND conrelid = 'public.email_inbox'::regclass
  ) THEN
    ALTER TABLE public.email_inbox DROP CONSTRAINT email_inbox_folder_check;
  END IF;
END
$$;

ALTER TABLE public.email_inbox
  ADD CONSTRAINT email_inbox_folder_check
  CHECK (folder IN ('inbox', 'spam', 'trash'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_outbox_folder_check'
      AND conrelid = 'public.email_outbox'::regclass
  ) THEN
    ALTER TABLE public.email_outbox DROP CONSTRAINT email_outbox_folder_check;
  END IF;
END
$$;

ALTER TABLE public.email_outbox
  ADD CONSTRAINT email_outbox_folder_check
  CHECK (folder IN ('sent', 'draft', 'trash'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_outbox_status_check'
      AND conrelid = 'public.email_outbox'::regclass
  ) THEN
    ALTER TABLE public.email_outbox DROP CONSTRAINT email_outbox_status_check;
  END IF;
END
$$;

ALTER TABLE public.email_outbox
  ADD CONSTRAINT email_outbox_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'draft'));

CREATE INDEX IF NOT EXISTS idx_email_inbox_folder_received
  ON public.email_inbox (to_email, folder, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_outbox_folder_created
  ON public.email_outbox (from_email, folder, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mansoni_app') THEN
    GRANT UPDATE (folder, is_starred) ON public.email_inbox TO mansoni_app;
    GRANT UPDATE (folder, is_starred, status, subject, html_body, text_body, cc_email, bcc_email, to_email) ON public.email_outbox TO mansoni_app;
  END IF;
END
$$;
