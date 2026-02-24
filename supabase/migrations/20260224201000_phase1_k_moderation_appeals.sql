-- ============================================================================
-- Phase 1 EPIC K Part 2: Moderation v1 - Appeals Lifecycle
--
-- Goals:
-- - Appeals submission (rate-limited)
-- - Appeals review workflow (submitted → in_review → accepted/rejected)
-- - SLA tracking (24-48 hours turnaround)
-- - Audit trail via content_moderation_actions
--
-- Dependencies:
-- - 20260224200000_phase1_k_moderation_queues_sla_borderline.sql
--   (public.moderation_decision, public.distribution_class,
--    public.content_moderation_status, public.content_moderation_actions,
--    public.set_content_moderation_decision_v1)
--
-- Based on: docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md
-- ============================================================================

-- 1) Appeal status types

DO $$
BEGIN
  CREATE TYPE public.appeal_status AS ENUM (
    'submitted',
    'in_review',
    'accepted',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.appeal_reason AS ENUM (
    'false_positive',
    'context_missing',
    'policy_unclear',
    'technical_error',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE public.appeal_status IS
  'Phase 1 EPIC K: Appeal lifecycle status';

COMMENT ON TYPE public.appeal_reason IS
  'Phase 1 EPIC K: Reason for appeal submission';

-- 2) Appeals table

CREATE TABLE IF NOT EXISTS public.moderation_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  moderation_action_id UUID REFERENCES public.content_moderation_actions(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('reel', 'comment', 'profile', 'message', 'hashtag')),
  content_id UUID NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Appeal details
  status public.appeal_status NOT NULL DEFAULT 'submitted',
  reason public.appeal_reason NOT NULL,
  user_explanation TEXT,

  -- Review details
  reviewed_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  moderator_response TEXT,
  public_response TEXT,

  -- Moderation context
  original_decision public.moderation_decision,
  original_distribution_class public.distribution_class,
  new_decision public.moderation_decision,
  new_distribution_class public.distribution_class,

  -- Timestamps
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_appeals_status
  ON public.moderation_appeals(status, submitted_at ASC);

CREATE INDEX IF NOT EXISTS idx_moderation_appeals_author
  ON public.moderation_appeals(author_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_appeals_content
  ON public.moderation_appeals(content_type, content_id, submitted_at DESC);

ALTER TABLE public.moderation_appeals
  ADD CONSTRAINT moderation_appeals_user_explanation_length
  CHECK (user_explanation IS NULL OR char_length(user_explanation) <= 1000);

COMMENT ON TABLE public.moderation_appeals IS
  'Phase 1 EPIC K: Appeals lifecycle (submitted → in_review → accepted/rejected)';

-- 3) Appeals rate limit tracking

CREATE TABLE IF NOT EXISTS public.appeal_rate_limits (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  appeal_count INTEGER NOT NULL DEFAULT 0,
  max_appeals INTEGER NOT NULL DEFAULT 5,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, window_start)
);

CREATE INDEX IF NOT EXISTS idx_appeal_rate_limits_user
  ON public.appeal_rate_limits(user_id);

CREATE INDEX IF NOT EXISTS idx_appeal_rate_limits_window
  ON public.appeal_rate_limits(window_start, window_end);

COMMENT ON TABLE public.appeal_rate_limits IS
  'Phase 1 EPIC K: Rate limit tracking for appeal submissions (anti-spam)';

-- 4) Submit appeal (with rate limiting + ownership checks)

