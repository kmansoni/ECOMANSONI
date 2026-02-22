-- Enforce hashtag moderation statuses on all main write paths (platform-wide).
-- Blocks inserts/updates when text contains a hashtag with status != 'normal'.

CREATE OR REPLACE FUNCTION public.validate_hashtags_allowed_v1(p_text TEXT)
RETURNS VOID AS $$
DECLARE
  v_blocked TEXT[];
BEGIN
  -- Service-only / internal writes may bypass moderation gating.
  IF auth.role() IN ('service_role', 'postgres') THEN
    RETURN;
  END IF;

  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN;
  END IF;

  WITH extracted AS (
    SELECT DISTINCT lower(regexp_replace(match, '^#', '')) AS normalized_tag
    FROM regexp_matches(p_text, '#[а-яА-ЯёЁa-zA-Z0-9_]+', 'g') AS match
  )
  SELECT array_agg(COALESCE(h.tag, '#' || e.normalized_tag) ORDER BY COALESCE(h.tag, '#' || e.normalized_tag))
  INTO v_blocked
  FROM extracted e
  JOIN public.hashtags h ON h.normalized_tag = e.normalized_tag
  WHERE COALESCE(h.status, 'normal') <> 'normal'
  LIMIT 20;

  IF v_blocked IS NOT NULL AND array_length(v_blocked, 1) > 0 THEN
    RAISE EXCEPTION 'HASHTAG_BLOCKED:%', array_to_string(v_blocked, ', ')
      USING ERRCODE = 'P0001';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.validate_hashtags_allowed_v1(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_hashtags_allowed_v1(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_hashtags_on_text_col_v1()
RETURNS TRIGGER AS $$
DECLARE
  v_col TEXT := TG_ARGV[0];
  v_text TEXT;
BEGIN
  IF v_col IS NULL OR v_col = '' THEN
    RETURN NEW;
  END IF;

  v_text := (to_jsonb(NEW)->>v_col);
  PERFORM public.validate_hashtags_allowed_v1(v_text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.enforce_hashtags_on_text_col_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_hashtags_on_text_col_v1() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='reels') THEN
    DROP TRIGGER IF EXISTS trg_enforce_hashtags_reels_v1 ON public.reels;
    CREATE TRIGGER trg_enforce_hashtags_reels_v1
      BEFORE INSERT OR UPDATE OF description ON public.reels
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_hashtags_on_text_col_v1('description');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='posts') THEN
    DROP TRIGGER IF EXISTS trg_enforce_hashtags_posts_v1 ON public.posts;
    CREATE TRIGGER trg_enforce_hashtags_posts_v1
      BEFORE INSERT OR UPDATE OF content ON public.posts
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_hashtags_on_text_col_v1('content');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='comments') THEN
    DROP TRIGGER IF EXISTS trg_enforce_hashtags_comments_v1 ON public.comments;
    CREATE TRIGGER trg_enforce_hashtags_comments_v1
      BEFORE INSERT OR UPDATE OF content ON public.comments
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_hashtags_on_text_col_v1('content');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='reel_comments') THEN
    DROP TRIGGER IF EXISTS trg_enforce_hashtags_reel_comments_v1 ON public.reel_comments;
    CREATE TRIGGER trg_enforce_hashtags_reel_comments_v1
      BEFORE INSERT OR UPDATE OF content ON public.reel_comments
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_hashtags_on_text_col_v1('content');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='messages') THEN
    DROP TRIGGER IF EXISTS trg_enforce_hashtags_messages_v1 ON public.messages;
    CREATE TRIGGER trg_enforce_hashtags_messages_v1
      BEFORE INSERT OR UPDATE OF content ON public.messages
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_hashtags_on_text_col_v1('content');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='channel_messages') THEN
    DROP TRIGGER IF EXISTS trg_enforce_hashtags_channel_messages_v1 ON public.channel_messages;
    CREATE TRIGGER trg_enforce_hashtags_channel_messages_v1
      BEFORE INSERT OR UPDATE OF content ON public.channel_messages
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_hashtags_on_text_col_v1('content');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='group_chat_messages') THEN
    DROP TRIGGER IF EXISTS trg_enforce_hashtags_group_chat_messages_v1 ON public.group_chat_messages;
    CREATE TRIGGER trg_enforce_hashtags_group_chat_messages_v1
      BEFORE INSERT OR UPDATE OF content ON public.group_chat_messages
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_hashtags_on_text_col_v1('content');
  END IF;
END
$$;
