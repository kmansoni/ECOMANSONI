-- ============================================================================
-- SAFETY & AGE VERIFICATION SYSTEM
-- Migration: 20260513000000_safety_age_verification.sql
-- ============================================================================
-- Creates age verification infrastructure, parental controls, content rating system
-- Integrates with existing hashtag moderation and reels moderation layers
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------

CREATE TYPE public.age_tier AS ENUM ('adult', 'teen', 'child_supervised');
CREATE TYPE public.content_rating AS ENUM ('G', 'PG', 'PG-13', 'T', 'MA', 'NSFW');
CREATE TYPE public.relationship_type AS ENUM ('mother', 'father', 'guardian', 'other');
CREATE TYPE public.verification_method AS ENUM ('email_otp', 'invite_code', 'document_upload', 'third_party');
CREATE TYPE public.parental_link_status AS ENUM ('pending', 'active', 'revoked', 'expired');
CREATE TYPE public.content_type AS ENUM ('post', 'reel', 'comment', 'message', 'profile', 'story');
CREATE TYPE public.label_source AS ENUM ('ai', 'moderator', 'auto_hashtag', 'user_report', 'system');
CREATE TYPE public.age_verification_type AS ENUM ('initial', 'recheck', 'parental_override', 'fraud_review');
CREATE TYPE public.verification_result AS ENUM ('success', 'fail', 'needs_review', 'fraud_suspected');

-- -----------------------------------------------------------------------------
-- 2. EXTEND PROFILES TABLE
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS age_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS age_tier age_tier DEFAULT 'adult',
  ADD COLUMN IF NOT EXISTS parental_guardian_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS teen_mode_enforced_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_teen_mode_locked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS content_rating_limit content_rating DEFAULT 'T',
  ADD COLUMN IF NOT EXISTS strict_limited_content BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS restricted_categories JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS safety_mode_active BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_age_check_ip INET,
  ADD COLUMN IF NOT EXISTS age_verification_attempts INTEGER DEFAULT 0;

-- Backfill age_tier from existing account_type logic
UPDATE public.profiles
SET age_tier = CASE
  WHEN account_type = 'creator' THEN 'adult'
  WHEN account_type = 'business' THEN 'adult'
  ELSE 'adult' -- legacy accounts default to adult until verified
END
WHERE age_tier IS NULL;

-- Add check: date_of_birth must be in the past
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_date_of_birth_past CHECK (date_of_birth IS NULL OR date_of_birth < CURRENT_DATE);

-- -----------------------------------------------------------------------------
-- 3. PARENTAL LINKS TABLE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.parental_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teen_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  relationship relationship_type NOT NULL DEFAULT 'parent',
  verification_method verification_method NOT NULL DEFAULT 'invite_code',
  invite_code VARCHAR(32) UNIQUE,
  invite_code_expires_at TIMESTAMPTZ,
  status parental_link_status NOT NULL DEFAULT 'pending',
  teen_acceptance_confirmed_at TIMESTAMPTZ,
  parent_verified_at TIMESTAMPTZ,
  settings_sync_enabled BOOLEAN DEFAULT true,
  daily_usage_limit_minutes INTEGER DEFAULT 0, -- 0 = unlimited
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(teen_user_id, parent_user_id),
  CONSTRAINT chk_invite_code_required CHECK (
    (status IN ('pending', 'active') AND invite_code IS NOT NULL) OR
    (status NOT IN ('pending', 'active'))
  )
);

CREATE INDEX IF NOT EXISTS idx_parental_links_teen ON public.parental_links(teen_user_id, status);
CREATE INDEX IF NOT EXISTS idx_parental_links_parent ON public.parental_links(parent_user_id, status);
CREATE INDEX IF NOT EXISTS idx_parental_links_invite_code ON public.parental_links(invite_code) WHERE status = 'pending';

