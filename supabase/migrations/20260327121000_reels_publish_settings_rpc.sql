-- Reels publish settings: remove frontend placeholders by persisting audience/location/tags/advanced flags
-- Scope: Reels creation flow only.

ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS location_name TEXT,
  ADD COLUMN IF NOT EXISTS tagged_users TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS allow_comments BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_remix BOOLEAN NOT NULL DEFAULT true;

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
  p_allow_remix BOOLEAN DEFAULT true
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
    allow_remix
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
    COALESCE(p_allow_remix, true)
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
    allow_remix = EXCLUDED.allow_remix
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_reel_v1(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_reel_v1(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], BOOLEAN, BOOLEAN) TO authenticated;
