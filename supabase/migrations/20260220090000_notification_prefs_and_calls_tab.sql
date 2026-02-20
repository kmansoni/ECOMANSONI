-- Notifications (categories + exceptions) and calls tab preference

-- =====================================================
-- 1) Notification category settings
-- =====================================================

CREATE TABLE IF NOT EXISTS public.notification_category_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sound_id TEXT,
  vibrate BOOLEAN,
  show_text BOOLEAN,
  show_sender BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, category),
  CONSTRAINT notification_category_kind_check
    CHECK (category IN ('dm', 'group', 'channel', 'stories', 'reactions'))
);

ALTER TABLE public.notification_category_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_category_settings'
      AND policyname='Users can view own notification category settings'
  ) THEN
    CREATE POLICY "Users can view own notification category settings"
      ON public.notification_category_settings FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_category_settings'
      AND policyname='Users can insert own notification category settings'
  ) THEN
    CREATE POLICY "Users can insert own notification category settings"
      ON public.notification_category_settings FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_category_settings'
      AND policyname='Users can update own notification category settings'
  ) THEN
    CREATE POLICY "Users can update own notification category settings"
      ON public.notification_category_settings FOR UPDATE
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_category_settings'
      AND policyname='Users can delete own notification category settings'
  ) THEN
    CREATE POLICY "Users can delete own notification category settings"
      ON public.notification_category_settings FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notification_category_settings_user_idx
  ON public.notification_category_settings(user_id, category);

CREATE TRIGGER update_notification_category_settings_updated_at
BEFORE UPDATE ON public.notification_category_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_category_settings;


-- =====================================================
-- 2) Notification exceptions
-- =====================================================

CREATE TABLE IF NOT EXISTS public.notification_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_kind TEXT NOT NULL,
  item_id UUID NOT NULL,
  is_muted BOOLEAN NOT NULL DEFAULT true,
  sound_id TEXT,
  vibrate BOOLEAN,
  show_text BOOLEAN,
  show_sender BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_kind, item_id),
  CONSTRAINT notification_exception_kind_check
    CHECK (item_kind IN ('dm', 'group', 'channel'))
);

ALTER TABLE public.notification_exceptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_exceptions'
      AND policyname='Users can view own notification exceptions'
  ) THEN
    CREATE POLICY "Users can view own notification exceptions"
      ON public.notification_exceptions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_exceptions'
      AND policyname='Users can insert own notification exceptions'
  ) THEN
    CREATE POLICY "Users can insert own notification exceptions"
      ON public.notification_exceptions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_exceptions'
      AND policyname='Users can update own notification exceptions'
  ) THEN
    CREATE POLICY "Users can update own notification exceptions"
      ON public.notification_exceptions FOR UPDATE
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_exceptions'
      AND policyname='Users can delete own notification exceptions'
  ) THEN
    CREATE POLICY "Users can delete own notification exceptions"
      ON public.notification_exceptions FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notification_exceptions_user_idx
  ON public.notification_exceptions(user_id, item_kind);

CREATE TRIGGER update_notification_exceptions_updated_at
BEFORE UPDATE ON public.notification_exceptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_exceptions;


-- =====================================================
-- 3) Calls tab preference (user_settings)
-- =====================================================

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS show_calls_tab BOOLEAN NOT NULL DEFAULT true;
