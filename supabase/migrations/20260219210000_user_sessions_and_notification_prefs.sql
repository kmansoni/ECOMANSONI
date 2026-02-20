-- Devices (sessions) + notification prefs

-- =====================================================
-- 1) user_sessions
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_key TEXT NOT NULL,
  device_name TEXT,
  user_agent TEXT,
  ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(user_id, session_key)
);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_sessions' AND policyname='Users can view own sessions'
  ) THEN
    CREATE POLICY "Users can view own sessions" ON public.user_sessions
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_sessions' AND policyname='Users can upsert own sessions'
  ) THEN
    CREATE POLICY "Users can upsert own sessions" ON public.user_sessions
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_sessions' AND policyname='Users can update own sessions'
  ) THEN
    CREATE POLICY "Users can update own sessions" ON public.user_sessions
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_sessions' AND policyname='Users can delete own sessions'
  ) THEN
    CREATE POLICY "Users can delete own sessions" ON public.user_sessions
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions;

CREATE INDEX IF NOT EXISTS user_sessions_user_last_seen_idx
  ON public.user_sessions(user_id, last_seen_at DESC);


-- =====================================================
-- 2) Extend user_settings for notification prefs + session policy
-- =====================================================

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS notif_sound_id TEXT NOT NULL DEFAULT 'rebound',
  ADD COLUMN IF NOT EXISTS notif_vibrate BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_show_text BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_show_sender BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sessions_auto_terminate_days INTEGER NOT NULL DEFAULT 180;
