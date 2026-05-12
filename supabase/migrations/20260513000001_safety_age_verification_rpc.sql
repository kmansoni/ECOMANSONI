-- ============================================================================
-- SAFETY & AGE VERIFICATION RPC FUNCTIONS
-- Migration: 20260513000001_safety_age_verification_rpc.sql
-- ============================================================================

-- Ensure enums exist (created in previous migration, but guard for atomic deploy)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'age_tier') THEN
    CREATE TYPE public.age_tier AS ENUM ('adult', 'teen', 'child_supervised');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_rating') THEN
    CREATE TYPE public.content_rating AS ENUM ('G', 'PG', 'PG-13', 'T', 'MA', 'NSFW');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'relationship_type') THEN
    CREATE TYPE public.relationship_type AS ENUM ('mother', 'father', 'guardian', 'other');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_method') THEN
    CREATE TYPE public.verification_method AS ENUM ('email_otp', 'invite_code', 'document_upload', 'third_party');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'parental_link_status') THEN
    CREATE TYPE public.parental_link_status AS ENUM ('pending', 'active', 'revoked', 'expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_type') THEN
    CREATE TYPE public.content_type AS ENUM ('post', 'reel', 'comment', 'message', 'profile', 'story');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'label_source') THEN
    CREATE TYPE public.label_source AS ENUM ('ai', 'moderator', 'auto_hashtag', 'user_report', 'system');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'age_verification_type') THEN
    CREATE TYPE public.age_verification_type AS ENUM ('initial', 'recheck', 'parental_override', 'fraud_review');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_result') THEN
    CREATE TYPE public.verification_result AS ENUM ('success', 'fail', 'needs_review', 'fraud_suspected');
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. RATE LIMITING FUNCTION
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_age_verification_rate_limit(
  p_ip_address INET,
  p_max_attempts INTEGER DEFAULT 5,
  p_window_hours INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record RECORD;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := now() - make_interval(hours => p_window_hours);
  
  SELECT * INTO v_record
  FROM public.age_verification_rate_limits
  WHERE ip_address = p_ip_address
    AND window_start > v_window_start;
  
  IF NOT FOUND THEN
    INSERT INTO public.age_verification_rate_limits (ip_address, attempts, window_start)
    VALUES (p_ip_address, 1, now());
    RETURN true;
  END IF;
  
  IF v_record.attempts >= p_max_attempts THEN
    UPDATE public.age_verification_rate_limits
    SET blocked_until = now() + make_interval(hours => 24)
    WHERE ip_address = p_ip_address;
    RETURN false;
  END IF;
  
  UPDATE public.age_verification_rate_limits
  SET attempts = attempts + 1
  WHERE ip_address = p_ip_address;
  
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_age_verification_rate_limit(INET, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_age_verification_rate_limit(INET, INTEGER, INTEGER) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. VERIFY AGE AND ENFORCE MODE
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_age_and_enforce_mode(
  p_user_id UUID,
  p_date_of_birth DATE,
  p_ip_address INET DEFAULT NULL,
  p_method verification_method DEFAULT 'self_report'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_age INTEGER;
  v_age_tier age_tier;
  v_content_limit content_rating;
  v_strict_filter BOOLEAN DEFAULT false;
  v_profile RECORD;
  v_result jsonb;
  v_rate_limited BOOLEAN;
BEGIN
  -- Rate limit check (for anon/unauthenticated or during signup)
  IF p_ip_address IS NOT NULL THEN
    v_rate_limited := public.check_age_verification_rate_limit(p_ip_address);
    IF NOT v_rate_limited THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'rate_limit_exceeded',
        'retry_after', '24h'
      );
    END IF;
  END IF;
  
  -- Calculate age
  IF p_date_of_birth IS NULL OR p_date_of_birth >= CURRENT_DATE THEN
    INSERT INTO public.age_verification_logs (
      user_id, verification_type, method, ip_address, result, failure_reason
    ) VALUES (
      p_user_id, 'initial', p_method, p_ip_address, 'fail', 'Invalid date of birth'
    );
    RETURN jsonb_build_object('success', false, 'error', 'invalid_dob');
  END IF;
  
  v_age := public.calculate_age(p_date_of_birth);
  
  -- Determine age tier
  IF v_age >= 18 THEN
    v_age_tier := 'adult';
    v_content_limit := 'T'::content_rating;
  ELSIF v_age >= 13 THEN
    v_age_tier := 'teen';
    v_content_limit := 'PG-13'::content_rating;
    v_strict_filter := false; -- default, can be set by parent
  ELSE
    v_age_tier := 'child_supervised';
    v_content_limit := 'G'::content_rating;
    v_strict_filter := true;
  END IF;
  
  -- Update profile
  UPDATE public.profiles
  SET
    date_of_birth = p_date_of_birth,
    age_tier = v_age_tier,
    age_verified_at = now(),
    content_rating_limit = v_content_limit,
    strict_limited_content = v_strict_filter,
    last_age_check_ip = p_ip_address,
    age_verification_attempts = profiles.age_verification_attempts + 1,
    updated_at = now()
  WHERE id = p_user_id
  RETURNING to_jsonb(profiles) INTO v_result;
  
  -- Log
  INSERT INTO public.age_verification_logs (
    user_id, verification_type, method, ip_address, result
  ) VALUES (
    p_user_id, 'initial', p_method, p_ip_address, 'success'
  );
  
  -- If teen/child and parent already linked, enforce parental override
  IF v_age_tier IN ('teen', 'child_supervised') THEN
    UPDATE public.profiles p
    SET 
      teen_mode_enforced_by = COALESCE(p.parental_guardian_id, p.teen_mode_enforced_by),
      strict_limited_content = COALESCE(
        (SELECT strict_limited_content FROM public.profiles WHERE id = p.parental_guardian_id),
        false
      )
    WHERE id = p_user_id AND parental_guardian_id IS NOT NULL;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'age', v_age,
    'age_tier', v_age_tier,
    'content_rating_limit', v_content_limit,
    'strict_mode', v_strict_filter,
    'profile', v_result
  );
EXCEPTION
  WHEN others THEN
    INSERT INTO public.age_verification_logs (
      user_id, verification_type, method, ip_address, result, failure_reason
    ) VALUES (
      p_user_id, 'initial', p_method, p_ip_address, 'fail', SQLERRM
    );
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_age_and_enforce_mode(UUID, DATE, INET, verification_method) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_age_and_enforce_mode(UUID, DATE, INET, verification_method) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. CREATE PARENTAL INVITE
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_parental_invite(
  p_teen_user_id UUID,
  p_parent_user_id UUID,
  p_relationship relationship_type DEFAULT 'parent'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teen profiles%ROWTYPE;
  v_parent profiles%ROWTYPE;
  v_invite_code VARCHAR(32);
  v_link_id UUID;
BEGIN
  -- Validate teen is 13-17
  SELECT * INTO v_teen FROM public.profiles WHERE id = p_teen_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'teen_user_not_found');
  END IF;
  
  -- Teen must be 13-17
  IF v_teen.date_of_birth IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'teen_age_not_verified');
  END IF;
  
  IF public.calculate_age(v_teen.date_of_birth) >= 18 THEN
    RETURN jsonb_build_object('success', false, 'error', 'teen_must_be_under_18');
  END IF;
  
  -- Validate parent is 18+
  SELECT * INTO v_parent FROM public.profiles WHERE id = p_parent_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'parent_user_not_found');
  END IF;
  
  IF v_parent.date_of_birth IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'parent_age_not_verified');
  END IF;
  
  IF public.calculate_age(v_parent.date_of_birth) < 18 THEN
    RETURN jsonb_build_object('success', false, 'error', 'parent_must_be_18plus');
  END IF;
  
  -- Generate unique invite code
  v_invite_code := encode(gen_random_bytes(16), 'hex');
  
  -- Expires in 7 days
  INSERT INTO public.parental_links (
    teen_user_id, parent_user_id, relationship,
    invite_code, invite_code_expires_at, status
  ) VALUES (
    p_teen_user_id, p_parent_user_id, p_relationship,
    v_invite_code, now() + INTERVAL '7 days', 'pending'
  )
  RETURNING id INTO v_link_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'link_id', v_link_id,
    'invite_code', v_invite_code,
    'expires_at', (now() + INTERVAL '7 days')::TEXT
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_parental_invite(UUID, UUID, relationship_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_parental_invite(UUID, UUID, relationship_type) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. ACCEPT PARENTAL INVITE
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_parental_invite(
  p_invite_code VARCHAR,
  p_teen_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link parental_links%ROWTYPE;
  v_teen profiles%ROWTYPE;
BEGIN
  -- Find pending invite
  SELECT * INTO v_link
  FROM public.parental_links
  WHERE invite_code = p_invite_code
    AND status = 'pending'
    AND invite_code_expires_at > now();
    
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired_invite');
  END IF;
  
  -- Ensure teen_user_id matches
  IF v_link.teen_user_id != p_teen_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'invite_not_for_this_user');
  END IF;
  
  -- Update link to active, set teen acceptance
  UPDATE public.parental_links
  SET
    status = 'active',
    teen_acceptance_confirmed_at = now()
  WHERE id = v_link.id;
  
  -- Link profiles
  UPDATE public.profiles p
  SET
    parental_guardian_id = v_link.parent_user_id,
    teen_mode_enforced_by = v_link.parent_user_id,
    teen_mode_locked = true
  WHERE id = p_teen_user_id;
  
  -- Notify parent via realtime (optional)
  -- Could push to notification queue here
  
  RETURN jsonb_build_object('success', true, 'parent_id', v_link.parent_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_parental_invite(VARCHAR, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_parental_invite(VARCHAR, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. PARENTAL OVERRIDE CONTENT LIMIT
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.parent_override_content_limit(
  p_teen_id UUID,
  p_parent_id UUID,
  p_new_rating content_rating
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link parental_links%ROWTYPE;
  v_teen profiles%ROWTYPE;
BEGIN
  -- Check active parental link
  SELECT * INTO v_link
  FROM public.parental_links
  WHERE teen_user_id = p_teen_id
    AND parent_user_id = p_parent_id
    AND status = 'active';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_parental_link');
  END IF;
  
  -- Update teen's content rating limit
  UPDATE public.profiles
  SET
    content_rating_limit = p_new_rating,
    teen_mode_enforced_by = p_parent_id,
    updated_at = now()
  WHERE id = p_teen_id;
  
  -- Log override
  INSERT INTO public.age_verification_logs (
    user_id, verification_type, method, result, metadata
  ) VALUES (
    p_teen_id, 'parental_override', 'parental_override', 'success',
    jsonb_build_object('parent_id', p_parent_id, 'new_rating', p_new_rating)
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.parent_override_content_limit(UUID, UUID, content_rating) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_override_content_limit(UUID, UUID, content_rating) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. GET FILTERED FEED (AGE-AWARE)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_filtered_feed_for_user(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  author_id UUID,
  video_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  music_title TEXT,
  likes_count INTEGER,
  comments_count INTEGER,
  views_count INTEGER,
  saves_count INTEGER,
  reposts_count INTEGER,
  shares_count INTEGER,
  created_at TIMESTAMPTZ,
  final_score NUMERIC,
  recommendation_reason TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_user profiles%ROWTYPE;
  v_max_rating content_rating;
  v_strict_filter BOOLEAN DEFAULT false;
BEGIN
  SELECT * INTO v_user FROM public.profiles WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Determine rating limit
  v_max_rating := COALESCE(v_user.content_rating_limit, 'G'::content_rating);
  
  -- Teen/child mode: apply strict filter if parent enabled OR teen account
  IF v_user.age_tier IN ('teen', 'child_supervised') THEN
    v_strict_filter := COALESCE(v_user.strict_limited_content, false);
    
    -- Override from parent
    IF v_user.parental_guardian_id IS NOT NULL THEN
      SELECT strict_limited_content INTO v_strict_filter
      FROM public.profiles
      WHERE id = v_user.parental_guardian_id;
    END IF;
  END IF;
  
  -- Check age verification freshness (optional: re-verify if >90 days)
  IF v_user.age_tier IN ('teen', 'child_supervised') THEN
    IF v_user.age_verified_at IS NULL OR v_user.age_verified_at < (now() - INTERVAL '90 days') THEN
      -- Could raise a notice or trigger re-verification workflow
      RAISE NOTICE 'Age verification expired for user %', p_user_id;
    END IF;
  END IF;
  
  RETURN QUERY
  SELECT r.* FROM public.reels r
  LEFT JOIN public.content_rating_labels crl ON
    crl.content_type = 'reel' AND crl.content_id = r.id
  WHERE
    -- Base condition: rating <= user's limit
    COALESCE(crl.rating, 'G'::content_rating) <= v_max_rating
    
    -- Apply strict filter if enabled
    AND (
      NOT v_strict_filter OR (
        COALESCE(crl.rating, 'G'::content_rating) <= 'PG'::content_rating
        AND r.is_age_restricted = false
      )
    )
    
    -- Exclude high-risk content in strict mode
    AND (
      NOT v_strict_filter OR (
        COALESCE(crl.language_score, 0) < 50 AND
        COALESCE(crl.substance_score, 0) < 30 AND
        COALESCE(crl.sexual_content_score,0) < 30 AND
        COALESCE(crl.risky_stunts_score, 0) < 50
      )
    )
    
    -- Exclude age-restricted flagged reels
    AND r.is_age_restricted = false
    
    -- Exclude deleted/hidden
    AND r.is_hidden = false
    AND r.is_deleted = false
    
  ORDER BY r.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_filtered_feed_for_user(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_filtered_feed_for_user(UUID, INTEGER, INTEGER) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. PERIODIC AGE CHECK TRIGGER (to be called by BG job)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.flag_stale_age_verification()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log teens whose verification expired (>90 days)
  RAISE NOTICE 'Age re-check due for users with stale verification';
  -- Actual notification implementation in separate job
END;
$$;

REVOKE ALL ON FUNCTION public.flag_stale_age_verification() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.flag_stale_age_verification() TO service_role;

-- ============================================================================
-- END RPC MIGRATION
-- ============================================================================
