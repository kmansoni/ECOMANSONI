-- ============================================================
-- Phase 1 EPIC N: Live Beta — Database Schema
-- ============================================================
-- Date: 2026-02-24
-- Purpose: Live streaming infrastructure (sessions, viewers, chat, moderation)
-- ALLOW_DESTRUCTIVE_MIGRATION

-- ============================================================
-- PART 1: Core Tables
-- ============================================================

-- Live streaming sessions
-- If table already exists, DROP and recreate with new schema
DROP TABLE IF EXISTS public.live_sessions CASCADE;

CREATE TABLE public.live_sessions (
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Session metadata
  title TEXT NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 50),
  description TEXT CHECK (char_length(description) <= 200),
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('music', 'gaming', 'chat', 'performance', 'other')),
  thumbnail_url TEXT,
  
  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'live', 'ended', 'restricted')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  
  -- Access control
  is_public BOOLEAN NOT NULL DEFAULT true,
  is_followers_only BOOLEAN NOT NULL DEFAULT false,
  
  -- Moderation integration
  moderation_status TEXT NOT NULL DEFAULT 'green' CHECK (moderation_status IN ('green', 'borderline', 'restriction_pending', 'red')),
  moderation_decision TEXT CHECK (moderation_decision IN ('allow', 'restrict', 'needs_review', 'block', NULL)),
  moderation_restricted_at TIMESTAMPTZ,
  
  -- Metrics (updated in real-time by backend)
  viewer_count_current INT DEFAULT 0,
  viewer_count_peak INT DEFAULT 0,
  report_count INT DEFAULT 0,
  message_count INT DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_sessions_creator_id ON live_sessions(creator_id);
CREATE INDEX idx_live_sessions_status ON live_sessions(status);
CREATE INDEX idx_live_sessions_moderation_status ON live_sessions(moderation_status);
CREATE INDEX idx_live_sessions_created_at ON live_sessions(created_at DESC);
CREATE INDEX idx_live_sessions_started_at ON live_sessions(started_at DESC);

-- Live stream viewers (ephemeral, auto-delete 24h after session ends)
DROP TABLE IF EXISTS public.live_viewers CASCADE;

CREATE TABLE public.live_viewers (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Timestamps
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  
  -- Viewer metrics
  watch_duration_seconds INT DEFAULT 0,
  is_reporter BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_viewers_session_id ON live_viewers(session_id);
CREATE INDEX idx_live_viewers_viewer_id ON live_viewers(viewer_id);
CREATE INDEX idx_live_viewers_joined_at ON live_viewers(joined_at DESC);

-- Live chat messages
DROP TABLE IF EXISTS public.live_chat_messages CASCADE;

CREATE TABLE public.live_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Message content
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 200),
  is_creator_message BOOLEAN NOT NULL DEFAULT false,
  is_hidden_by_creator BOOLEAN NOT NULL DEFAULT false,
  
  -- Moderation
  is_auto_hidden BOOLEAN NOT NULL DEFAULT false,
  hide_reason TEXT CHECK (is_auto_hidden = false OR hide_reason IS NOT NULL),
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_chat_messages_session_id ON live_chat_messages(session_id, created_at DESC);
CREATE INDEX idx_live_chat_messages_sender_id ON live_chat_messages(sender_id);
CREATE INDEX idx_live_chat_messages_created_at ON live_chat_messages(created_at DESC);

-- Live stream reports (trust-weighted, same as EPIC K)
DROP TABLE IF EXISTS public.live_stream_reports CASCADE;

