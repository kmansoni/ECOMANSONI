-- ============================================================================
-- EMAIL ROUTER FULL MAIL: threads + read/unread + linkage
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_email TEXT NOT NULL,
  subject_normalized TEXT NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_inbox
  ADD COLUMN IF NOT EXISTS thread_id UUID NULL REFERENCES public.email_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ NULL;

ALTER TABLE public.email_outbox
  ADD COLUMN IF NOT EXISTS thread_id UUID NULL REFERENCES public.email_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cc_email TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS bcc_email TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS reply_to_message_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_email_threads_mailbox_last
  ON public.email_threads (mailbox_email, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_inbox_mailbox_unread
  ON public.email_inbox (to_email, is_read, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_inbox_thread_received
  ON public.email_inbox (thread_id, received_at ASC)
  WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_outbox_thread_created
  ON public.email_outbox (thread_id, created_at ASC)
  WHERE thread_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_email_threads_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_threads_updated_at ON public.email_threads;
CREATE TRIGGER trg_email_threads_updated_at
BEFORE UPDATE ON public.email_threads
FOR EACH ROW
EXECUTE FUNCTION public.touch_email_threads_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mansoni_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.email_threads TO mansoni_app;
    GRANT SELECT, UPDATE ON public.email_inbox TO mansoni_app;
    GRANT SELECT, INSERT, UPDATE ON public.email_outbox TO mansoni_app;
  END IF;
END
$$;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES FOR email_threads
-- ============================================================================
-- Note: service_role bypasses RLS, so these policies apply to authenticated users only

ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own threads" ON public.email_threads;
DROP POLICY IF EXISTS "Users can insert own threads" ON public.email_threads;
DROP POLICY IF EXISTS "Users can update own threads" ON public.email_threads;

-- Users can read threads for their mailbox
CREATE POLICY "Users can read own threads" ON public.email_threads
  FOR SELECT USING (mailbox_email = auth.jwt() ->> 'email');

-- Users can insert threads for their mailbox
CREATE POLICY "Users can insert own threads" ON public.email_threads
  FOR INSERT WITH CHECK (mailbox_email = auth.jwt() ->> 'email' OR auth.jwt() IS NULL);

-- Users can update threads for their mailbox
CREATE POLICY "Users can update own threads" ON public.email_threads
  FOR UPDATE USING (mailbox_email = auth.jwt() ->> 'email');
