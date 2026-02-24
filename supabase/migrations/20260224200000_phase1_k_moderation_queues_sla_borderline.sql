-- ============================================================================
-- Phase 1 EPIC K Part 1: Moderation v1 - Queues + SLA + Borderline Enforcement
--
-- Goals:
-- - Introduce moderation decisions: allow/restrict/needs_review/block
-- - Map decisions to distribution classes: green/borderline/red
-- - Create moderation queue (prioritized, burst-aware)
-- - Trust-weighted reports + basic reporter quality multiplier
-- - Enforce borderline exclusion on recommendation surfaces (Feed/Explore/Hashtag)
--
-- Based on: docs/specs/phase1/P1K-moderation-queues-sla-appeals-borderline.md
-- ============================================================================

-- 0) Core enums (as referenced by EPIC K Part 2 appeals)

DO $$
BEGIN
  CREATE TYPE public.moderation_decision AS ENUM ('allow', 'restrict', 'needs_review', 'block');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.distribution_class AS ENUM ('green', 'borderline', 'red');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE public.moderation_decision IS
  'Phase 1 EPIC K: Moderation decision (allow/restrict/needs_review/block)';

COMMENT ON TYPE public.distribution_class IS
  'Phase 1 EPIC K: Content distribution class (green/borderline/red)';

-- 1) Content moderation status (current state)

CREATE TABLE IF NOT EXISTS public.content_moderation_status (
  content_type TEXT NOT NULL CHECK (content_type IN ('reel', 'comment', 'profile', 'message', 'hashtag')),
  content_id UUID NOT NULL,

  decision public.moderation_decision NOT NULL DEFAULT 'allow',
  distribution_class public.distribution_class NOT NULL DEFAULT 'green',

  reason_code TEXT,
  notes TEXT,

  decided_by UUID,
  decided_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('system', 'auto_engine', 'human', 'appeal')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_content_moderation_status_class
  ON public.content_moderation_status(content_type, distribution_class, updated_at DESC);

COMMENT ON TABLE public.content_moderation_status IS
  'Phase 1 EPIC K: Current moderation decision + distribution class for content items';

-- 2) Content moderation actions (audit trail)

CREATE TABLE IF NOT EXISTS public.content_moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  content_type TEXT NOT NULL CHECK (content_type IN ('reel', 'comment', 'profile', 'message', 'hashtag')),
  content_id UUID NOT NULL,

  previous_decision public.moderation_decision,
  previous_distribution_class public.distribution_class,
  new_decision public.moderation_decision NOT NULL,
  new_distribution_class public.distribution_class NOT NULL,

  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'auto_engine', 'human', 'appeal')),
  actor_id UUID,

  reason_code TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_moderation_actions_content
  ON public.content_moderation_actions(content_type, content_id, created_at DESC);

COMMENT ON TABLE public.content_moderation_actions IS
  'Phase 1 EPIC K: Audit trail of moderation decisions (immutable append)';

-- 3) Moderation queue

CREATE TABLE IF NOT EXISTS public.moderation_queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  content_type TEXT NOT NULL CHECK (content_type IN ('reel', 'comment', 'profile', 'message', 'hashtag')),
  content_id UUID NOT NULL,

  risk_category TEXT NOT NULL DEFAULT 'other' CHECK (risk_category IN ('nsfw', 'violence', 'spam', 'copyright', 'harassment', 'hate_speech', 'terrorism', 'csam', 'other')),
  region TEXT,
  locale TEXT,

  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_review', 'resolved', 'dismissed')),

  assigned_to UUID,
  assigned_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  report_count INTEGER NOT NULL DEFAULT 0,
  report_weight_sum NUMERIC NOT NULL DEFAULT 0,

  burst_suspected BOOLEAN NOT NULL DEFAULT false,
  mass_report_attack BOOLEAN NOT NULL DEFAULT false,

  first_reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_moderation_queue_status_priority
  ON public.moderation_queue_items(status, priority DESC, last_reported_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_queue_content
  ON public.moderation_queue_items(content_type, content_id);

COMMENT ON TABLE public.moderation_queue_items IS
  'Phase 1 EPIC K: Moderation review queue with priority + burst flags';

-- 4) Trust-weighted reports (creator-facing + queue input)

CREATE TABLE IF NOT EXISTS public.content_reports_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  reporter_id UUID,
  content_type TEXT NOT NULL CHECK (content_type IN ('reel', 'comment', 'profile', 'message', 'hashtag')),
  content_id UUID NOT NULL,

  report_type TEXT NOT NULL CHECK (report_type IN (
    'spam', 'fraud', 'harassment', 'violence', 'csam', 'terrorism', 'hate_speech', 'impersonation', 'copyright', 'other'
  )),

  description TEXT,

  trust_score INTEGER,
  weight NUMERIC NOT NULL DEFAULT 1,
  quality_multiplier NUMERIC NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_reports_item_time
  ON public.content_reports_v1(content_type, content_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_reports_reporter
  ON public.content_reports_v1(reporter_id, created_at DESC);

COMMENT ON TABLE public.content_reports_v1 IS
  'Phase 1 EPIC K: Trust-weighted user reports on content (input for moderation queues)';

-- 5) Reporter quality score

CREATE TABLE IF NOT EXISTS public.moderation_reporter_quality (
  reporter_id UUID PRIMARY KEY,
  total_reports INTEGER NOT NULL DEFAULT 0,
  accepted_reports INTEGER NOT NULL DEFAULT 0,
  rejected_reports INTEGER NOT NULL DEFAULT 0,
  quality_score NUMERIC NOT NULL DEFAULT 0.50 CHECK (quality_score >= 0 AND quality_score <= 1),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.moderation_reporter_quality IS
  'Phase 1 EPIC K: Reporter quality score used to down-weight abusive reporters';

-- 6) Helpers: decision → distribution mapping