CREATE OR REPLACE FUNCTION public.submit_appeal_v1(
  p_moderation_action_id UUID DEFAULT NULL,
  p_content_type TEXT DEFAULT 'reel',
  p_content_id UUID DEFAULT NULL,
  p_reason public.appeal_reason DEFAULT 'other',
  p_user_explanation TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_appeal_id UUID;
  v_rate_limit RECORD;
  v_window_start TIMESTAMPTZ;
  v_window_end TIMESTAMPTZ;
  v_action RECORD;
  v_status RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF p_content_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'content_id_required');
  END IF;

  IF p_content_type NOT IN ('reel','comment','profile','message','hashtag') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_content_type');
  END IF;

  IF p_user_explanation IS NOT NULL AND char_length(p_user_explanation) > 1000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'explanation_too_long',
      'message', 'Пояснение не должно превышать 1000 символов'
    );
  END IF;

  -- Ownership checks (minimal set)
  IF p_content_type = 'reel' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.id = p_content_id AND r.author_id = v_user_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'not_owner');
    END IF;
  ELSIF p_content_type = 'profile' THEN
    IF p_content_id <> v_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'not_owner');
    END IF;
  END IF;

  -- Rate limit (24h window bucketed by hour)
  v_window_start := date_trunc('hour', now());
  v_window_end := v_window_start + INTERVAL '24 hours';

  SELECT * INTO v_rate_limit
  FROM public.appeal_rate_limits
  WHERE user_id = v_user_id
    AND window_start = v_window_start;

  IF FOUND THEN
    IF v_rate_limit.appeal_count >= v_rate_limit.max_appeals THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'rate_limit_exceeded',
        'message', 'Превышен лимит апелляций. Попробуйте позже.',
        'retry_after', v_rate_limit.window_end
      );
    END IF;
  END IF;

  -- Resolve original moderation context
  IF p_moderation_action_id IS NOT NULL THEN
    SELECT * INTO v_action
    FROM public.content_moderation_actions a
    WHERE a.id = p_moderation_action_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'action_not_found');
    END IF;

    IF v_action.content_type <> p_content_type OR v_action.content_id <> p_content_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'action_mismatch');
    END IF;

    v_status.original_decision := v_action.new_decision;
    v_status.original_distribution_class := v_action.new_distribution_class;
  ELSE
    SELECT decision, distribution_class
    INTO v_status
    FROM public.content_moderation_status
    WHERE content_type = p_content_type
      AND content_id = p_content_id;

    IF NOT FOUND THEN
      -- Nothing to appeal (treated as allow/green)
      RETURN jsonb_build_object('success', false, 'error', 'no_moderation_state');
    END IF;
  END IF;

  -- Create appeal
  INSERT INTO public.moderation_appeals (
    moderation_action_id,
    content_type,
    content_id,
    author_id,
    reason,
    user_explanation,
    original_decision,
    original_distribution_class
  ) VALUES (
    p_moderation_action_id,
    p_content_type,
    p_content_id,
    v_user_id,
    p_reason,
    p_user_explanation,
    v_status.decision,
    v_status.distribution_class
  )
  RETURNING id INTO v_appeal_id;

  -- Update rate limit
  INSERT INTO public.appeal_rate_limits (
    user_id,
    window_start,
    window_end,
    appeal_count,
    max_appeals
  ) VALUES (
    v_user_id,
    v_window_start,
    v_window_end,
    1,
    5
  )
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET
    appeal_count = appeal_rate_limits.appeal_count + 1,
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'appeal_id', v_appeal_id,
    'message', 'Апелляция отправлена на рассмотрение'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_appeal_v1(UUID, TEXT, UUID, public.appeal_reason, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_appeal_v1(UUID, TEXT, UUID, public.appeal_reason, TEXT) TO authenticated;

COMMENT ON FUNCTION public.submit_appeal_v1(UUID, TEXT, UUID, public.appeal_reason, TEXT) IS
  'Phase 1 EPIC K: Submit appeal with rate limiting + ownership checks';

-- 5) Review appeal (moderator action)

