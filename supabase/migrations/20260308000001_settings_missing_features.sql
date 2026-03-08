-- Migration: settings_missing_features
-- Created: 2026-03-08
-- Adds: close_friends, mention_notifications, calls settings, user_screen_time

-- ============================================================
-- 1. TABLE: close_friends
-- ============================================================
CREATE TABLE IF NOT EXISTS public.close_friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_close_friends_user_id ON public.close_friends(user_id);
CREATE INDEX IF NOT EXISTS idx_close_friends_friend_id ON public.close_friends(friend_id);

ALTER TABLE public.close_friends ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'close_friends'
      AND policyname = 'Users manage own close friends'
  ) THEN
    CREATE POLICY "Users manage own close friends" ON public.close_friends
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- 2. COLUMN: mention_notifications in user_settings
-- ============================================================
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS mention_notifications boolean NOT NULL DEFAULT true;

-- ============================================================
-- 3. COLUMNS: calls settings in user_settings
-- ============================================================
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS calls_noise_suppression boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS calls_p2p_mode text NOT NULL DEFAULT 'contacts';

-- Apply CHECK constraint only if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_settings_calls_p2p_mode_check'
      AND conrelid = 'public.user_settings'::regclass
  ) THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT user_settings_calls_p2p_mode_check
      CHECK (calls_p2p_mode IN ('everyone', 'contacts', 'nobody'));
  END IF;
END $$;

-- ============================================================
-- 4. TABLE: user_screen_time
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_screen_time (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  duration_seconds integer NOT NULL DEFAULT 0,
  last_ping_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_user_screen_time_user_date ON public.user_screen_time(user_id, session_date);

ALTER TABLE public.user_screen_time ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_screen_time'
      AND policyname = 'Users manage own screen time'
  ) THEN
    CREATE POLICY "Users manage own screen time" ON public.user_screen_time
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- 5. FUNCTION: increment_screen_time (atomic upsert, SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_screen_time(p_seconds integer DEFAULT 60)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_screen_time (user_id, session_date, duration_seconds, last_ping_at)
  VALUES (auth.uid(), CURRENT_DATE, p_seconds, now())
  ON CONFLICT (user_id, session_date)
  DO UPDATE SET
    duration_seconds = user_screen_time.duration_seconds + p_seconds,
    last_ping_at = now();
END;
$$;

-- ============================================================
-- 6. FUNCTION: get_screen_time_today (read-only, SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_screen_time_today()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(duration_seconds, 0)
  FROM public.user_screen_time
  WHERE user_id = auth.uid() AND session_date = CURRENT_DATE
  LIMIT 1;
$$;
