-- Settings + Creator Insights + Branded Content (Telegram-level baseline)

-- =====================================================
-- USER SETTINGS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Appearance
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  language_code TEXT NOT NULL DEFAULT 'ru',
  font_scale SMALLINT NOT NULL DEFAULT 100 CHECK (font_scale BETWEEN 80 AND 200),
  reduce_motion BOOLEAN NOT NULL DEFAULT false,
  high_contrast BOOLEAN NOT NULL DEFAULT false,

  -- Notifications (app-level)
  push_notifications BOOLEAN NOT NULL DEFAULT true,
  likes_notifications BOOLEAN NOT NULL DEFAULT true,
  comments_notifications BOOLEAN NOT NULL DEFAULT true,
  followers_notifications BOOLEAN NOT NULL DEFAULT true,

  -- Privacy
  private_account BOOLEAN NOT NULL DEFAULT false,
  show_activity_status BOOLEAN NOT NULL DEFAULT true,

  -- Branded content
  branded_content_manual_approval BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_settings'
      AND policyname = 'Users can view own settings'
  ) THEN
    CREATE POLICY "Users can view own settings"
      ON public.user_settings
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_settings'
      AND policyname = 'Users can insert own settings'
  ) THEN
    CREATE POLICY "Users can insert own settings"
      ON public.user_settings
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_settings'
      AND policyname = 'Users can update own settings'
  ) THEN
    CREATE POLICY "Users can update own settings"
      ON public.user_settings
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_user_settings_updated_at'
  ) THEN
    CREATE TRIGGER update_user_settings_updated_at
      BEFORE UPDATE ON public.user_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Ensure settings row exists for every new user
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_settings(user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'on_auth_user_created_settings'
  ) THEN
    CREATE TRIGGER on_auth_user_created_settings
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user_settings();
  END IF;
END $$;

-- =====================================================
-- BRANDED CONTENT: APPROVED AUTHORS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.branded_content_approved_authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_user_id, author_user_id)
);

ALTER TABLE public.branded_content_approved_authors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'branded_content_approved_authors'
      AND policyname = 'Brands can manage approved authors'
  ) THEN
    CREATE POLICY "Brands can manage approved authors"
      ON public.branded_content_approved_authors
      FOR ALL
      USING (auth.uid() = brand_user_id)
      WITH CHECK (auth.uid() = brand_user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_branded_content_approved_authors_brand
  ON public.branded_content_approved_authors(brand_user_id);

-- =====================================================
-- CREATOR INSIGHTS (RPC)
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_creator_insights(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_since TIMESTAMPTZ;
  v_views_total BIGINT;
  v_views_non_followers BIGINT;
  v_followers_total BIGINT;
  v_followers_gained BIGINT;
  v_non_followers_pct NUMERIC;
  v_reels_total BIGINT;
  v_views_by_day JSONB;
  v_views_by_hour JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_since := now() - make_interval(days => GREATEST(1, p_days));

  SELECT COUNT(*)
    INTO v_followers_total
  FROM public.followers
  WHERE following_id = v_uid;

  SELECT COUNT(*)
    INTO v_followers_gained
  FROM public.followers
  WHERE following_id = v_uid
    AND created_at >= v_since;

  SELECT COUNT(*)
    INTO v_reels_total
  FROM public.reels
  WHERE author_id = v_uid;

  SELECT COUNT(*)
    INTO v_views_total
  FROM public.reel_views rv
  JOIN public.reels r ON r.id = rv.reel_id
  WHERE r.author_id = v_uid
    AND COALESCE(rv.viewed_at, now()) >= v_since;

  SELECT COUNT(*)
    INTO v_views_non_followers
  FROM public.reel_views rv
  JOIN public.reels r ON r.id = rv.reel_id
  WHERE r.author_id = v_uid
    AND COALESCE(rv.viewed_at, now()) >= v_since
    AND (
      rv.user_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.followers f
        WHERE f.following_id = v_uid
          AND f.follower_id = rv.user_id
      )
    );

  v_non_followers_pct := CASE
    WHEN v_views_total = 0 THEN 0
    ELSE ROUND((v_views_non_followers::NUMERIC * 100.0) / v_views_total::NUMERIC, 1)
  END;

  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('day', day::TEXT, 'views', views) ORDER BY day), '[]'::JSONB)
    INTO v_views_by_day
  FROM (
    SELECT DATE_TRUNC('day', COALESCE(rv.viewed_at, now())) AS day,
           COUNT(*)::INT AS views
    FROM public.reel_views rv
    JOIN public.reels r ON r.id = rv.reel_id
    WHERE r.author_id = v_uid
      AND COALESCE(rv.viewed_at, now()) >= v_since
    GROUP BY 1
  ) t;

  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('hour', hour_of_day, 'views', views) ORDER BY hour_of_day), '[]'::JSONB)
    INTO v_views_by_hour
  FROM (
    SELECT EXTRACT(HOUR FROM COALESCE(rv.viewed_at, now()))::INT AS hour_of_day,
           COUNT(*)::INT AS views
    FROM public.reel_views rv
    JOIN public.reels r ON r.id = rv.reel_id
    WHERE r.author_id = v_uid
      AND COALESCE(rv.viewed_at, now()) >= v_since
    GROUP BY 1
  ) t;

  RETURN JSONB_BUILD_OBJECT(
    'days', GREATEST(1, p_days),
    'since', v_since,
    'views_total', v_views_total,
    'views_non_followers_pct', v_non_followers_pct,
    'followers_total', v_followers_total,
    'followers_gained', v_followers_gained,
    'reels_total', v_reels_total,
    'views_by_day', v_views_by_day,
    'views_by_hour', v_views_by_hour
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_creator_insights(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_creator_insights(INT) TO authenticated;