CREATE OR REPLACE FUNCTION public.review_appeal_v1(
  p_appeal_id UUID,
  p_moderator_admin_id UUID,
  p_decision TEXT,  -- 'accept' or 'reject'
  p_moderator_response TEXT DEFAULT NULL,
  p_public_response TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appeal RECORD;
  v_action_id UUID;
  v_new_decision public.moderation_decision;
  v_new_distribution public.distribution_class;
BEGIN
  IF p_decision NOT IN ('accept', 'reject') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  SELECT * INTO v_appeal
  FROM public.moderation_appeals
  WHERE id = p_appeal_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_appeal.status IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Appeal already reviewed';
  END IF;

  IF p_decision = 'accept' THEN
    v_new_decision := 'allow';
    v_new_distribution := 'green';
  ELSE
    v_new_decision := v_appeal.original_decision;
    v_new_distribution := v_appeal.original_distribution_class;
  END IF;

  -- Update appeal
  UPDATE public.moderation_appeals
  SET
    status = CASE WHEN p_decision = 'accept' THEN 'accepted'::public.appeal_status ELSE 'rejected'::public.appeal_status END,
    reviewed_by = p_moderator_admin_id,
    reviewed_at = now(),
    moderator_response = p_moderator_response,
    public_response = p_public_response,
    new_decision = v_new_decision,
    new_distribution_class = v_new_distribution,
    updated_at = now()
  WHERE id = p_appeal_id;

  -- If accepted, restore allow/green using unified moderation action
  IF p_decision = 'accept' THEN
    v_action_id := public.set_content_moderation_decision_v1(
      v_appeal.content_type,
      v_appeal.content_id,
      'allow'::public.moderation_decision,
      'appeal_accepted',
      'appeal',
      NULL,
      COALESCE(p_moderator_response, 'Appeal accepted')
    );

    UPDATE public.moderation_appeals
    SET moderation_action_id = v_action_id,
        updated_at = now()
    WHERE id = p_appeal_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.review_appeal_v1(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_appeal_v1(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.review_appeal_v1(UUID, UUID, TEXT, TEXT, TEXT) IS
  'Phase 1 EPIC K: Review appeal (accept/reject) and update content moderation status';

-- 6) Get pending appeals (moderation queue)

CREATE OR REPLACE FUNCTION public.get_pending_appeals_v1(
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  appeal_id UUID,
  content_type TEXT,
  content_id UUID,
  author_id UUID,
  status public.appeal_status,
  reason public.appeal_reason,
  user_explanation TEXT,
  original_decision public.moderation_decision,
  submitted_at TIMESTAMPTZ,
  wait_time_hours INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ma.id AS appeal_id,
    ma.content_type,
    ma.content_id,
    ma.author_id,
    ma.status,
    ma.reason,
    ma.user_explanation,
    ma.original_decision,
    ma.submitted_at,
    (EXTRACT(EPOCH FROM (now() - ma.submitted_at))::INTEGER / 3600) AS wait_time_hours
  FROM public.moderation_appeals ma
  WHERE ma.status IN ('submitted', 'in_review')
  ORDER BY ma.submitted_at ASC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
END;
$$;

REVOKE ALL ON FUNCTION public.get_pending_appeals_v1(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_appeals_v1(INTEGER) TO service_role;

COMMENT ON FUNCTION public.get_pending_appeals_v1(INTEGER) IS
  'Phase 1 EPIC K: Get pending appeals for moderator review';

-- 7) Get current user appeals history

CREATE OR REPLACE FUNCTION public.get_my_appeals_v1(
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  appeal_id UUID,
  content_type TEXT,
  content_id UUID,
  status public.appeal_status,
  reason public.appeal_reason,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  public_response TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ma.id AS appeal_id,
    ma.content_type,
    ma.content_id,
    ma.status,
    ma.reason,
    ma.submitted_at,
    ma.reviewed_at,
    ma.public_response
  FROM public.moderation_appeals ma
  WHERE ma.author_id = v_user_id
  ORDER BY ma.submitted_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 100));
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_appeals_v1(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_appeals_v1(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_my_appeals_v1(INTEGER) IS
  'Phase 1 EPIC K: Get current user appeals history';

-- 8) Calculate appeal SLA metrics

CREATE OR REPLACE FUNCTION public.calculate_appeal_sla_v1(
  p_window_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_appeals BIGINT,
  pending_appeals BIGINT,
  accepted_appeals BIGINT,
  rejected_appeals BIGINT,
  avg_turnaround_hours NUMERIC,
  p50_turnaround_hours NUMERIC,
  p95_turnaround_hours NUMERIC,
  sla_breaches BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH appeal_stats AS (
    SELECT
      ma.id,
      ma.status,
      CASE
        WHEN ma.reviewed_at IS NULL THEN NULL
        ELSE (EXTRACT(EPOCH FROM (ma.reviewed_at - ma.submitted_at))::NUMERIC / 3600)
      END AS turnaround_hours
    FROM public.moderation_appeals ma
    WHERE ma.submitted_at >= (now() - make_interval(days => GREATEST(1, LEAST(p_window_days, 365))))
  )
  SELECT
    COUNT(*) AS total_appeals,
    COUNT(*) FILTER (WHERE status IN ('submitted', 'in_review')) AS pending_appeals,
    COUNT(*) FILTER (WHERE status = 'accepted') AS accepted_appeals,
    COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_appeals,
    ROUND(AVG(turnaround_hours), 2) AS avg_turnaround_hours,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY turnaround_hours), 2) AS p50_turnaround_hours,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY turnaround_hours), 2) AS p95_turnaround_hours,
    COUNT(*) FILTER (WHERE turnaround_hours > 48) AS sla_breaches
  FROM appeal_stats;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_appeal_sla_v1(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_appeal_sla_v1(INTEGER) TO service_role;

COMMENT ON FUNCTION public.calculate_appeal_sla_v1(INTEGER) IS
  'Phase 1 EPIC K: Calculate appeal SLA metrics (turnaround time, SLA breaches)';

-- ============================================================================
-- Summary:
-- - ✅ moderation_appeals table + rate limits
-- - ✅ submit_appeal_v1: ownership checks + anti-spam
-- - ✅ review_appeal_v1: accept/reject + audit via content_moderation_actions
-- - ✅ get_pending_appeals_v1: moderator queue
-- - ✅ get_my_appeals_v1: user history
-- - ✅ calculate_appeal_sla_v1: SLA metrics
-- ============================================================================
