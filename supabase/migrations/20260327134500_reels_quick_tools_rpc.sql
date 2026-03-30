-- Reels quick tools backend wiring:
-- audio/effects/face/ai/max_duration settings persisted via create_reel_v1.

ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS music_track_id TEXT,
  ADD COLUMN IF NOT EXISTS effect_preset TEXT,
  ADD COLUMN IF NOT EXISTS face_enhance BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_enhance BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_duration_sec INTEGER;

CREATE OR REPLACE FUNCTION public.create_reel_v1(
  p_client_publish_id UUID,
  p_video_url TEXT,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_music_title TEXT DEFAULT NULL,
  p_visibility TEXT DEFAULT 'public',
  p_location_name TEXT DEFAULT NULL,
  p_tagged_users TEXT[] DEFAULT '{}'::text[],
  p_allow_comments BOOLEAN DEFAULT true,
  p_allow_remix BOOLEAN DEFAULT true,
  p_music_track_id TEXT DEFAULT NULL,
  p_effect_preset TEXT DEFAULT NULL,
  p_face_enhance BOOLEAN DEFAULT false,
  p_ai_enhance BOOLEAN DEFAULT false,
  p_max_duration_sec INTEGER DEFAULT NULL
)
RETURNS public.reels
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_row public.reels;
  v_raw TEXT;
  v_bucket TEXT;
  v_path TEXT;
  v_matches TEXT[];
  v_expected_prefix TEXT;
  v_expected_pattern TEXT;
  v_visibility TEXT := lower(btrim(COALESCE(p_visibility, 'public')));
  v_location_name TEXT := NULLIF(btrim(COALESCE(p_location_name, '')), '');
  v_tagged_users TEXT[];
  v_effect_preset TEXT := NULLIF(btrim(COALESCE(p_effect_preset, '')), '');
  v_music_track_id TEXT := NULLIF(btrim(COALESCE(p_music_track_id, '')), '');
  v_max_duration INTEGER := p_max_duration_sec;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_client_publish_id IS NULL THEN
    RAISE EXCEPTION 'missing_client_publish_id' USING ERRCODE = '22023';
  END IF;

  IF v_visibility NOT IN ('public', 'followers', 'private') THEN
    RAISE EXCEPTION 'invalid_visibility' USING ERRCODE = '22023';
  END IF;

  IF v_max_duration IS NOT NULL AND v_max_duration NOT IN (60, 90) THEN
    RAISE EXCEPTION 'invalid_max_duration_sec' USING ERRCODE = '22023';
  END IF;

  v_raw := btrim(COALESCE(p_video_url, ''));
  IF length(v_raw) < 1 OR length(v_raw) > 2048 THEN
    RAISE EXCEPTION 'invalid_video_url' USING ERRCODE = '22023';
  END IF;

  v_matches := regexp_match(v_raw, '/storage/v1/object/public/([^/]+)/(.+)$');
  IF v_matches IS NOT NULL THEN
    v_bucket := v_matches[1];
    v_path := v_matches[2];
  ELSE
    v_matches := regexp_match(v_raw, '^([^/]+)/(.+)$');
    IF v_matches IS NOT NULL AND v_matches[1] = 'reels-media' THEN
      v_bucket := v_matches[1];
      v_path := v_matches[2];
    ELSE
      v_bucket := 'reels-media';
      v_path := v_raw;
    END IF;
  END IF;

  v_bucket := btrim(COALESCE(v_bucket, ''));
  v_path := btrim(COALESCE(v_path, ''));

  IF v_bucket <> 'reels-media' THEN
    RAISE EXCEPTION 'invalid_video_bucket' USING ERRCODE = '22023';
  END IF;

  IF length(v_path) < 1 OR length(v_path) > 512 THEN
    RAISE EXCEPTION 'invalid_video_path' USING ERRCODE = '22023';
  END IF;

  IF left(v_path, 1) = '/' OR position('..' in v_path) > 0 OR position('//' in v_path) > 0 THEN
    RAISE EXCEPTION 'invalid_video_path' USING ERRCODE = '22023';
  END IF;

  v_expected_prefix := v_user::text || '/reels/' || p_client_publish_id::text || '/';
  IF left(v_path, length(v_expected_prefix)) <> v_expected_prefix THEN
    RAISE EXCEPTION 'video_path_must_match_publish_intent' USING ERRCODE = '22023';
  END IF;

  v_expected_pattern := '^' || v_user::text || '/reels/' || p_client_publish_id::text || '/original\.[a-z0-9]{1,8}$';
  IF NOT (v_path ~ v_expected_pattern) THEN
    RAISE EXCEPTION 'invalid_video_path_shape' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(lower(btrim(v))), '{}'::text[])
    INTO v_tagged_users
  FROM unnest(COALESCE(p_tagged_users, '{}'::text[])) AS t(v)
  WHERE btrim(v) <> '';

  IF COALESCE(array_length(v_tagged_users, 1), 0) > 30 THEN
    RAISE EXCEPTION 'too_many_tagged_users' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.reels(
    author_id,
    client_publish_id,
    video_url,
    thumbnail_url,
    description,
    music_title,
    visibility,
    location_name,
    tagged_users,
    allow_comments,
    allow_remix,
    music_track_id,
    effect_preset,
    face_enhance,
    ai_enhance,
    max_duration_sec
  )
  VALUES (
    v_user,
    p_client_publish_id,
    v_path,
    NULLIF(btrim(COALESCE(p_thumbnail_url, '')), ''),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_music_title, '')), ''),
    v_visibility,
    v_location_name,
    v_tagged_users,
    COALESCE(p_allow_comments, true),
    COALESCE(p_allow_remix, true),
    v_music_track_id,
    v_effect_preset,
    COALESCE(p_face_enhance, false),
    COALESCE(p_ai_enhance, false),
    v_max_duration
  )
  ON CONFLICT (author_id, client_publish_id)
  DO UPDATE SET
    video_url = EXCLUDED.video_url,
    thumbnail_url = EXCLUDED.thumbnail_url,
    description = EXCLUDED.description,
    music_title = EXCLUDED.music_title,
    visibility = EXCLUDED.visibility,
    location_name = EXCLUDED.location_name,
    tagged_users = EXCLUDED.tagged_users,
    allow_comments = EXCLUDED.allow_comments,
    allow_remix = EXCLUDED.allow_remix,
    music_track_id = EXCLUDED.music_track_id,
    effect_preset = EXCLUDED.effect_preset,
    face_enhance = EXCLUDED.face_enhance,
    ai_enhance = EXCLUDED.ai_enhance,
    max_duration_sec = EXCLUDED.max_duration_sec
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_reel_v1(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, BOOLEAN, TEXT, TEXT, BOOLEAN, BOOLEAN, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_reel_v1(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, BOOLEAN, TEXT, TEXT, BOOLEAN, BOOLEAN, INTEGER) TO authenticated;
