-- Appearance + energy saver baseline (Telegram-like settings)

-- =====================================================
-- 1) Appearance settings
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_appearance_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_theme_id TEXT NOT NULL DEFAULT 'night',
  chat_wallpaper_id TEXT NOT NULL DEFAULT 'home',
  personal_color_primary TEXT NOT NULL DEFAULT '#4f8cff',
  personal_color_secondary TEXT NOT NULL DEFAULT '#8b5cf6',
  dark_mode_enabled BOOLEAN NOT NULL DEFAULT true,
  dark_theme TEXT NOT NULL DEFAULT 'system' CHECK (dark_theme IN ('system', 'light', 'dark')),
  font_scale INTEGER NOT NULL DEFAULT 100 CHECK (font_scale BETWEEN 80 AND 200),
  message_corner_radius INTEGER NOT NULL DEFAULT 18 CHECK (message_corner_radius BETWEEN 0 AND 28),
  ui_animations_enabled BOOLEAN NOT NULL DEFAULT true,
  stickers_emoji_animations_enabled BOOLEAN NOT NULL DEFAULT true,
  media_tap_navigation_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_appearance_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_appearance_settings'
      AND policyname='Users can view own appearance settings'
  ) THEN
    CREATE POLICY "Users can view own appearance settings"
      ON public.user_appearance_settings FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_appearance_settings'
      AND policyname='Users can insert own appearance settings'
  ) THEN
    CREATE POLICY "Users can insert own appearance settings"
      ON public.user_appearance_settings FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_appearance_settings'
      AND policyname='Users can update own appearance settings'
  ) THEN
    CREATE POLICY "Users can update own appearance settings"
      ON public.user_appearance_settings FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_user_appearance_settings_updated_at ON public.user_appearance_settings;
CREATE TRIGGER update_user_appearance_settings_updated_at
BEFORE UPDATE ON public.user_appearance_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 2) App icon catalog + user icon selection
-- =====================================================

CREATE TABLE IF NOT EXISTS public.app_icon_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon_url TEXT,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_app_icon_selection (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  icon_id TEXT NOT NULL REFERENCES public.app_icon_catalog(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_icon_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_app_icon_selection ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='app_icon_catalog'
      AND policyname='Anyone can read active app icon catalog'
  ) THEN
    CREATE POLICY "Anyone can read active app icon catalog"
      ON public.app_icon_catalog FOR SELECT
      USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_app_icon_selection'
      AND policyname='Users can view own app icon selection'
  ) THEN
    CREATE POLICY "Users can view own app icon selection"
      ON public.user_app_icon_selection FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_app_icon_selection'
      AND policyname='Users can upsert own app icon selection'
  ) THEN
    CREATE POLICY "Users can upsert own app icon selection"
      ON public.user_app_icon_selection FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_app_icon_selection'
      AND policyname='Users can update own app icon selection'
  ) THEN
    CREATE POLICY "Users can update own app icon selection"
      ON public.user_app_icon_selection FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_user_app_icon_selection_updated_at ON public.user_app_icon_selection;
CREATE TRIGGER update_user_app_icon_selection_updated_at
BEFORE UPDATE ON public.user_app_icon_selection
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_icon_catalog(id, name, is_premium, is_active, sort_order)
VALUES
  ('main', 'Основная', false, true, 10),
  ('ocean', 'Океан', false, true, 20),
  ('sunset', 'Закат', false, true, 30),
  ('main_x', 'Основная X', false, true, 40),
  ('classic', 'Классика', false, true, 50),
  ('classic_x', 'Классика X', false, true, 60),
  ('fill', 'Заливка', false, true, 70),
  ('fill_x', 'Заливка X', false, true, 80),
  ('premium', 'Premium', true, true, 90),
  ('turbo', 'Турбо', true, true, 100),
  ('black', 'Черная', true, true, 110)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  is_premium = EXCLUDED.is_premium,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

-- =====================================================
-- 3) Energy saver settings
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_energy_saver_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'auto', 'manual')),
  battery_threshold_percent INTEGER NOT NULL DEFAULT 15 CHECK (battery_threshold_percent BETWEEN 5 AND 99),
  autoplay_video BOOLEAN NOT NULL DEFAULT true,
  autoplay_gif BOOLEAN NOT NULL DEFAULT true,
  animated_stickers BOOLEAN NOT NULL DEFAULT true,
  animated_emoji BOOLEAN NOT NULL DEFAULT true,
  interface_animations BOOLEAN NOT NULL DEFAULT true,
  media_preload BOOLEAN NOT NULL DEFAULT true,
  background_updates BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_energy_saver_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_energy_saver_settings'
      AND policyname='Users can view own energy saver settings'
  ) THEN
    CREATE POLICY "Users can view own energy saver settings"
      ON public.user_energy_saver_settings FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_energy_saver_settings'
      AND policyname='Users can insert own energy saver settings'
  ) THEN
    CREATE POLICY "Users can insert own energy saver settings"
      ON public.user_energy_saver_settings FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_energy_saver_settings'
      AND policyname='Users can update own energy saver settings'
  ) THEN
    CREATE POLICY "Users can update own energy saver settings"
      ON public.user_energy_saver_settings FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_user_energy_saver_settings_updated_at ON public.user_energy_saver_settings;
CREATE TRIGGER update_user_energy_saver_settings_updated_at
BEFORE UPDATE ON public.user_energy_saver_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 4) Realtime publications
-- =====================================================

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_appearance_settings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_app_icon_selection;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_energy_saver_settings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

