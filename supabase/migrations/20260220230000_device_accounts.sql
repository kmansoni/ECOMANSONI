-- Device ↔ account linkage for multi-account UX.

CREATE TABLE IF NOT EXISTS public.device_accounts (
  device_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, user_id)
);

ALTER TABLE public.device_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='device_accounts' AND policyname='Users can view own device links'
  ) THEN
    CREATE POLICY "Users can view own device links" ON public.device_accounts
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='device_accounts' AND policyname='Users can upsert own device links'
  ) THEN
    CREATE POLICY "Users can upsert own device links" ON public.device_accounts
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='device_accounts' AND policyname='Users can update own device links'
  ) THEN
    CREATE POLICY "Users can update own device links" ON public.device_accounts
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS device_accounts_user_last_active_idx
  ON public.device_accounts(user_id, last_active_at DESC);
