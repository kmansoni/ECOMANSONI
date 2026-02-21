-- Appearance/Energy backend RPC + audit log

-- =====================================================
-- 1) Audit log for settings changes
-- =====================================================

CREATE TABLE IF NOT EXISTS public.settings_change_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('appearance', 'energy', 'app_icon')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.settings_change_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='settings_change_audit'
      AND policyname='Users can view own settings audit'
  ) THEN
    CREATE POLICY "Users can view own settings audit"
      ON public.settings_change_audit FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- =====================================================
-- 2) RPC: update own appearance settings
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_my_appearance_settings(
  p_chat_theme_id TEXT DEFAULT NULL,
  p_chat_wallpaper_id TEXT DEFAULT NULL,
  p_personal_color_primary TEXT DEFAULT NULL,
  p_personal_color_secondary TEXT DEFAULT NULL,
  p_dark_mode_enabled BOOLEAN DEFAULT NULL,
  p_dark_theme TEXT DEFAULT NULL,
  p_font_scale INTEGER DEFAULT NULL,
  p_message_corner_radius INTEGER DEFAULT NULL,
  p_ui_animations_enabled BOOLEAN DEFAULT NULL,
  p_stickers_emoji_animations_enabled BOOLEAN DEFAULT NULL,
  p_media_tap_navigation_enabled BOOLEAN DEFAULT NULL
)
RETURNS public.user_appearance_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.user_appearance_settings;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_appearance_settings(user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_appearance_settings
  SET
    chat_theme_id = COALESCE(p_chat_theme_id, chat_theme_id),
    chat_wallpaper_id = COALESCE(p_chat_wallpaper_id, chat_wallpaper_id),
    personal_color_primary = COALESCE(p_personal_color_primary, personal_color_primary),
    personal_color_secondary = COALESCE(p_personal_color_secondary, personal_color_secondary),
    dark_mode_enabled = COALESCE(p_dark_mode_enabled, dark_mode_enabled),
    dark_theme = COALESCE(p_dark_theme, dark_theme),
    font_scale = COALESCE(p_font_scale, font_scale),
    message_corner_radius = COALESCE(p_message_corner_radius, message_corner_radius),
    ui_animations_enabled = COALESCE(p_ui_animations_enabled, ui_animations_enabled),
    stickers_emoji_animations_enabled = COALESCE(p_stickers_emoji_animations_enabled, stickers_emoji_animations_enabled),
    media_tap_navigation_enabled = COALESCE(p_media_tap_navigation_enabled, media_tap_navigation_enabled)
  WHERE user_id = v_uid
  RETURNING * INTO v_row;

  INSERT INTO public.settings_change_audit(user_id, scope, payload)
  VALUES (
    v_uid,
    'appearance',
    jsonb_strip_nulls(
      jsonb_build_object(
        'chat_theme_id', p_chat_theme_id,
        'chat_wallpaper_id', p_chat_wallpaper_id,
        'personal_color_primary', p_personal_color_primary,
        'personal_color_secondary', p_personal_color_secondary,
        'dark_mode_enabled', p_dark_mode_enabled,
        'dark_theme', p_dark_theme,
        'font_scale', p_font_scale,
        'message_corner_radius', p_message_corner_radius,
        'ui_animations_enabled', p_ui_animations_enabled,
        'stickers_emoji_animations_enabled', p_stickers_emoji_animations_enabled,
        'media_tap_navigation_enabled', p_media_tap_navigation_enabled
      )
    )
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_appearance_settings(
  TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, INTEGER, INTEGER, BOOLEAN, BOOLEAN, BOOLEAN
) TO authenticated;

-- =====================================================
-- 3) RPC: update own energy saver settings
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_my_energy_saver_settings(
  p_mode TEXT DEFAULT NULL,
  p_battery_threshold_percent INTEGER DEFAULT NULL,
  p_autoplay_video BOOLEAN DEFAULT NULL,
  p_autoplay_gif BOOLEAN DEFAULT NULL,
  p_animated_stickers BOOLEAN DEFAULT NULL,
  p_animated_emoji BOOLEAN DEFAULT NULL,
  p_interface_animations BOOLEAN DEFAULT NULL,
  p_media_preload BOOLEAN DEFAULT NULL,
  p_background_updates BOOLEAN DEFAULT NULL
)
RETURNS public.user_energy_saver_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.user_energy_saver_settings;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_energy_saver_settings(user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_energy_saver_settings
  SET
    mode = COALESCE(p_mode, mode),
    battery_threshold_percent = COALESCE(p_battery_threshold_percent, battery_threshold_percent),
    autoplay_video = COALESCE(p_autoplay_video, autoplay_video),
    autoplay_gif = COALESCE(p_autoplay_gif, autoplay_gif),
    animated_stickers = COALESCE(p_animated_stickers, animated_stickers),
    animated_emoji = COALESCE(p_animated_emoji, animated_emoji),
    interface_animations = COALESCE(p_interface_animations, interface_animations),
    media_preload = COALESCE(p_media_preload, media_preload),
    background_updates = COALESCE(p_background_updates, background_updates)
  WHERE user_id = v_uid
  RETURNING * INTO v_row;

  INSERT INTO public.settings_change_audit(user_id, scope, payload)
  VALUES (
    v_uid,
    'energy',
    jsonb_strip_nulls(
      jsonb_build_object(
        'mode', p_mode,
        'battery_threshold_percent', p_battery_threshold_percent,
        'autoplay_video', p_autoplay_video,
        'autoplay_gif', p_autoplay_gif,
        'animated_stickers', p_animated_stickers,
        'animated_emoji', p_animated_emoji,
        'interface_animations', p_interface_animations,
        'media_preload', p_media_preload,
        'background_updates', p_background_updates
      )
    )
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_energy_saver_settings(
  TEXT, INTEGER, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN
) TO authenticated;

-- =====================================================
-- 4) RPC: set own app icon
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_my_app_icon_selection(
  p_icon_id TEXT
)
RETURNS public.user_app_icon_selection
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.user_app_icon_selection;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM 1
  FROM public.app_icon_catalog c
  WHERE c.id = p_icon_id AND c.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown icon_id: %', p_icon_id;
  END IF;

  INSERT INTO public.user_app_icon_selection(user_id, icon_id)
  VALUES (v_uid, p_icon_id)
  ON CONFLICT (user_id) DO UPDATE SET icon_id = EXCLUDED.icon_id
  RETURNING * INTO v_row;

  INSERT INTO public.settings_change_audit(user_id, scope, payload)
  VALUES (v_uid, 'app_icon', jsonb_build_object('icon_id', p_icon_id));

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_app_icon_selection(TEXT) TO authenticated;

