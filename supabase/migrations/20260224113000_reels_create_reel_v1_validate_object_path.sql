-- P0C — Create Reels MVP hardening: validate storage object path server-side
--
-- Goal: do not trust arbitrary `video_url` from client.
-- Accept either:
--   - object path: "<author_id>/reels/<client_publish_id>/original.<ext>"
--   - public URL:  ".../storage/v1/object/public/reels-media/<object path>"
--   - bucket-prefixed path: "reels-media/<object path>"
--
-- Store canonical object path in `reels.video_url` (client normalizes to public URL).

CREATE OR REPLACE FUNCTION public.create_reel_v1(
  p_client_publish_id UUID,
  p_video_url TEXT,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_music_title TEXT DEFAULT NULL
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
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_client_publish_id IS NULL THEN
    RAISE EXCEPTION 'missing_client_publish_id' USING ERRCODE = '22023';
  END IF;

  v_raw := btrim(coalesce(p_video_url, ''));
  IF length(v_raw) < 1 OR length(v_raw) > 2048 THEN
    RAISE EXCEPTION 'invalid_video_url' USING ERRCODE = '22023';
  END IF;

  -- 1) URL form: .../storage/v1/object/public/<bucket>/<path>
  v_matches := regexp_match(v_raw, '/storage/v1/object/public/([^/]+)/(.+)$');
  IF v_matches IS NOT NULL THEN
    v_bucket := v_matches[1];
    v_path := v_matches[2];
  ELSE
    -- 2) bucket-prefixed path: <bucket>/<path>
    v_matches := regexp_match(v_raw, '^([^/]+)/(.+)$');
    IF v_matches IS NOT NULL AND v_matches[1] = 'reels-media' THEN
      v_bucket := v_matches[1];
      v_path := v_matches[2];
    ELSE
      -- 3) raw object path, assume reels-media
      v_bucket := 'reels-media';
      v_path := v_raw;
    END IF;
  END IF;

  v_bucket := btrim(coalesce(v_bucket, ''));
  v_path := btrim(coalesce(v_path, ''));

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

  -- Enforce deterministic key shape.
  v_expected_pattern := '^' || v_user::text || '/reels/' || p_client_publish_id::text || '/original\\.[a-z0-9]{1,8}$';
  IF NOT (v_path ~ v_expected_pattern) THEN
    RAISE EXCEPTION 'invalid_video_path_shape' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.reels(
    author_id,
    client_publish_id,
    video_url,
    thumbnail_url,
    description,
    music_title
  )
  VALUES (
    v_user,
    p_client_publish_id,
    v_path,
    NULLIF(btrim(coalesce(p_thumbnail_url, '')), ''),
    NULLIF(btrim(coalesce(p_description, '')), ''),
    NULLIF(btrim(coalesce(p_music_title, '')), '')
  )
  ON CONFLICT (author_id, client_publish_id)
  DO UPDATE SET
    video_url = EXCLUDED.video_url,
    thumbnail_url = EXCLUDED.thumbnail_url,
    description = EXCLUDED.description,
    music_title = EXCLUDED.music_title
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_reel_v1(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_reel_v1(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
