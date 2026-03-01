-- ============================================================================
-- EMAIL ROUTER INBOUND: inbox storage for received emails
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL,
  in_reply_to_message_id TEXT NULL,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NULL,
  html_body TEXT NULL,
  text_body TEXT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider TEXT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, to_email)
);

CREATE INDEX IF NOT EXISTS idx_email_inbox_to_received
  ON public.email_inbox (to_email, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_inbox_reply_chain
  ON public.email_inbox (in_reply_to_message_id, received_at DESC)
  WHERE in_reply_to_message_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mansoni_app') THEN
    GRANT SELECT, INSERT ON public.email_inbox TO mansoni_app;
  END IF;
END
$$;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================
-- Note: service_role bypasses RLS, so these policies apply to authenticated users only

ALTER TABLE public.email_inbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own inbox" ON public.email_inbox;
DROP POLICY IF EXISTS "Users can insert to own inbox" ON public.email_inbox;
DROP POLICY IF EXISTS "Users can update own inbox read status" ON public.email_inbox;

-- Users can read their own inbox emails
CREATE POLICY "Users can read own inbox" ON public.email_inbox
  FOR SELECT USING (to_email = auth.jwt() ->> 'email');

-- Users can insert emails to their own inbox (for migrations/imports)
CREATE POLICY "Users can insert to own inbox" ON public.email_inbox
  FOR INSERT WITH CHECK (to_email = auth.jwt() ->> 'email' OR auth.jwt() IS NULL);

-- Users can update read status on their own emails
CREATE POLICY "Users can update own inbox read status" ON public.email_inbox
  FOR UPDATE USING (to_email = auth.jwt() ->> 'email');