CREATE OR REPLACE FUNCTION public.map_decision_to_distribution_class_v1(
  p_decision public.moderation_decision
)
RETURNS public.distribution_class
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_decision = 'allow' THEN
    RETURN 'green';
  ELSIF p_decision = 'restrict' THEN
    RETURN 'borderline';
  ELSIF p_decision = 'needs_review' THEN
    RETURN 'borderline';
  ELSE
    RETURN 'red';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.map_decision_to_distribution_class_v1(public.moderation_decision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_decision_to_distribution_class_v1(public.moderation_decision) TO service_role;

COMMENT ON FUNCTION public.map_decision_to_distribution_class_v1(public.moderation_decision) IS
  'Phase 1 EPIC K: Map moderation decision to distribution class';

-- 7) Helpers: compute report weight (trust + reporter quality)

CREATE OR REPLACE FUNCTION public.get_reporter_quality_multiplier_v1(
  p_reporter_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quality NUMERIC;
BEGIN
  IF p_reporter_id IS NULL THEN
    RETURN 1;
  END IF;

  SELECT quality_score INTO v_quality
  FROM public.moderation_reporter_quality
  WHERE reporter_id = p_reporter_id;

  IF NOT FOUND THEN
    RETURN 1;
  END IF;

  -- Down-weight low-quality reporters
  IF v_quality < 0.30 THEN
    RETURN 0.50;
  ELSIF v_quality < 0.50 THEN
    RETURN 0.75;
  ELSE
    RETURN 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reporter_quality_multiplier_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reporter_quality_multiplier_v1(UUID) TO service_role;

COMMENT ON FUNCTION public.get_reporter_quality_multiplier_v1(UUID) IS
  'Phase 1 EPIC K: Reporter quality multiplier (down-weights abusive reporters)';

CREATE OR REPLACE FUNCTION public.calculate_report_weight_v1(
  p_reporter_id UUID
)
RETURNS TABLE (
  trust_score INTEGER,
  base_weight NUMERIC,
  quality_multiplier NUMERIC,
  final_weight NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trust_score INTEGER := NULL;
  v_base NUMERIC := 1;
  v_mult NUMERIC := 1;
BEGIN
  IF p_reporter_id IS NULL THEN
    RETURN QUERY SELECT NULL::INTEGER, 1::NUMERIC, 1::NUMERIC, 1::NUMERIC;
    RETURN;
  END IF;

  v_mult := public.get_reporter_quality_multiplier_v1(p_reporter_id);

  -- Trust-lite integration (EPIC L): trust_profiles(actor_type, actor_id, trust_score)
  IF to_regclass('public.trust_profiles') IS NOT NULL THEN
    SELECT tp.trust_score INTO v_trust_score
    FROM public.trust_profiles tp
    WHERE tp.actor_type = 'user'
      AND tp.actor_id = p_reporter_id::TEXT;
  END IF;

  -- Tier weights (simple mapping)
  IF v_trust_score IS NULL THEN
    v_base := 1;
  ELSIF v_trust_score >= 80 THEN
    v_base := 3;
  ELSIF v_trust_score >= 60 THEN
    v_base := 2;
  ELSIF v_trust_score >= 30 THEN
    v_base := 1;
  ELSE
    v_base := 0.20;
  END IF;

  RETURN QUERY SELECT v_trust_score, v_base, v_mult, (v_base * v_mult);
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_report_weight_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_report_weight_v1(UUID) TO service_role;

COMMENT ON FUNCTION public.calculate_report_weight_v1(UUID) IS
  'Phase 1 EPIC K: Trust-weighted reports (Tier A/B heavier; Tier D minimal) + reporter quality multiplier';

-- 8) Submit report → queue upsert + burst detection + auto needs_review (never auto-block)

CREATE OR REPLACE FUNCTION public.submit_content_report_v1(
  p_content_type TEXT,
  p_content_id UUID,
  p_report_type TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reporter_id UUID := auth.uid();
  v_weight RECORD;
  v_queue_id UUID;
  v_recent_reports INTEGER;
  v_recent_reporters INTEGER;
  v_burst BOOLEAN := false;
  v_enabled BOOLEAN := true;
  v_flag RECORD;
BEGIN
  -- Feature flag gate (global). If flag missing, default enabled.
  SELECT enabled, rollout_percentage INTO v_flag
  FROM public.feature_flags
  WHERE flag_name = 'moderation_queue_processing';

  IF FOUND THEN
    v_enabled := v_flag.enabled AND v_flag.rollout_percentage > 0;
  END IF;

  IF NOT v_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'disabled', 'message', 'Модерация временно недоступна');
  END IF;

  IF p_content_type NOT IN ('reel', 'comment', 'profile', 'message', 'hashtag') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_content_type');
  END IF;

  IF p_report_type NOT IN ('spam','fraud','harassment','violence','csam','terrorism','hate_speech','impersonation','copyright','other') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_report_type');
  END IF;

  SELECT * INTO v_weight
  FROM public.calculate_report_weight_v1(v_reporter_id);

  INSERT INTO public.content_reports_v1 (
    reporter_id,
    content_type,
    content_id,
    report_type,
    description,
    trust_score,
    weight,
    quality_multiplier
  ) VALUES (
    v_reporter_id,
    p_content_type,
    p_content_id,
    p_report_type,
    p_description,
    v_weight.trust_score,
    v_weight.base_weight,
    v_weight.quality_multiplier
  );

  -- Burst detection: last 10 minutes
  SELECT COUNT(*), COUNT(DISTINCT reporter_id)
  INTO v_recent_reports, v_recent_reporters
  FROM public.content_reports_v1
  WHERE content_type = p_content_type
    AND content_id = p_content_id
    AND created_at >= now() - interval '10 minutes';

  v_burst := (v_recent_reports >= 25 AND v_recent_reporters >= 10);

  -- Upsert queue item
  INSERT INTO public.moderation_queue_items (
    content_type,
    content_id,
    risk_category,
    priority,
    status,
    report_count,
    report_weight_sum,
    burst_suspected,
    mass_report_attack,
    first_reported_at,
    last_reported_at
  ) VALUES (
    p_content_type,
    p_content_id,
    CASE
      WHEN p_report_type IN ('csam') THEN 'csam'
      WHEN p_report_type IN ('terrorism') THEN 'terrorism'
      WHEN p_report_type IN ('violence') THEN 'violence'
      WHEN p_report_type IN ('hate_speech') THEN 'hate_speech'
      WHEN p_report_type IN ('harassment') THEN 'harassment'
      WHEN p_report_type IN ('copyright') THEN 'copyright'
      WHEN p_report_type IN ('spam','fraud','impersonation') THEN 'spam'
      ELSE 'other'
    END,
    LEAST(100, GREATEST(0, FLOOR((v_weight.final_weight * 10)::NUMERIC)::INTEGER)),
    'open',
    1,
    v_weight.final_weight,
    v_burst,
    v_burst,
    now(),
    now()
  )
  ON CONFLICT (content_type, content_id)
  DO UPDATE SET
    report_count = moderation_queue_items.report_count + 1,
    report_weight_sum = moderation_queue_items.report_weight_sum + EXCLUDED.report_weight_sum,
    burst_suspected = moderation_queue_items.burst_suspected OR EXCLUDED.burst_suspected,
    mass_report_attack = moderation_queue_items.mass_report_attack OR EXCLUDED.mass_report_attack,
    last_reported_at = now(),
    updated_at = now(),
    priority = LEAST(100, GREATEST(moderation_queue_items.priority, EXCLUDED.priority))
  RETURNING id INTO v_queue_id;

  -- Auto escalate to needs_review (borderline) if strong signal and not burst
  IF NOT v_burst THEN
    IF EXISTS (
      SELECT 1
      FROM public.moderation_queue_items qi
      WHERE qi.id = v_queue_id
        AND qi.report_weight_sum >= 10
        AND qi.status IN ('open','assigned','in_review')
    ) THEN
      -- Inline update to avoid dependency ordering within migration
      INSERT INTO public.content_moderation_actions (
        content_type,
        content_id,
        previous_decision,
        previous_distribution_class,
        new_decision,
        new_distribution_class,
        actor_type,
        actor_id,
        reason_code,
        notes
      )
      SELECT
        p_content_type,
        p_content_id,
        cms.decision,
        cms.distribution_class,
        'needs_review'::public.moderation_decision,
        'borderline'::public.distribution_class,
        'auto_engine',
        NULL::UUID,
        'auto_reports',
        'Auto: moved to needs_review due to weighted reports'
      FROM public.content_moderation_status cms
      WHERE cms.content_type = p_content_type
        AND cms.content_id = p_content_id;

      INSERT INTO public.content_moderation_status (
        content_type,
        content_id,
        decision,
        distribution_class,
        reason_code,
        notes,
        decided_by,
        decided_at,
        source,
        created_at,
        updated_at
      ) VALUES (
        p_content_type,
        p_content_id,
        'needs_review'::public.moderation_decision,
        'borderline'::public.distribution_class,
        'auto_reports',
        'Auto: moved to needs_review due to weighted reports',
        NULL::UUID,
        now(),
        'auto_engine',
        now(),
        now()
      )
      ON CONFLICT (content_type, content_id)
      DO UPDATE SET
        decision = EXCLUDED.decision,
        distribution_class = EXCLUDED.distribution_class,
        reason_code = EXCLUDED.reason_code,
        notes = EXCLUDED.notes,
        decided_by = EXCLUDED.decided_by,
        decided_at = EXCLUDED.decided_at,
        source = EXCLUDED.source,
        updated_at = now();
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'queue_item_id', v_queue_id,
    'burst_suspected', v_burst
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_content_report_v1(TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_content_report_v1(TEXT, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.submit_content_report_v1(TEXT, UUID, TEXT, TEXT) IS
  'Phase 1 EPIC K: Submit trust-weighted report; upsert moderation queue; burst-aware auto needs_review (never auto-block)';

-- 9) Set moderation decision (records action + updates status + resolves queue optionally)

CREATE OR REPLACE FUNCTION public.set_content_moderation_decision_v1(
  p_content_type TEXT,
  p_content_id UUID,
  p_new_decision public.moderation_decision,
  p_reason_code TEXT DEFAULT NULL,
  p_actor_type TEXT DEFAULT 'human',
  p_actor_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev RECORD;
  v_new_class public.distribution_class;
  v_action_id UUID;
BEGIN
  IF p_content_type NOT IN ('reel', 'comment', 'profile', 'message', 'hashtag') THEN
    RAISE EXCEPTION 'Invalid content_type: %', p_content_type;
  END IF;

  IF p_actor_type NOT IN ('system','auto_engine','human','appeal') THEN
    RAISE EXCEPTION 'Invalid actor_type: %', p_actor_type;
  END IF;

  v_new_class := public.map_decision_to_distribution_class_v1(p_new_decision);

  SELECT * INTO v_prev
  FROM public.content_moderation_status
  WHERE content_type = p_content_type
    AND content_id = p_content_id;

  INSERT INTO public.content_moderation_actions (
    content_type,
    content_id,
    previous_decision,
    previous_distribution_class,
    new_decision,
    new_distribution_class,
    actor_type,
    actor_id,
    reason_code,
    notes
  ) VALUES (
    p_content_type,
    p_content_id,
    v_prev.decision,
    v_prev.distribution_class,
    p_new_decision,
    v_new_class,
    p_actor_type,
    p_actor_id,
    p_reason_code,
    p_notes
  )
  RETURNING id INTO v_action_id;

  INSERT INTO public.content_moderation_status (
    content_type,
    content_id,
    decision,
    distribution_class,
    reason_code,
    notes,
    decided_by,
    decided_at,
    source,
    created_at,
    updated_at
  ) VALUES (
    p_content_type,
    p_content_id,
    p_new_decision,
    v_new_class,
    p_reason_code,
    p_notes,
    p_actor_id,
    now(),
    p_actor_type,
    now(),
    now()
  )
  ON CONFLICT (content_type, content_id)
  DO UPDATE SET
    decision = EXCLUDED.decision,
    distribution_class = EXCLUDED.distribution_class,
    reason_code = EXCLUDED.reason_code,
    notes = EXCLUDED.notes,
    decided_by = EXCLUDED.decided_by,
    decided_at = EXCLUDED.decided_at,
    source = EXCLUDED.source,
    updated_at = now();

  -- Resolve queue item (if exists)
  UPDATE public.moderation_queue_items
  SET
    status = 'resolved',
    resolved_at = now(),
    updated_at = now()
  WHERE content_type = p_content_type
    AND content_id = p_content_id
    AND status IN ('open','assigned','in_review');

  RETURN v_action_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_content_moderation_decision_v1(TEXT, UUID, public.moderation_decision, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_content_moderation_decision_v1(TEXT, UUID, public.moderation_decision, TEXT, TEXT, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.set_content_moderation_decision_v1(TEXT, UUID, public.moderation_decision, TEXT, TEXT, UUID, TEXT) IS
  'Phase 1 EPIC K: Set moderation decision; write action audit; update current status; resolve queue';

-- 10) Read helper: get distribution class (default green)

CREATE OR REPLACE FUNCTION public.get_content_distribution_class_v1(
  p_content_type TEXT,
  p_content_id UUID
)
RETURNS public.distribution_class
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class public.distribution_class;
BEGIN
  SELECT distribution_class INTO v_class
  FROM public.content_moderation_status
  WHERE content_type = p_content_type
    AND content_id = p_content_id;

  IF NOT FOUND THEN
    RETURN 'green';
  END IF;

  RETURN v_class;
END;
$$;

REVOKE ALL ON FUNCTION public.get_content_distribution_class_v1(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_content_distribution_class_v1(TEXT, UUID) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_content_distribution_class_v1(TEXT, UUID) IS
  'Phase 1 EPIC K: Get distribution class for content (default green if not set)';

-- 11) Enforcement patch: get_reels_feed_v2 must exclude borderline/red on recommendation surfaces
-- NOTE: We keep EPIC I ranking v2 logic but re-add server-side moderation/visibility gates
-- and apply EPIC K borderline exclusion.

CREATE OR REPLACE FUNCTION public.get_reels_feed_v2(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_session_id TEXT DEFAULT NULL,
  p_exploration_ratio NUMERIC DEFAULT 0.20,
  p_recency_days INTEGER DEFAULT 30,
  p_freq_cap_hours INTEGER DEFAULT 6,
  p_algorithm_version TEXT DEFAULT 'v2.epic-i'
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
  recommendation_reason TEXT,
  request_id UUID,
  feed_position INTEGER,
  algorithm_version TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request_id UUID := gen_random_uuid();
  v_exploitation_limit INTEGER;
  v_exploration_limit INTEGER;
  v_total_impressions INTEGER := 0;
  v_effective_exploration_ratio NUMERIC := COALESCE(p_exploration_ratio, 0.20);
  v_diversity_config RECORD;
  v_echo_chamber_detected BOOLEAN := FALSE;
  v_position INTEGER := 1;
BEGIN
  IF v_user_id IS NULL AND (p_session_id IS NULL OR length(trim(p_session_id)) = 0) THEN
    RAISE EXCEPTION 'get_reels_feed_v2 requires auth or session_id';
  END IF;

  -- Cold-start impression count
  SELECT COUNT(*)::INTEGER
  INTO v_total_impressions
  FROM public.reel_impressions i
  WHERE (
    (v_user_id IS NOT NULL AND i.user_id = v_user_id)
    OR
    (v_user_id IS NULL AND i.user_id IS NULL AND i.session_id = p_session_id)
  );

  -- EPIC I: Echo chamber detection and diversity boost
  IF v_user_id IS NOT NULL THEN
    SELECT * INTO v_diversity_config
    FROM public.get_diversity_config_v1(v_user_id);
    
    IF v_diversity_config.is_echo_chamber THEN
      v_effective_exploration_ratio := GREATEST(v_effective_exploration_ratio, v_diversity_config.exploration_ratio);
      v_echo_chamber_detected := TRUE;
    END IF;
  END IF;

  -- Cold start window
  IF v_total_impressions < 200 THEN
    v_effective_exploration_ratio := GREATEST(v_effective_exploration_ratio, 0.60);
  ELSIF v_total_impressions < 1000 THEN
    v_effective_exploration_ratio := GREATEST(v_effective_exploration_ratio, 0.35);
  END IF;

  v_exploitation_limit := GREATEST(0, FLOOR(p_limit * (1 - v_effective_exploration_ratio)));
  v_exploration_limit := GREATEST(0, p_limit - v_exploitation_limit);

  RETURN QUERY
  WITH viewer AS (
    SELECT
      v_user_id AS user_id,
      CASE WHEN v_user_id IS NULL THEN p_session_id ELSE NULL END AS session_id,
      v_total_impressions AS total_impressions,
      v_request_id AS request_id,
      v_echo_chamber_detected AS echo_chamber_detected
  ),
  feedback AS (
    SELECT f.reel_id, f.feedback
    FROM public.user_reel_feedback f
    JOIN viewer v ON (
      (v.user_id IS NOT NULL AND f.user_id = v.user_id)
      OR
      (v.user_id IS NULL AND f.user_id IS NULL AND f.session_id = v.session_id)
    )
  ),
  blocked AS (
    SELECT reel_id
    FROM feedback
    WHERE feedback = 'not_interested'
  ),
  recent_impressions AS (
    SELECT i.reel_id
    FROM public.reel_impressions i
    JOIN viewer v ON (
      (v.user_id IS NOT NULL AND i.user_id = v.user_id)
      OR
      (v.user_id IS NULL AND i.user_id IS NULL AND i.session_id = v.session_id)
    )
    WHERE i.created_at >= now() - make_interval(hours => p_freq_cap_hours)
    GROUP BY i.reel_id
  ),
  recent_author_impressions AS (
    SELECT r.author_id, COUNT(*)::INTEGER AS impressions_24h
    FROM public.reel_impressions i
    JOIN public.reels r ON r.id = i.reel_id
    JOIN viewer v ON (
      (v.user_id IS NOT NULL AND i.user_id = v.user_id)
      OR
      (v.user_id IS NULL AND i.user_id IS NULL AND i.session_id = v.session_id)
    )
    WHERE i.created_at >= now() - interval '24 hours'
    GROUP BY r.author_id
  ),
  global_impressions AS (
    SELECT i.reel_id, COUNT(*)::INTEGER AS impressions_7d
    FROM public.reel_impressions i
    WHERE i.created_at >= now() - interval '7 days'
    GROUP BY i.reel_id
  ),
  affinities AS (
    SELECT ua.author_id, ua.affinity_score
    FROM public.user_author_affinity ua
    WHERE v_user_id IS NOT NULL AND ua.user_id = v_user_id
  ),
  following AS (
    SELECT f.following_id
    FROM public.followers f
    WHERE v_user_id IS NOT NULL AND f.follower_id = v_user_id
  ),
  candidates AS (
    SELECT
      r.id,
      r.author_id,
      r.video_url,
      r.thumbnail_url,
      r.description,
      r.music_title,
      r.likes_count,
      r.comments_count,
      r.views_count,
      COALESCE(r.saves_count, 0) AS saves_count,
      COALESCE(r.reposts_count, 0) AS reposts_count,
      COALESCE(r.shares_count, 0) AS shares_count,
      r.created_at,

      COALESCE(gi.impressions_7d, 0) AS global_impressions_7d,

      -- Global completion proxy for content quality
      COALESCE((
        SELECT AVG(uri.completion_rate)
        FROM public.user_reel_interactions uri
        WHERE uri.reel_id = r.id AND uri.completion_rate > 0
      ), 0.0) AS global_completion_rate,

      COALESCE((SELECT affinity_score FROM affinities a WHERE a.author_id = r.author_id), 0.0) AS affinity_score,
      CASE WHEN EXISTS (SELECT 1 FROM following f WHERE f.following_id = r.author_id) THEN 1 ELSE 0 END AS is_following,
      COALESCE((SELECT feedback FROM feedback fb WHERE fb.reel_id = r.id), NULL) AS explicit_feedback,
      COALESCE((SELECT impressions_24h FROM recent_author_impressions rai WHERE rai.author_id = r.author_id), 0) AS author_impressions_24h,

      COALESCE(public.get_hashtag_boost_score(r.id), 0.0) AS hashtag_boost,
      COALESCE(public.get_audio_boost_score(r.id), 0.0) AS audio_boost,
      COALESCE(public.get_topic_boost_score(r.id), 0.0) AS topic_boost,

      (100.0 * EXP(-EXTRACT(EPOCH FROM (now() - r.created_at)) / 86400.0)) AS recency_score,
      COALESCE(public.calculate_virality_score(r.id), 0.0) AS virality_score,

      -- EPIC I: Controversial penalty
      COALESCE(public.get_controversial_penalty_v1(r.id), 0.0) AS controversial_penalty,
      
      -- EPIC I: Author fatigue penalty
      CASE
        WHEN v_user_id IS NOT NULL THEN COALESCE(public.get_author_fatigue_penalty_v1(v_user_id, r.author_id, 168), 0.0)
        ELSE 0.0
      END AS author_fatigue_penalty

    FROM public.reels r
    LEFT JOIN global_impressions gi ON gi.reel_id = r.id
    LEFT JOIN public.channels ch ON ch.id = r.channel_id
    LEFT JOIN public.content_moderation_status cms
      ON cms.content_type = 'reel'
     AND cms.content_id = r.id
    WHERE r.created_at >= now() - (p_recency_days || ' days')::INTERVAL
      AND r.id NOT IN (SELECT reel_id FROM blocked)
      AND r.id NOT IN (SELECT reel_id FROM recent_impressions)
      AND (v_user_id IS NULL OR r.author_id <> v_user_id)

      -- Phase 0 moderation gate
      AND COALESCE(r.moderation_status, 'approved') <> 'blocked'

      -- EPIC K borderline enforcement: never recommend borderline/red
      AND COALESCE(cms.distribution_class, 'green') = 'green'

      -- Visibility + sensitive gating (aligned with get_user_reels_v1)
      AND (
        (
          COALESCE(r.is_nsfw, false) = false
          AND COALESCE(r.is_graphic_violence, false) = false
          AND COALESCE(r.is_political_extremism, false) = false
          AND (
            r.channel_id IS NULL
            OR COALESCE(ch.is_public, false) = true
            OR (v_user_id IS NOT NULL AND public.is_channel_member(r.channel_id, v_user_id))
          )
        )
        OR
        (
          (
            COALESCE(r.is_nsfw, false) = true
            OR COALESCE(r.is_graphic_violence, false) = true
            OR COALESCE(r.is_political_extremism, false) = true
          )
          AND r.channel_id IS NOT NULL
          AND COALESCE(ch.is_public, false) = false
          AND v_user_id IS NOT NULL
          AND public.is_channel_member(r.channel_id, v_user_id)
        )
      )
  ),
  scored AS (
    SELECT
      c.*,

      LEAST(
        100.0,
        (
          public.calculate_advanced_engagement_score(
            c.likes_count,
            c.comments_count,
            c.views_count,
            c.saves_count,
            c.shares_count,
            c.reposts_count,
            GREATEST(LEAST(c.global_completion_rate, 100.0) / 100.0, 0.20)
          ) / 10.0
        ) * 100.0
      ) AS engagement_score,

      LEAST(100.0,
        (LEAST(c.global_completion_rate, 100.0) * 0.40) +
        (LEAST(c.virality_score, 100.0) * 0.20) +
        (LEAST((
          public.calculate_advanced_engagement_score(
            c.likes_count,
            c.comments_count,
            c.views_count,
            c.saves_count,
            c.shares_count,
            c.reposts_count,
            GREATEST(LEAST(c.global_completion_rate, 100.0) / 100.0, 0.20)
          ) / 10.0
        ) * 100.0, 100.0) * 0.30) +
        (LEAST(c.recency_score, 100.0) * 0.10)
      ) AS tiktok_quality_score,

      LEAST(100.0,
        (LEAST(c.affinity_score * 2.0, 80.0)) +
        (CASE WHEN c.is_following = 1 THEN 30.0 ELSE 0.0 END)
      ) AS instagram_personal_score,

      LEAST(100.0, (c.hashtag_boost + c.audio_boost + c.topic_boost) / 6.0) AS trend_boost_score,

      CASE WHEN c.explicit_feedback = 'interested' THEN 40.0 ELSE 0.0 END AS feedback_boost,
      LEAST(40.0, c.author_impressions_24h::NUMERIC * 4.0) AS author_penalty,

      -- Cold-start test boost
      CASE
        WHEN (SELECT total_impressions FROM viewer) < 1000 AND c.global_impressions_7d < 25 THEN 18.0
        WHEN (SELECT total_impressions FROM viewer) < 1000 AND c.global_impressions_7d < 100 THEN 8.0
        ELSE 0.0
      END AS cold_start_boost

    FROM candidates c
  ),
  exploitation AS (
    SELECT
      s.*,
      (
        (s.tiktok_quality_score * 0.60) +
        (s.instagram_personal_score * 0.40) +
        (s.trend_boost_score * 0.15) +
        s.feedback_boost +
        s.cold_start_boost -
        s.author_penalty -
        s.controversial_penalty -
        s.author_fatigue_penalty
      ) AS final_score,
      CASE
        WHEN s.explicit_feedback = 'interested' THEN 'Explicit: interested'
        WHEN s.cold_start_boost >= 10 OR (SELECT echo_chamber_detected FROM viewer) THEN 'Diverse content'
        WHEN s.is_following = 1 THEN 'From accounts you follow'
        WHEN s.affinity_score > 20 THEN 'Because you liked similar content'
        WHEN s.trend_boost_score > 20 THEN 'Trending now'
        WHEN s.virality_score > 50 THEN 'Popular now'
        ELSE 'Recommended for you'
      END AS recommendation_reason,
      'exploitation' AS source_pool
    FROM scored s
    WHERE (s.tiktok_quality_score - s.controversial_penalty) >= 10.0
    ORDER BY (
      (s.tiktok_quality_score * 0.60) +
      (s.instagram_personal_score * 0.40) +
      (s.trend_boost_score * 0.15) +
      s.feedback_boost +
      s.cold_start_boost -
      s.author_penalty -
      s.controversial_penalty -
      s.author_fatigue_penalty
    ) DESC
    LIMIT v_exploitation_limit
    OFFSET p_offset
  ),
  exploration AS (
    SELECT
      s.*,
      (
        (s.tiktok_quality_score * 0.45) +
        (s.instagram_personal_score * 0.15) +
        (s.trend_boost_score * 0.30) +
        s.feedback_boost +
        (s.cold_start_boost * 1.10) -
        s.author_penalty -
        (s.controversial_penalty * 0.50) -
        s.author_fatigue_penalty
      ) AS final_score,
      'Diverse content' AS recommendation_reason,
      'exploration' AS source_pool
    FROM scored s
    WHERE s.id NOT IN (SELECT e.id FROM exploitation e)
      AND (s.tiktok_quality_score + s.trend_boost_score + s.cold_start_boost - s.controversial_penalty) >= 20.0
    ORDER BY random()
    LIMIT v_exploration_limit
  ),
  combined AS (
    SELECT
      e.id,
      e.author_id,
      e.video_url,
      e.thumbnail_url,
      e.description,
      e.music_title,
      e.likes_count,
      e.comments_count,
      e.views_count,
      e.saves_count,
      e.reposts_count,
      e.shares_count,
      e.created_at,
      e.final_score,
      e.recommendation_reason,
      e.source_pool,
      e.tiktok_quality_score,
      e.instagram_personal_score,
      e.trend_boost_score,
      e.feedback_boost,
      e.cold_start_boost,
      e.author_penalty,
      e.controversial_penalty,
      e.author_fatigue_penalty,
      e.hashtag_boost,
      e.audio_boost,
      e.topic_boost
    FROM exploitation e

    UNION ALL

    SELECT
      x.id,
      x.author_id,
      x.video_url,
      x.thumbnail_url,
      x.description,
      x.music_title,
      x.likes_count,
      x.comments_count,
      x.views_count,
      x.saves_count,
      x.reposts_count,
      x.shares_count,
      x.created_at,
      x.final_score,
      x.recommendation_reason,
      x.source_pool,
      x.tiktok_quality_score,
      x.instagram_personal_score,
      x.trend_boost_score,
      x.feedback_boost,
      x.cold_start_boost,
      x.author_penalty,
      x.controversial_penalty,
      x.author_fatigue_penalty,
      x.hashtag_boost,
      x.audio_boost,
      x.topic_boost
    FROM exploration x

    ORDER BY final_score DESC
    LIMIT p_limit
  )
  SELECT
    c.id,
    c.author_id,
    c.video_url,
    c.thumbnail_url,
    c.description,
    c.music_title,
    c.likes_count,
    c.comments_count,
    c.views_count,
    c.saves_count,
    c.reposts_count,
    c.shares_count,
    c.created_at,
    c.final_score,
    c.recommendation_reason,
    (SELECT request_id FROM viewer) AS request_id,
    row_number() OVER (ORDER BY c.final_score DESC)::INTEGER AS feed_position,
    p_algorithm_version AS algorithm_version
  FROM combined c;

  -- EPIC I: Record ranking explanations (best effort)
  BEGIN
    IF v_user_id IS NOT NULL THEN
      PERFORM public.record_ranking_explanation_v1(
        p_request_id := v_request_id,
        p_user_id := v_user_id,
        p_reel_id := c.id,
        p_source_pool := c.source_pool,
        p_final_score := c.final_score,
        p_base_score := c.tiktok_quality_score,
        p_boosts := jsonb_build_object(
          'tiktok_quality', c.tiktok_quality_score,
          'instagram_personal', c.instagram_personal_score,
          'trend_boost', c.trend_boost_score,
          'feedback', c.feedback_boost,
          'cold_start', c.cold_start_boost,
          'hashtag', c.hashtag_boost,
          'audio', c.audio_boost,
          'topic', c.topic_boost
        ),
        p_penalties := jsonb_build_object(
          'author_penalty', c.author_penalty,
          'controversial_penalty', c.controversial_penalty,
          'author_fatigue_penalty', c.author_fatigue_penalty
        ),
        p_diversity_constraints := jsonb_build_object(
          'exploration_ratio', v_effective_exploration_ratio,
          'echo_chamber_detected', v_echo_chamber_detected,
          'total_impressions', v_total_impressions
        ),
        p_is_cold_start := (v_total_impressions < 1000),
        p_echo_chamber_detected := v_echo_chamber_detected,
        p_controversial_penalty_applied := (c.controversial_penalty > 0),
        p_feed_position := v_position,
        p_algorithm_version := p_algorithm_version
      )
      FROM combined c;
      
      v_position := v_position + 1;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;

END;
$$;

REVOKE ALL ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT) IS
  'Phase 1 EPIC I + K: Personalized reels feed (ranking v2) with moderation + borderline enforcement';

-- 12) Enforcement patch: Hashtag feed must exclude borderline/red

CREATE OR REPLACE FUNCTION public.is_reel_discoverable_v1(
  p_reel_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r RECORD;
  v_class public.distribution_class;
BEGIN
  SELECT r.id, r.channel_id, r.moderation_status, r.is_nsfw, r.is_graphic_violence, r.is_political_extremism
  INTO v_r
  FROM public.reels r
  WHERE r.id = p_reel_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF COALESCE(v_r.moderation_status, 'approved') = 'blocked' THEN
    RETURN false;
  END IF;

  IF COALESCE(v_r.is_nsfw, false) OR COALESCE(v_r.is_graphic_violence, false) OR COALESCE(v_r.is_political_extremism, false) THEN
    RETURN false;
  END IF;

  -- Only public/no-channel for discover surfaces (anon-safe)
  IF v_r.channel_id IS NOT NULL THEN
    IF to_regclass('public.channels') IS NULL THEN
      RETURN false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.channels ch WHERE ch.id = v_r.channel_id AND COALESCE(ch.is_public, false) = true) THEN
      RETURN false;
    END IF;
  END IF;

  v_class := public.get_content_distribution_class_v1('reel', p_reel_id);
  IF v_class <> 'green' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.is_reel_discoverable_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_reel_discoverable_v1(UUID) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.is_reel_discoverable_v1(UUID) IS
  'Phase 1 EPIC K: Helper - reel is eligible for recommendation surfaces (green, non-sensitive, public)';

-- Patch EPIC H hashtag surface: enforce discoverability (green only)

CREATE OR REPLACE FUNCTION public.get_hashtag_feed_v1(
  p_hashtag_tag TEXT,
  p_surface TEXT DEFAULT 'top',
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  reel_id UUID,
  author_id UUID,
  video_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ,
  likes_count INTEGER,
  views_count INTEGER,
  relevance_score NUMERIC,
  surface TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hashtag_id UUID;
  v_hashtag_status TEXT;
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT id, moderation_status INTO v_hashtag_id, v_hashtag_status
  FROM public.hashtags
  WHERE tag = lower(trim(p_hashtag_tag));

  IF v_hashtag_id IS NULL THEN
    RAISE EXCEPTION 'Hashtag not found: %', p_hashtag_tag;
  END IF;

  IF v_hashtag_status = 'hidden' THEN
    RAISE EXCEPTION 'Hashtag is not available';
  END IF;

  IF v_hashtag_status = 'restricted' AND p_surface IN ('trending', 'top') THEN
    RAISE EXCEPTION 'Hashtag is restricted';
  END IF;

  IF p_surface = 'top' THEN
    RETURN QUERY
    SELECT 
      r.id AS reel_id,
      r.author_id,
      r.video_url,
      r.thumbnail_url,
      r.description,
      r.created_at,
      r.likes_count,
      r.views_count,
      COALESCE(rh.relevance_score, 1.0) AS relevance_score,
      'top'::TEXT AS surface
    FROM public.reel_hashtags rh
    JOIN public.reels r ON r.id = rh.reel_id
    WHERE rh.hashtag_id = v_hashtag_id
      AND public.is_reel_discoverable_v1(r.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.user_reel_feedback f
        WHERE f.reel_id = r.id 
          AND f.user_id = v_user_id 
          AND f.feedback = 'not_interested'
      )
    ORDER BY 
      (
        (r.views_count::NUMERIC * 0.3) +
        (r.likes_count::NUMERIC * 0.3) +
        (r.comments_count::NUMERIC * 0.2) +
        (COALESCE(rh.relevance_score, 1.0) * 20)
      ) DESC,
      r.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;

  ELSIF p_surface = 'recent' THEN
    RETURN QUERY
    SELECT 
      r.id AS reel_id,
      r.author_id,
      r.video_url,
      r.thumbnail_url,
      r.description,
      r.created_at,
      r.likes_count,
      r.views_count,
      COALESCE(rh.relevance_score, 1.0) AS relevance_score,
      'recent'::TEXT AS surface
    FROM public.reel_hashtags rh
    JOIN public.reels r ON r.id = rh.reel_id
    WHERE rh.hashtag_id = v_hashtag_id
      AND public.is_reel_discoverable_v1(r.id)
      AND COALESCE(rh.relevance_score, 1.0) >= 0.3
    ORDER BY r.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;

  ELSIF p_surface = 'trending' THEN
    RETURN QUERY
    SELECT 
      r.id AS reel_id,
      r.author_id,
      r.video_url,
      r.thumbnail_url,
      r.description,
      r.created_at,
      r.likes_count,
      r.views_count,
      COALESCE(rh.relevance_score, 1.0) AS relevance_score,
      'trending'::TEXT AS surface
    FROM public.reel_hashtags rh
    JOIN public.reels r ON r.id = rh.reel_id
    WHERE rh.hashtag_id = v_hashtag_id
      AND public.is_reel_discoverable_v1(r.id)
      AND r.created_at >= now() - interval '7 days'
    ORDER BY 
      (
        (r.views_count::NUMERIC * 0.4) +
        (r.likes_count::NUMERIC * 0.3) +
        (r.comments_count::NUMERIC * 0.2) +
        (COALESCE(rh.relevance_score, 1.0) * 10)
      ) DESC
    LIMIT p_limit
    OFFSET p_offset;
  ELSE
    RAISE EXCEPTION 'Invalid surface: %', p_surface;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_hashtag_feed_v1(TEXT, TEXT, INTEGER, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hashtag_feed_v1(TEXT, TEXT, INTEGER, INTEGER, UUID) TO authenticated, anon;

-- Patch EPIC G Explore helpers: enforce discoverability (green only)

CREATE OR REPLACE FUNCTION public.get_explore_fresh_creators_v1(
  p_limit INTEGER DEFAULT 12,
  p_min_reels_count INTEGER DEFAULT 3,
  p_min_trust_score INTEGER DEFAULT 30,
  p_max_age_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  reels_count INTEGER,
  trust_score INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.display_name,
    p.avatar_url,
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM public.reels r
      WHERE r.author_id = p.user_id
        AND public.is_reel_discoverable_v1(r.id)
    ), 0) AS reels_count,
    COALESCE(tp.trust_score, 50) AS trust_score,
    p.created_at
  FROM public.profiles p
  LEFT JOIN public.trust_profiles tp ON tp.actor_type = 'user' AND tp.actor_id = p.user_id::TEXT
  WHERE p.created_at >= (now() - make_interval(days => COALESCE(p_max_age_days, 30)))
    AND COALESCE(tp.trust_score, 50) >= COALESCE(p_min_trust_score, 30)
    AND EXISTS (
      SELECT 1
      FROM public.reels r
      WHERE r.author_id = p.user_id
        AND public.is_reel_discoverable_v1(r.id)
      LIMIT COALESCE(p_min_reels_count, 3)
    )
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 50));
$$;

REVOKE ALL ON FUNCTION public.get_explore_fresh_creators_v1(INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_explore_fresh_creators_v1(INTEGER, INTEGER, INTEGER, INTEGER) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_explore_categories_v1(
  p_limit_categories INTEGER DEFAULT 6,
  p_limit_reels_per_category INTEGER DEFAULT 5
)
RETURNS TABLE (
  category_id UUID,
  category_name TEXT,
  display_name TEXT,
  icon_name TEXT,
  reels JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category RECORD;
  v_reels JSONB;
BEGIN
  FOR v_category IN
    SELECT
      hc.category_id,
      hc.category_name,
      hc.display_name_ru AS display_name,
      hc.icon_name,
      hc.sort_order
    FROM public.hashtag_categories hc
    WHERE hc.is_active = true
    ORDER BY hc.sort_order ASC
    LIMIT GREATEST(1, LEAST(p_limit_categories, 20))
  LOOP
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'reel_id', r.id::TEXT,
        'author_id', r.author_id::TEXT,
        'thumbnail_url', r.thumbnail_url,
        'views_count', COALESCE(r.views_count, 0),
        'likes_count', COALESCE(r.likes_count, 0),
        'created_at', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    ), '[]'::JSONB)
    INTO v_reels
    FROM (
      SELECT DISTINCT ON (r.id) r.*
      FROM public.reels r
      JOIN public.reel_hashtags rh ON rh.reel_id = r.id
      JOIN public.hashtag_category_mapping hcm ON hcm.hashtag_id = rh.hashtag_id
      WHERE hcm.category_id = v_category.category_id
        AND public.is_reel_discoverable_v1(r.id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.controversial_content_flags ccf
          WHERE ccf.reel_id = r.id
            AND ccf.is_active = true
        )
      ORDER BY r.id, COALESCE(r.views_count, 0) DESC, COALESCE(r.likes_count, 0) DESC
      LIMIT GREATEST(1, LEAST(p_limit_reels_per_category, 20))
    ) r;

    category_id := v_category.category_id;
    category_name := v_category.category_name;
    display_name := v_category.display_name;
    icon_name := v_category.icon_name;
    reels := v_reels;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_explore_categories_v1(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_explore_categories_v1(INTEGER, INTEGER) TO anon, authenticated;

-- ============================================================================
-- Notes:
-- - Appeals lifecycle is implemented in Part 2 migration (20260224201000...)
-- - Explore enforcement: explore functions already exclude blocked; they should also use is_reel_discoverable_v1
--   (patched in their own migrations; we keep feed + hashtag enforced here to stop leakage).
-- ============================================================================