-- -----------------------------------------------------------------------------
-- 4. CONTENT RATING LABELS TABLE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.content_rating_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type content_type NOT NULL,
  content_id UUID NOT NULL,
  rating content_rating NOT NULL DEFAULT 'PG',
  violence_score SMALLINT DEFAULT 0 CHECK (violence_score BETWEEN 0 AND 100),
  language_score SMALLINT DEFAULT 0 CHECK (language_score BETWEEN 0 AND 100),
  substance_score SMALLINT DEFAULT 0 CHECK (substance_score BETWEEN 0 AND 100),
  sexual_content_score SMALLINT DEFAULT 0 CHECK (sexual_content_score BETWEEN 0 AND 100),
  risky_stunts_score SMALLINT DEFAULT 0 CHECK (risky_stunts_score BETWEEN 0 AND 100),
  ai_confidence NUMERIC(3,2) DEFAULT 0.00 CHECK (ai_confidence BETWEEN 0.00 AND 1.00),
  labeled_by label_source NOT NULL DEFAULT 'ai',
  model_version VARCHAR(32),
  labeled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_rating_labels_content ON public.content_rating_labels(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_content_rating_labels_rating ON public.content_rating_labels(rating, content_type);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_content_rating_label ON public.content_rating_labels(content_type, content_id);

-- -----------------------------------------------------------------------------
-- 5. AGE VERIFICATION LOGS TABLE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.age_verification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  verification_type age_verification_type NOT NULL DEFAULT 'initial',
  method verification_method NOT NULL,
  ip_address INET NOT NULL,
  user_agent TEXT,
  result verification_result NOT NULL,
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  reviewed_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_age_verification_logs_user ON public.age_verification_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_age_verification_logs_ip ON public.age_verification_logs(ip_address, created_at DESC);

-- -----------------------------------------------------------------------------
-- 6. UPDATE CONTENT TABLES
-- -----------------------------------------------------------------------------

-- Posts: add is_age_restricted flag
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_age_restricted BOOLEAN DEFAULT false;

-- Reels: add is_age_restricted flag
ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS is_age_restricted BOOLEAN DEFAULT false;

-- Comments: add is_age_restricted flag
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS is_age_restricted BOOLEAN DEFAULT false;

-- -----------------------------------------------------------------------------
-- 7. EXTEND HASHTAGS TABLE
-- -----------------------------------------------------------------------------

ALTER TABLE public.hashtags
  ADD COLUMN IF NOT EXISTS age_restriction content_rating DEFAULT 'G',
  ADD COLUMN IF NOT EXISTS category content_type;

-- -----------------------------------------------------------------------------
-- 8. UPDATED_AT TRIGGERS
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_parental_links_updated_at BEFORE UPDATE ON public.parental_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 9. RLS POLICIES
-- -----------------------------------------------------------------------------

-- Enable RLS on new tables
ALTER TABLE public.parental_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_rating_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.age_verification_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: age fields
-- Only user can read own age fields; admins via service_role
CREATE POLICY "Users read own age data" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
  );

CREATE POLICY "Users update own DOB" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = id AND
    (
      -- Adult can update anytime
      (age_tier = 'adult' AND date_of_birth IS NOT NULL) OR
      -- Teen/child can only update via verification flow (application-level guard)
      (age_tier IN ('teen', 'child_supervised') AND false) -- intentionally denied at DB level
    )
  );

-- Parental links: teen + parent can view
CREATE POLICY "Parental partners view link" ON public.parental_links
  FOR SELECT USING (
    auth.uid() = teen_user_id OR auth.uid() = parent_user_id
  );

CREATE POLICY "Teens can accept invites" ON public.parental_links
  FOR INSERT WITH CHECK (
    auth.uid() = teen_user_id AND status = 'pending'
  );

CREATE POLICY "Parents can create invites" ON public.parental_links
  FOR INSERT WITH CHECK (
    auth.uid() = parent_user_id AND status = 'pending'
  );

CREATE POLICY "Parents can update own links" ON public.parental_links
  FOR UPDATE USING (
    auth.uid() = parent_user_id
  );

CREATE POLICY "Teens can revoke" ON public.parental_links
  FOR UPDATE USING (
    auth.uid() = teen_user_id AND status IN ('active', 'pending')
  );

-- Content rating labels: read to filter feed
CREATE POLICY "All authenticated read ratings" ON public.content_rating_labels
  FOR SELECT USING (
    auth.role() IN ('authenticated', 'anon', 'service_role')
  );

CREATE POLICY "Service only write ratings" ON public.content_rating_labels
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
  );

-- Age verification logs: user can read own; admins can read all
CREATE POLICY "Users read own verification logs" ON public.age_verification_logs
  FOR SELECT USING (
    auth.uid() = user_id
  );

CREATE POLICY "Service write logs" ON public.age_verification_logs
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
  );

-- -----------------------------------------------------------------------------
-- 10. HELPER FUNCTIONS
-- -----------------------------------------------------------------------------

-- Helper: calculate age from DOB
CREATE OR REPLACE FUNCTION public.calculate_age(p_dob DATE)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT DATE_PART('year', AGE(p_dob));
$$;

-- Helper: get user's effective rating limit
CREATE OR REPLACE FUNCTION public.get_user_rating_limit(p_user_id UUID)
RETURNS content_rating
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT content_rating_limit
      FROM public.profiles
      WHERE id = p_user_id
    ),
    'G'::content_rating
  ) AS limit_rating;
$$;

-- -----------------------------------------------------------------------------
-- 11. RATE LIMITING TABLE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.age_verification_rate_limits (
  ip_address INET PRIMARY KEY,
  attempts INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT now(),
  blocked_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_age_verification_rate_limits_ip ON public.age_verification_rate_limits(ip_address);

-- RLS: service_role only
ALTER TABLE public.age_verification_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON public.age_verification_rate_limits
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- END OF MIGRATION (RPC functions defined in separate migration file)
-- ============================================================================