CREATE TABLE public.live_stream_reports (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Report metadata
  report_type TEXT NOT NULL CHECK (report_type IN ('sexual', 'violence', 'harassment', 'misinformation', 'spam', 'other')),
  description TEXT CHECK (char_length(description) <= 500),
  
  -- Trust-weighted scoring (from EPIC L)
  reporter_quality_score NUMERIC(3,2) DEFAULT 0.5,
  report_weight NUMERIC(5,2) DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_stream_reports_session_id ON live_stream_reports(session_id);
CREATE INDEX idx_live_stream_reports_reporter_id ON live_stream_reports(reporter_id);
CREATE INDEX idx_live_stream_reports_created_at ON live_stream_reports(created_at DESC);

-- ============================================================
-- PART 2: RPC Functions
-- ============================================================

-- Check if creator is eligible to broadcast
-- Returns: {eligible: boolean, reason: string | null}
CREATE OR REPLACE FUNCTION public.is_eligible_for_live_v1(p_creator_id UUID)
RETURNS TABLE (
  eligible BOOLEAN,
  reason TEXT
) AS $$
DECLARE
  v_follower_count INT;
  v_account_age_days INT;
  v_moderation_decision TEXT;
  v_sessions_today INT;
  v_account_created_at TIMESTAMPTZ;
BEGIN
  -- Check 1: Account age (≥ 7 days)
  SELECT created_at INTO v_account_created_at
  FROM auth.users
  WHERE id = p_creator_id;
  
  IF v_account_created_at IS NULL THEN
    RETURN QUERY SELECT false, 'User not found'::TEXT;
    RETURN;
  END IF;
  
  v_account_age_days := EXTRACT(DAYS FROM now() - v_account_created_at)::INT;
  
  IF v_account_age_days < 7 THEN
    RETURN QUERY SELECT false, 'Account must be at least 7 days old'::TEXT;
    RETURN;
  END IF;
  
  -- Check 2: Follower count (≥ 100)
  SELECT COUNT(*) INTO v_follower_count
  FROM relationships
  WHERE target_id = p_creator_id AND relationship_type = 'follow';
  
  IF v_follower_count < 100 THEN
    RETURN QUERY SELECT false, 'Need at least 100 followers to broadcast'::TEXT;
    RETURN;
  END IF;
  
  -- Check 3: Moderation status (not blocked)
  SELECT moderation_decision INTO v_moderation_decision
  FROM content_moderation_status
  WHERE content_type = 'profile' AND content_id = p_creator_id::TEXT;
  
  IF v_moderation_decision = 'block' THEN
    RETURN QUERY SELECT false, 'Your account is restricted from broadcasting'::TEXT;
    RETURN;
  END IF;
  
  -- Check 4: Daily session limit (max 3 per day)
  SELECT COUNT(*) INTO v_sessions_today
  FROM live_sessions
  WHERE creator_id = p_creator_id
    AND DATE(started_at AT TIME ZONE 'UTC') = DATE(now() AT TIME ZONE 'UTC')
    AND status IN ('live', 'ended', 'preparing');
  
  IF v_sessions_today >= 3 THEN
    RETURN QUERY SELECT false, 'Maximum 3 live sessions per day reached'::TEXT;
    RETURN;
  END IF;
  
  -- All checks passed!
  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create live broadcast session
-- Returns: {session_id: bigint | null, error: string | null}
CREATE OR REPLACE FUNCTION public.broadcast_create_session_v1(
  p_creator_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_category TEXT DEFAULT 'other',
  p_thumbnail_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  session_id BIGINT,
  error TEXT
) AS $$
DECLARE
  v_session_id BIGINT;
  v_eligible BOOLEAN;
  v_reason TEXT;
BEGIN
  -- Step 1: Check eligibility
  SELECT eligible, reason INTO v_eligible, v_reason
  FROM is_eligible_for_live_v1(p_creator_id);
  
  IF NOT v_eligible THEN
    RETURN QUERY SELECT NULL::BIGINT, v_reason;
    RETURN;
  END IF;
  
  -- Step 2: Validate inputs
  IF p_title IS NULL OR char_length(p_title) < 3 OR char_length(p_title) > 50 THEN
    RETURN QUERY SELECT NULL::BIGINT, 'Title must be 3-50 characters'::TEXT;
    RETURN;
  END IF;
  
  IF p_description IS NOT NULL AND char_length(p_description) > 200 THEN
    RETURN QUERY SELECT NULL::BIGINT, 'Description must be max 200 characters'::TEXT;
    RETURN;
  END IF;
  
  -- Step 3: Create session
  INSERT INTO live_sessions (
    creator_id,
    title,
    description,
    category,
    thumbnail_url,
    status,
    started_at
  ) VALUES (
    p_creator_id,
    p_title,
    p_description,
    p_category,
    p_thumbnail_url,
    'live',
    now()
  )
  RETURNING id INTO v_session_id;
  
  RETURN QUERY SELECT v_session_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Report live stream (trust-weighted)
-- Auto-restricts if burst detected (5+ reports in 2 min)
CREATE OR REPLACE FUNCTION public.report_live_stream_v1(
  p_session_id BIGINT,
  p_reporter_id UUID,
  p_report_type TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_reporter_quality NUMERIC(3,2);
  v_report_count INT;
  v_burst_detected BOOLEAN;
  v_creator_id UUID;
BEGIN
  -- Step 1: Get reporter quality score
  SELECT quality_score INTO v_reporter_quality
  FROM moderation_reporter_quality
  WHERE reporter_id = p_reporter_id;
  
  v_reporter_quality := COALESCE(v_reporter_quality, 0.5);
  
  -- Step 2: Insert report with quality weight
  INSERT INTO live_stream_reports (
    session_id,
    reporter_id,
    report_type,
    description,
    reporter_quality_score,
    report_weight
  ) VALUES (
    p_session_id,
    p_reporter_id,
    p_report_type,
    p_description,
    v_reporter_quality,
    1.0 * v_reporter_quality  -- weight = base * quality
  );
  
  -- Step 3: Check for burst (5+ reports in 2 min window)
  SELECT COUNT(*) INTO v_report_count
  FROM live_stream_reports
  WHERE session_id = p_session_id
    AND created_at > now() - interval '2 minutes';
  
  v_burst_detected := v_report_count >= 5;
  
  -- Step 4: Auto-restrict if burst detected
  IF v_burst_detected THEN
    SELECT creator_id INTO v_creator_id
    FROM live_sessions
    WHERE id = p_session_id;
    
    UPDATE live_sessions
    SET
      status = 'restricted',
      moderation_status = 'borderline',
      moderation_restricted_at = now()
    WHERE id = p_session_id;
    
    RETURN QUERY SELECT true, 'This stream has been restricted due to community reports'::TEXT;
  ELSE
    RETURN QUERY SELECT true, 'Thank you for your report'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- End live broadcast session
CREATE OR REPLACE FUNCTION public.broadcast_end_session_v1(p_session_id BIGINT)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
BEGIN
  UPDATE live_sessions
  SET
    status = CASE
      WHEN status = 'restricted' THEN 'restricted'
      WHEN status = 'live' THEN 'ended'
      ELSE status
    END,
    ended_at = CASE
      WHEN status IN ('live', 'restricted') THEN now()
      ELSE ended_at
    END,
    updated_at = now()
  WHERE id = p_session_id;
  
  RETURN QUERY SELECT true, 'Live session ended'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get active live sessions (for discovery feed)
-- Returns limited set: id, creator_id, title, thumbnail_url, viewer_count_current
CREATE OR REPLACE FUNCTION public.get_active_live_sessions_v1(
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id BIGINT,
  creator_id UUID,
  title TEXT,
  thumbnail_url TEXT,
  category TEXT,
  viewer_count_current INT,
  started_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ls.id,
    ls.creator_id,
    ls.title,
    ls.thumbnail_url,
    ls.category,
    ls.viewer_count_current,
    ls.started_at
  FROM live_sessions ls
  WHERE ls.status = 'live'
    AND ls.moderation_status IN ('green', 'borderline')
  ORDER BY ls.viewer_count_current DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PART 3: Indexes & Constraints
-- ============================================================

-- Auto-cleanup: Delete old viewers (24h after session ends)
-- (Can be run as scheduled job in pg_cron)
-- SELECT cron.schedule('delete-old-live-viewers', '0 0 * * *',
--   'DELETE FROM live_viewers WHERE session_id IN (
--     SELECT id FROM live_sessions WHERE ended_at < now() - interval 24 hours
--   )'
-- );

-- Grant permissions
GRANT SELECT ON live_sessions TO authenticated;
GRANT SELECT ON live_viewers TO authenticated;
GRANT SELECT ON live_chat_messages TO authenticated;
GRANT SELECT ON live_stream_reports TO authenticated;

GRANT INSERT ON live_viewers TO authenticated;
GRANT INSERT ON live_chat_messages TO authenticated;
GRANT INSERT ON live_stream_reports TO authenticated;

GRANT UPDATE(viewer_count_current, viewer_count_peak, report_count, message_count) ON live_sessions TO authenticated;
GRANT UPDATE(left_at, watch_duration_seconds) ON live_viewers TO authenticated;

-- RPC: Available to authenticated users
GRANT EXECUTE ON FUNCTION is_eligible_for_live_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION broadcast_create_session_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION report_live_stream_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION broadcast_end_session_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_live_sessions_v1 TO authenticated;
