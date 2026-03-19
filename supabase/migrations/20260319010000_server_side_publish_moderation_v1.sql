-- Enforce baseline server-side text moderation on publish flows and
-- provide RPC write paths so client inserts cannot bypass SQL-layer checks.

CREATE OR REPLACE FUNCTION public.enforce_basic_text_moderation_v1(p_text TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_text TEXT := btrim(COALESCE(p_text, ''));
  v_lower TEXT;
BEGIN
  IF v_text = '' THEN
    RETURN;
  END IF;

  v_lower := lower(v_text);

  IF v_lower ~ '(хуй|пизд|ебат|ебан|еблан|сука|бляд|ублюд|мудак|пидор|шлюх|мраз|гандон|fuck|shit|bitch|asshole|cunt|dick|cock|pussy|nigger|faggot|retard|whore|slut)' THEN
    RAISE EXCEPTION 'CONTENT_MODERATION_BLOCKED:explicit_language'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_text ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}' THEN
    RAISE EXCEPTION 'CONTENT_MODERATION_BLOCKED:contact_info_email'
      USING ERRCODE = 'P0001';
  END IF;

  IF regexp_replace(v_text, '\s+', '', 'g') ~ '(\+7|8|7)?\(?\d{3}\)?\d{3}\d{2}\d{2}' THEN
    RAISE EXCEPTION 'CONTENT_MODERATION_BLOCKED:contact_info_phone'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_basic_text_moderation_on_text_col_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col TEXT := TG_ARGV[0];
  v_text TEXT;
BEGIN
  IF v_col IS NULL OR v_col = '' THEN
    RETURN NEW;
  END IF;

  v_text := to_jsonb(NEW)->>v_col;
  PERFORM public.enforce_basic_text_moderation_v1(v_text);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_basic_text_moderation_v1(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_basic_text_moderation_v1(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_basic_text_moderation_on_text_col_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_basic_text_moderation_on_text_col_v1() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'posts') THEN
    DROP TRIGGER IF EXISTS trg_enforce_basic_text_posts_v1 ON public.posts;
    CREATE TRIGGER trg_enforce_basic_text_posts_v1
      BEFORE INSERT OR UPDATE OF content ON public.posts
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_basic_text_moderation_on_text_col_v1('content');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reels') THEN
    DROP TRIGGER IF EXISTS trg_enforce_basic_text_reels_v1 ON public.reels;
    CREATE TRIGGER trg_enforce_basic_text_reels_v1
      BEFORE INSERT OR UPDATE OF description ON public.reels
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_basic_text_moderation_on_text_col_v1('description');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.create_post_v1(
  p_content TEXT DEFAULT NULL,
  p_visibility TEXT DEFAULT 'public',
  p_media JSONB DEFAULT '[]'::JSONB
)
RETURNS public.posts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_post public.posts;
  v_visibility TEXT := lower(btrim(COALESCE(p_visibility, 'public')));
  v_media_item JSONB;
  v_media_url TEXT;
  v_media_type TEXT;
  v_sort_order INTEGER := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_visibility NOT IN ('public', 'followers', 'close_friends') THEN
    RAISE EXCEPTION 'invalid_visibility' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.posts(author_id, content, visibility)
  VALUES (
    v_user,
    NULLIF(btrim(COALESCE(p_content, '')), ''),
    v_visibility
  )
  RETURNING * INTO v_post;

  IF jsonb_typeof(COALESCE(p_media, '[]'::JSONB)) = 'array' THEN
    FOR v_media_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_media, '[]'::JSONB))
    LOOP
      v_media_url := btrim(COALESCE(v_media_item->>'url', ''));
      v_media_type := lower(btrim(COALESCE(v_media_item->>'type', 'image')));

      IF v_media_url = '' THEN
        CONTINUE;
      END IF;

      IF v_media_type NOT IN ('image', 'video') THEN
        RAISE EXCEPTION 'invalid_media_type' USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.post_media(post_id, media_url, media_type, sort_order)
      VALUES (v_post.id, v_media_url, v_media_type, v_sort_order);

      v_sort_order := v_sort_order + 1;
    END LOOP;
  END IF;

  RETURN v_post;
END;
$$;

REVOKE ALL ON FUNCTION public.create_post_v1(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_post_v1(TEXT, TEXT, JSONB) TO authenticated;

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
    NULLIF(btrim(COALESCE(p_thumbnail_url, '')), ''),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_music_title, '')), '')
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

REVOKE ALL ON FUNCTION public.create_reel_v1(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_reel_v1(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;