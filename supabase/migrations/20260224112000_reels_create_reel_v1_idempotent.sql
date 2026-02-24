-- P0C — Create Reels MVP: server-side idempotent publish RPC
--
-- Goals:
-- - Make publish idempotent by (author_id, client_publish_id)
-- - Basic server-side validation (minimal Phase 0)

-- Ensure ON CONFLICT inference works with a non-partial unique index.
DROP INDEX IF EXISTS public.idx_reels_author_client_publish_id_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reels_author_client_publish_id_uniq
  ON public.reels(author_id, client_publish_id);

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
  v_video_url TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_client_publish_id IS NULL THEN
    RAISE EXCEPTION 'missing_client_publish_id' USING ERRCODE = '22023';
  END IF;

  v_video_url := btrim(coalesce(p_video_url, ''));
  IF length(v_video_url) < 1 OR length(v_video_url) > 2048 THEN
    RAISE EXCEPTION 'invalid_video_url' USING ERRCODE = '22023';
  END IF;

  -- Minimal Phase 0 validation: require reels-media bucket (public URL or object path).
  IF position('reels-media' in v_video_url) = 0 THEN
    RAISE EXCEPTION 'invalid_video_url_bucket' USING ERRCODE = '22023';
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
    v_video_url,
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
