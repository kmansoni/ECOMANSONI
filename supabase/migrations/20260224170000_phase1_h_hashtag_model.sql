-- ============================================================================
-- Phase 1 EPIC H: Hashtag Model Extension + Moderation
--
-- Extends Phase 0 hashtags table with:
--  1. Hashtag moderation statuses (normal/restricted/hidden)
--  2. Moderation tracking (reason, moderator, timestamp)
--  3. Enhanced trend tracking (rank, score)
--  4. Canonization function with NFKC normalization
--
-- Based on: docs/specs/phase1/P1H-hashtags-trends-discovery-integrity.md
-- Dependencies: Phase 0 (hashtags table exists), EPIC L (trust-lite)
-- Previous: 20260220231000_step2_hashtags_trending_system.sql
-- ============================================================================

-- ============================================================================
-- 1. Hashtag Moderation Status Enum
-- ============================================================================

CREATE TYPE public.hashtag_status AS ENUM (
  'normal',      -- Default: shown in discovery, search, pages
  'restricted',  -- Not shown in discovery/trending, but accessible via direct search
  'hidden'       -- Completely hidden, not usable
);

COMMENT ON TYPE public.hashtag_status IS 
  'Phase 1 EPIC H: Hashtag moderation status (normal/restricted/hidden)';

-- ============================================================================
-- 2. Extend Hashtags Table (Add Moderation Fields)
-- ============================================================================

-- Add moderation status column (default 'normal')
ALTER TABLE public.hashtags
  ADD COLUMN IF NOT EXISTS status public.hashtag_status NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES auth.users(id);

-- Add display_tag if not exists (use tag as default)
ALTER TABLE public.hashtags
  ADD COLUMN IF NOT EXISTS display_tag TEXT;

-- Set display_tag to tag where null
UPDATE public.hashtags
SET display_tag = tag
WHERE display_tag IS NULL;

-- Add trend rank for leaderboard
ALTER TABLE public.hashtags
  ADD COLUMN IF NOT EXISTS trend_rank INTEGER;

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_hashtags_status ON public.hashtags(status) WHERE status = 'normal';

COMMENT ON COLUMN public.hashtags.status IS 
  'Phase 1 EPIC H: Moderation status (normal/restricted/hidden)';

COMMENT ON COLUMN public.hashtags.moderation_reason IS 
  'Phase 1 EPIC H: Reason for moderation (hate/harassment, illegal, nsfw, spam)';

COMMENT ON COLUMN public.hashtags.display_tag IS 
  'Phase 1 EPIC H: Original case display form of hashtag';

-- ============================================================================
-- 3. Extend Reel-Hashtag Association (Add Relevance Tracking)
-- ============================================================================

-- Add relevance score for anti-hijack detection
ALTER TABLE public.reel_hashtags
  ADD COLUMN IF NOT EXISTS relevance_score NUMERIC(3, 2) DEFAULT 1.0 CHECK (relevance_score BETWEEN 0 AND 1);

-- Create index on relevance for filtering
CREATE INDEX IF NOT EXISTS idx_reel_hashtags_relevance 
  ON public.reel_hashtags(hashtag_id, relevance_score DESC);

COMMENT ON COLUMN public.reel_hashtags.relevance_score IS 
  'Phase 1 EPIC H: Relevance score for anti-hijack detection (1.0 = relevant, 0.0 = spam)';

