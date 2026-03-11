-- Recovery Email: 2FA backup email
-- Migration: 20260311100002

CREATE TABLE IF NOT EXISTS public.recovery_emails (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  verification_code TEXT,
  code_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.recovery_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'recovery_emails' AND policyname = 'recovery_email_select_own'
  ) THEN
    CREATE POLICY "recovery_email_select_own" ON public.recovery_emails
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'recovery_emails' AND policyname = 'recovery_email_insert_own'
  ) THEN
    CREATE POLICY "recovery_email_insert_own" ON public.recovery_emails
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'recovery_emails' AND policyname = 'recovery_email_update_own'
  ) THEN
    CREATE POLICY "recovery_email_update_own" ON public.recovery_emails
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'recovery_emails' AND policyname = 'recovery_email_delete_own'
  ) THEN
    CREATE POLICY "recovery_email_delete_own" ON public.recovery_emails
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
