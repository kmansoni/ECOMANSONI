-- ============================================================================
-- EMAIL ROUTER MVP: outbox + templates + delivery attempts + claim RPC
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_templates (
  key TEXT PRIMARY KEY,
  subject_template TEXT NOT NULL,
  html_template TEXT NULL,
  text_template TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NULL UNIQUE,
  to_email TEXT NOT NULL,
  from_email TEXT NULL,
  subject TEXT NULL,
  html_body TEXT NULL,
  text_body TEXT NULL,
  template_key TEXT NULL REFERENCES public.email_templates(key),
  template_vars JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_started_at TIMESTAMPTZ NULL,
  locked_until TIMESTAMPTZ NULL,
  provider TEXT NULL,
  provider_message_id TEXT NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID NOT NULL REFERENCES public.email_outbox(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_response_code TEXT NULL,
  provider_message_id TEXT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_pending
  ON public.email_outbox (status, next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_email_outbox_locked
  ON public.email_outbox (locked_until)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_email_deliveries_outbox
  ON public.email_deliveries (outbox_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_email_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER trg_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.touch_email_updated_at();

DROP TRIGGER IF EXISTS trg_email_outbox_updated_at ON public.email_outbox;
CREATE TRIGGER trg_email_outbox_updated_at
BEFORE UPDATE ON public.email_outbox
FOR EACH ROW
EXECUTE FUNCTION public.touch_email_updated_at();

CREATE OR REPLACE FUNCTION public.claim_email_outbox_batch(
  p_limit INTEGER DEFAULT 25,
  p_lock_seconds INTEGER DEFAULT 90
)
RETURNS SETOF public.email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT o.id
    FROM public.email_outbox o
    WHERE o.status = 'pending'
      AND o.next_attempt_at <= v_now
      AND (o.locked_until IS NULL OR o.locked_until <= v_now)
    ORDER BY o.next_attempt_at ASC, o.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, COALESCE(p_limit, 25))
  ),
  updated AS (
    UPDATE public.email_outbox o
    SET
      status = 'processing',
      processing_started_at = v_now,
      locked_until = v_now + make_interval(secs => GREATEST(5, COALESCE(p_lock_seconds, 90)))
    FROM candidates c
    WHERE o.id = c.id
    RETURNING o.*
  )
  SELECT * FROM updated;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_outbox_batch(INTEGER, INTEGER) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mansoni_app') THEN
    GRANT EXECUTE ON FUNCTION public.claim_email_outbox_batch(INTEGER, INTEGER) TO mansoni_app;
    GRANT SELECT ON public.email_templates TO mansoni_app;
    GRANT SELECT, INSERT, UPDATE ON public.email_outbox TO mansoni_app;
    GRANT SELECT, INSERT ON public.email_deliveries TO mansoni_app;
  END IF;
END
$$;