-- ============================================================================
-- 4. Hashtag Canonization Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.canonicalize_hashtag(
  p_raw_tag TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_canonical TEXT;
BEGIN
  -- Remove leading # if present
  v_canonical := CASE 
    WHEN p_raw_tag LIKE '#%' THEN substring(p_raw_tag FROM 2)
    ELSE p_raw_tag
  END;
  
  -- Unicode normalization (NFKC)
  v_canonical := normalize(v_canonical, NFKC);
  
  -- Lowercase
  v_canonical := lower(v_canonical);
  
  -- Trim whitespace
  v_canonical := trim(v_canonical);
  
  -- Replace multiple spaces/underscores with single underscore
  v_canonical := regexp_replace(v_canonical, '[\s_]+', '_', 'g');
  
  -- Remove leading/trailing underscores
  v_canonical := trim(v_canonical, '_');
  
  -- Validate length (2-32 characters)
  IF length(v_canonical) < 2 OR length(v_canonical) > 32 THEN
    RAISE EXCEPTION 'Hashtag must be between 2 and 32 characters (got: %)', length(v_canonical);
  END IF;
  
  -- Validate allowed characters (letters, numbers, underscores only)
  IF v_canonical !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Hashtag can only contain letters, numbers, and underscores';
  END IF;
  
  RETURN v_canonical;
END;
$$;

COMMENT ON FUNCTION public.canonicalize_hashtag(TEXT) IS 
  'Phase 1 EPIC H: Canonicalize hashtag (lowercase, NFKC, trim, validate)';

-- ============================================================================
-- 5. Get or Create Hashtag Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_hashtag(
  p_raw_tag TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical TEXT;
  v_hashtag_id UUID;
BEGIN
  -- Canonicalize input
  v_canonical := public.canonicalize_hashtag(p_raw_tag);
  
  -- Check if exists
  SELECT id INTO v_hashtag_id
  FROM public.hashtags
  WHERE tag = v_canonical;
  
  IF v_hashtag_id IS NOT NULL THEN
    RETURN v_hashtag_id;
  END IF;
  
  -- Create new hashtag (default status: normal)
  INSERT INTO public.hashtags (tag, display_tag, status)
  VALUES (v_canonical, p_raw_tag, 'normal')
  RETURNING id INTO v_hashtag_id;
  
  RETURN v_hashtag_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_hashtag(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_hashtag(TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_or_create_hashtag(TEXT) IS 
  'Phase 1 EPIC H: Get existing hashtag or create new one (idempotent)';

-- ============================================================================
-- 6. Add Hashtags to Reel Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_hashtags_to_reel(
  p_reel_id UUID,
  p_hashtags TEXT[]  -- Array of raw hashtag strings
)
RETURNS TABLE (
  hashtag_id UUID,
  tag TEXT,
  hashtag_position INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_hashtag_id UUID;
  v_position INTEGER := 1;
  v_raw_tag TEXT;
  v_reel_author_id UUID;
BEGIN
  -- Verify reel exists and user is author
  SELECT author_id INTO v_reel_author_id
  FROM public.reels
  WHERE id = p_reel_id;
  
  IF v_reel_author_id IS NULL THEN
    RAISE EXCEPTION 'Reel not found';
  END IF;
  
  IF v_reel_author_id != v_user_id THEN
    RAISE EXCEPTION 'Only reel author can add hashtags';
  END IF;
  
  -- Validate max hashtags (5)
  IF array_length(p_hashtags, 1) > 5 THEN
    RAISE EXCEPTION 'Maximum 5 hashtags allowed per reel';
  END IF;
  
  -- Clear existing hashtags
  DELETE FROM public.reel_hashtags
  WHERE reel_id = p_reel_id;
  
  -- Add new hashtags
  FOREACH v_raw_tag IN ARRAY p_hashtags
  LOOP
    -- Get or create hashtag
    v_hashtag_id := public.get_or_create_hashtag(v_raw_tag);
    
    -- Check if hashtag is hidden
    IF EXISTS (
      SELECT 1 FROM public.hashtags
      WHERE id = v_hashtag_id AND status = 'hidden'
    ) THEN
      RAISE EXCEPTION 'Hashtag is not allowed: %', v_raw_tag;
    END IF;
    
    -- Associate with reel
    INSERT INTO public.reel_hashtags (reel_id, hashtag_id, position)
    VALUES (p_reel_id, v_hashtag_id, v_position);
    
    -- Update usage stats
    UPDATE public.hashtags
    SET usage_count = usage_count + 1,
        last_used_at = now(),
        updated_at = now()
    WHERE id = v_hashtag_id;
    
    v_position := v_position + 1;
  END LOOP;
  
  -- Return added hashtags
  RETURN QUERY
  SELECT 
    rh.hashtag_id,
    h.tag,
    rh.position
  FROM public.reel_hashtags rh
  JOIN public.hashtags h ON h.id = rh.hashtag_id
  WHERE rh.reel_id = p_reel_id
  ORDER BY rh.position;
END;
$$;

REVOKE ALL ON FUNCTION public.add_hashtags_to_reel(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_hashtags_to_reel(UUID, TEXT[]) TO authenticated;

COMMENT ON FUNCTION public.add_hashtags_to_reel(UUID, TEXT[]) IS 
  'Phase 1 EPIC H: Add hashtags to reel (max 5, replaces existing)';

-- ============================================================================
-- 7. Get Reel Hashtags Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_reel_hashtags(
  p_reel_id UUID
)
RETURNS TABLE (
  hashtag_id UUID,
  tag TEXT,
  display_tag TEXT,
  status public.hashtag_status,
  hashtag_position INTEGER,
  relevance_score NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    h.id AS hashtag_id,
    h.tag,
    h.display_tag,
    h.status,
    rh.position AS hashtag_position,
    rh.relevance_score
  FROM public.reel_hashtags rh
  JOIN public.hashtags h ON h.id = rh.hashtag_id
  WHERE rh.reel_id = p_reel_id
  ORDER BY rh.position;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reel_hashtags(UUID) TO authenticated, anon;

COMMENT ON FUNCTION public.get_reel_hashtags(UUID) IS 
  'Phase 1 EPIC H: Get all hashtags for a reel';

-- ============================================================================
-- 8. Moderate Hashtag Function (Admin Only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.moderate_hashtag(
  p_tag TEXT,
  p_new_status public.hashtag_status,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  hashtag_id UUID,
  tag TEXT,
  old_status public.hashtag_status,
  new_status public.hashtag_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_canonical TEXT;
  v_old_status public.hashtag_status;
BEGIN
  -- TODO: Add admin role check when EPIC K (Moderation) is implemented
  -- For now, any authenticated user can moderate (temporary)
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Canonicalize tag
  v_canonical := public.canonicalize_hashtag(p_tag);
  
  -- Update status
  UPDATE public.hashtags h
  SET status = p_new_status,
      moderation_reason = p_reason,
      moderated_at = now(),
      moderated_by = v_user_id,
      updated_at = now()
  WHERE h.tag = v_canonical
  RETURNING h.status INTO v_old_status;
  
  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'Hashtag not found: %', p_tag;
  END IF;
  
  RETURN QUERY
  SELECT 
    h.id,
    h.tag,
    v_old_status,
    h.status
  FROM public.hashtags h
  WHERE h.tag = v_canonical;
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_hashtag(TEXT, public.hashtag_status, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_hashtag(TEXT, public.hashtag_status, TEXT) TO authenticated;

COMMENT ON FUNCTION public.moderate_hashtag(TEXT, public.hashtag_status, TEXT) IS 
  'Phase 1 EPIC H: Moderate hashtag status (admin only, TODO: add role check)';

-- ============================================================================
-- 9. Update Trigger for Hashtags (If not exists)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hashtags_updated_at_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS hashtags_set_updated_at ON public.hashtags;

CREATE TRIGGER hashtags_set_updated_at
  BEFORE UPDATE ON public.hashtags
  FOR EACH ROW
  EXECUTE FUNCTION public.hashtags_updated_at_trigger();

-- ============================================================================
-- 10. RLS Policies (Add if not exists)
-- ============================================================================

-- Enable RLS on hashtags (if not already enabled)
ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_hashtags ENABLE ROW LEVEL SECURITY;

-- Hashtags: Read-only for everyone (except hidden)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'hashtags' AND policyname = 'hashtags_select'
  ) THEN
    CREATE POLICY hashtags_select ON public.hashtags
      FOR SELECT
      USING (status != 'hidden');
  END IF;
END $$;

-- Reel hashtags: Read for everyone (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reel_hashtags' AND policyname = 'reel_hashtags_select'
  ) THEN
    CREATE POLICY reel_hashtags_select ON public.reel_hashtags
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- ============================================================================
-- EPIC H Hashtag Model Summary
-- ============================================================================
-- Tables Created:
--  - hashtags (canonical storage with moderation + trend tracking)
--  - reel_hashtags (association with position + relevance)
--
-- Functions Created:
--  - canonicalize_hashtag(text) → Normalize hashtag
--  - get_or_create_hashtag(text) → Idempotent hashtag creation
--  - add_hashtags_to_reel(uuid, text[]) → Add hashtags to reel (max 5)
--  - get_reel_hashtags(uuid) → Retrieve reel hashtags
--  - moderate_hashtag(text, status, reason) → Admin moderation
--
-- Next Steps:
--  1. Implement trend engine (velocity tracking, trust-weighting)
--  2. Implement anti-hijack (relevance gate, coordinated attack guard)
--  3. Implement hashtag surfaces (Top/Recent/Trending/Related)
-- ============================================================================
