-- ============================================================================
-- HASHTAG MODERATION AGE EXTENSION
-- Migration: 20260513000002_safety_hashtag_age_integration.sql
-- ============================================================================
-- Extends existing hashtag moderation system with age-based filtering
-- Integrates with validate_hashtags_allowed_v1 to respect user's content_rating_limit
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENSURE ENUMS EXIST (guard)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_rating') THEN
    CREATE TYPE public.content_rating AS ENUM ('G', 'PG', 'PG-13', 'T', 'MA', 'NSFW');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_type') THEN
    CREATE TYPE public.content_type AS ENUM ('post', 'reel', 'comment', 'message', 'profile', 'story');
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. EXTEND HASHTAGS TABLE (already done in migration 001, idempotent)
-- -----------------------------------------------------------------------------

ALTER TABLE public.hashtags
  ADD COLUMN IF NOT EXISTS age_restriction content_rating DEFAULT 'G',
  ADD COLUMN IF NOT EXISTS category content_type;

-- -----------------------------------------------------------------------------
-- 3. ENHANCE validate_hashtags_allowed_v1 - AGE-AWARE VERSION
-- -----------------------------------------------------------------------------

-- Keep original as-is for backward compatibility (used by triggers that don't have user context)
-- Create new age-aware version for context-aware checks

CREATE OR REPLACE FUNCTION public.validate_hashtags_allowed_v2(
  p_text TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked TEXT[];
  v_user_age_tier age_tier;
  v_user_rating_limit content_rating;
  v_blocked_by_age BOOLEAN := false;
BEGIN
  -- Service-only / internal writes may bypass moderation gating
  IF auth.role() IN ('service_role', 'postgres') THEN
    RETURN;
  END IF;

  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN;
  END IF;

  -- Get user content limits if user_id provided
  IF p_user_id IS NOT NULL THEN
    SELECT age_tier, content_rating_limit INTO v_user_age_tier, v_user_rating_limit
    FROM public.profiles
    WHERE id = p_user_id;
    
    -- If user exists and is teen/child, we apply stricter age-based filtering
    IF FOUND AND v_user_age_tier IN ('teen', 'child_supervised') THEN
      -- For teen/child, validate hashtags against their age tier
      WITH extracted AS (
        SELECT DISTINCT lower(regexp_replace(match, '^#', '')) AS normalized_tag
        FROM regexp_matches(p_text, '#[а-яА-ЯёЁa-zA-Z0-9_]+', 'g') AS match
      )
      SELECT array_agg(COALESCE(h.tag, '#' || e.normalized_tag) ORDER BY COALESCE(h.tag, '#' || e.normalized_tag))
      INTO v_blocked
      FROM extracted e
      JOIN public.hashtags h ON h.normalized_tag = e.normalized_tag
      WHERE 
        -- Hashtag is age-restricted beyond user's tier
        h.age_restriction > v_user_rating_limit
        OR (
          -- Strict mode: also block categories matching risky content
          v_user_age_tier = 'child_supervised' AND h.age_restriction != 'G'
        )
      LIMIT 20;

      IF v_blocked IS NOT NULL AND array_length(v_blocked, 1) > 0 THEN
        RAISE EXCEPTION 'HASHTAG_AGE_RESTRICTED:%', array_to_string(v_blocked, ', ')
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- Also run general hashtag moderation (status != 'normal')
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
$$;

REVOKE ALL ON FUNCTION public.validate_hashtags_allowed_v2(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_hashtags_allowed_v2(TEXT, UUID) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. UPDATE ENFORCEMENT TRIGGER TO USE AGE-AWARE VALIDATION
-- -----------------------------------------------------------------------------

-- Create age-aware trigger wrapper
CREATE OR REPLACE FUNCTION public.enforce_hashtags_on_text_col_v2()
RETURNS TRIGGER AS $$
DECLARE
  v_col TEXT := TG_ARGV[0];
  v_text TEXT;
  v_user_id UUID;
BEGIN
  IF v_col IS NULL OR v_col = '' THEN
    RETURN NEW;
  END IF;

  v_text := (to_jsonb(NEW)->>v_col);
  
  -- Extract user_id from NEW row based on table
  v_user_id := CASE TG_TABLE_NAME
    WHEN 'reels' THEN NEW.author_id
    WHEN 'posts' THEN NEW.user_id
    WHEN 'comments' THEN NEW.user_id
    WHEN 'reel_comments' THEN NEW.user_id
    WHEN 'messages' THEN NEW.sender_id
    WHEN 'channel_messages' THEN NEW.sender_id
    WHEN 'group_chat_messages' THEN NEW.sender_id
    ELSE NULL
  END;
  
  PERFORM public.validate_hashtags_allowed_v2(v_text, v_user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.enforce_hashtags_on_text_col_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_hashtags_on_text_col_v2() TO service_role;

 -- Drop old v1 triggers and create new v2 triggers (migration is idempotent)
 DO $$
 DECLARE
   v_table_name TEXT;
   v_column_name TEXT;
 BEGIN
   -- Map of table -> column to check
   v_table_columns := ARRAY[
     ROW('reels', 'description'),
     ROW('posts', 'content'),
     ROW('comments', 'content'),
     ROW('reel_comments', 'content'),
     ROW('messages', 'content'),
     ROW('channel_messages', 'content'),
     ROW('group_chat_messages', 'content')
   ];
   
   FOREACH v_table_name SLICE 1 IN ARRAY v_table_columns LOOP
     BEGIN
       -- Drop old v1 trigger if exists
       EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_hashtags_%I_v1 ON public.%I', v_table_name, v_table_name);
       -- Drop old v2 trigger if exists (idempotency)
       EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_hashtags_%I_v2 ON public.%I', v_table_name, v_table_name);
       -- Create new v2 trigger
       EXECUTE format(
         'CREATE TRIGGER trg_enforce_hashtags_%I_v2
          BEFORE INSERT OR UPDATE OF %I ON public.%I
          FOR EACH ROW
          EXECUTE FUNCTION public.enforce_hashtags_on_text_col_v2(%L)',
         v_table_name, v_column_name, v_table_name, v_column_name
       );
     EXCEPTION
       WHEN others THEN
         RAISE NOTICE 'Could not create trigger for table %: %', v_table_name, SQLERRM;
     END;
   END LOOP;
 END $$;

-- ============================================================================
-- END HASHTAG AGE INTEGRATION MIGRATION
-- ============================================================================
