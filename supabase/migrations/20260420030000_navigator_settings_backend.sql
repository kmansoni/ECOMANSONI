-- Migration: navigator_settings — server-side persistence for navigator preferences
-- Syncs with Zustand localStorage store; server-authoritative for premium features

CREATE TABLE IF NOT EXISTS public.navigator_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Sound
  sound_mode TEXT NOT NULL DEFAULT 'all'
    CHECK (sound_mode IN ('all','cameras','turns','police','signs','mute')),
  volume INTEGER NOT NULL DEFAULT 80 CHECK (volume BETWEEN 0 AND 100),
  mute_other_apps BOOLEAN NOT NULL DEFAULT false,

  -- Voice
  selected_voice TEXT NOT NULL DEFAULT 'default',
  voice_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Route preferences
  avoid_tolls BOOLEAN NOT NULL DEFAULT false,
  avoid_unpaved BOOLEAN NOT NULL DEFAULT false,
  avoid_highways BOOLEAN NOT NULL DEFAULT false,

  -- Vehicle marker
  selected_vehicle TEXT NOT NULL DEFAULT 'sedan-white',

  -- Map
  map_view_mode TEXT NOT NULL DEFAULT 'standard'
    CHECK (map_view_mode IN ('standard','satellite','hybrid','terrain','3d','dark','light')),
  nav_theme TEXT NOT NULL DEFAULT 'dark'
    CHECK (nav_theme IN ('dark','light','auto','amap','neon','retro')),
  show_3d_buildings BOOLEAN NOT NULL DEFAULT true,
  show_traffic_lights BOOLEAN NOT NULL DEFAULT true,
  show_speed_bumps BOOLEAN NOT NULL DEFAULT true,
  show_road_signs BOOLEAN NOT NULL DEFAULT true,
  show_lanes BOOLEAN NOT NULL DEFAULT true,
  show_speed_cameras BOOLEAN NOT NULL DEFAULT true,
  show_poi BOOLEAN NOT NULL DEFAULT true,
  show_panorama BOOLEAN NOT NULL DEFAULT false,
  label_size_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00
    CHECK (label_size_multiplier BETWEEN 0.70 AND 1.50),
  high_contrast_labels BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.navigator_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_navigator_settings_updated_at
  BEFORE UPDATE ON public.navigator_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.navigator_settings_updated_at();

-- RLS
ALTER TABLE public.navigator_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own navigator settings"
  ON public.navigator_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own navigator settings"
  ON public.navigator_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own navigator settings"
  ON public.navigator_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Upsert RPC for atomic create-or-update
CREATE OR REPLACE FUNCTION public.upsert_navigator_settings(
  p_user_id UUID,
  p_settings JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result RECORD;
BEGIN
  -- Validate caller owns this row
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO navigator_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE navigator_settings
  SET
    sound_mode          = COALESCE((p_settings->>'sound_mode'),          sound_mode),
    volume              = COALESCE((p_settings->>'volume')::int,        volume),
    mute_other_apps     = COALESCE((p_settings->>'mute_other_apps')::bool,  mute_other_apps),
    selected_voice      = COALESCE((p_settings->>'selected_voice'),     selected_voice),
    voice_enabled       = COALESCE((p_settings->>'voice_enabled')::bool,    voice_enabled),
    avoid_tolls         = COALESCE((p_settings->>'avoid_tolls')::bool,      avoid_tolls),
    avoid_unpaved       = COALESCE((p_settings->>'avoid_unpaved')::bool,    avoid_unpaved),
    avoid_highways      = COALESCE((p_settings->>'avoid_highways')::bool,   avoid_highways),
    selected_vehicle    = COALESCE((p_settings->>'selected_vehicle'),    selected_vehicle),
    map_view_mode       = COALESCE((p_settings->>'map_view_mode'),      map_view_mode),
    nav_theme           = COALESCE((p_settings->>'nav_theme'),          nav_theme),
    show_3d_buildings   = COALESCE((p_settings->>'show_3d_buildings')::bool, show_3d_buildings),
    show_traffic_lights = COALESCE((p_settings->>'show_traffic_lights')::bool, show_traffic_lights),
    show_speed_bumps    = COALESCE((p_settings->>'show_speed_bumps')::bool, show_speed_bumps),
    show_road_signs     = COALESCE((p_settings->>'show_road_signs')::bool, show_road_signs),
    show_lanes          = COALESCE((p_settings->>'show_lanes')::bool,   show_lanes),
    show_speed_cameras  = COALESCE((p_settings->>'show_speed_cameras')::bool, show_speed_cameras),
    show_poi            = COALESCE((p_settings->>'show_poi')::bool,     show_poi),
    show_panorama       = COALESCE((p_settings->>'show_panorama')::bool, show_panorama),
    label_size_multiplier = COALESCE((p_settings->>'label_size_multiplier')::numeric, label_size_multiplier),
    high_contrast_labels = COALESCE((p_settings->>'high_contrast_labels')::bool, high_contrast_labels)
  WHERE user_id = p_user_id;

  SELECT * INTO result FROM navigator_settings WHERE user_id = p_user_id;
  RETURN to_jsonb(result);
END;
$$;
