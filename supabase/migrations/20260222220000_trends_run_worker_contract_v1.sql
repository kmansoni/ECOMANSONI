-- Trend computation run: worker contract (v1)
-- Adds: trend_runs table + start_trend_run_v1 RPC which enqueues a decision_jobs job.

-- ============================================================================
-- 1) Run state table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trend_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id TEXT NOT NULL DEFAULT 'seg_default',
  window_key TEXT NOT NULL DEFAULT '24h' CHECK (window_key IN ('1h','6h','24h')),
  lookback_hours INT NOT NULL DEFAULT 24 CHECK (lookback_hours IN (1,6,24)),
  algorithm_version TEXT NOT NULL DEFAULT 'trending-v1',
  candidate_limit INT NOT NULL DEFAULT 50 CHECK (candidate_limit >= 1 AND candidate_limit <= 500),

  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','canceled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,

  idempotency_key TEXT,
  decision_job_id UUID,

  inputs JSONB,
  outputs JSONB,
  reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trend_runs_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_trend_runs_segment_started
  ON public.trend_runs(segment_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_trend_runs_status_started
  ON public.trend_runs(status, started_at DESC);

-- ============================================================================
-- 2) Enqueue helper (generic)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_decision_job_v1(
  p_job_type TEXT,
  p_subject_type TEXT,
  p_subject_id TEXT,
  p_payload JSONB,
  p_priority INT DEFAULT 100,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  job_id UUID,
  status TEXT,
  queued BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_job_id UUID;
  v_status TEXT;
BEGIN
  v_org_id := '00000000-0000-0000-0000-000000000000'::uuid;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, status
      INTO v_job_id, v_status
    FROM public.decision_jobs
    WHERE idempotency_key = p_idempotency_key
      AND organization_id = v_org_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_job_id IS NOT NULL THEN
      RETURN QUERY SELECT v_job_id, v_status, TRUE;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.decision_jobs (
    job_type,
    subject_type,
    subject_id,
    input_payload,
    status,
    priority,
    idempotency_key,
    organization_id
  ) VALUES (
    p_job_type,
    p_subject_type,
    p_subject_id,
    COALESCE(p_payload, '{}'::jsonb),
    'pending',
    GREATEST(0, LEAST(p_priority, 1000)),
    p_idempotency_key,
    v_org_id
  )
  RETURNING id, status INTO v_job_id, v_status;

  RETURN QUERY SELECT v_job_id, v_status, TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_decision_job_v1 TO service_role;

-- ============================================================================
-- 3) Start trend run RPC (internal)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.start_trend_run_v1(
  p_segment_id TEXT DEFAULT 'seg_default',
  p_window TEXT DEFAULT '24h',
  p_candidate_limit INT DEFAULT 50,
  p_algorithm_version TEXT DEFAULT 'trending-v1',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  run_id TEXT,
  "window" TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  status TEXT,
  inputs JSONB,
  outputs JSONB,
  reason_codes TEXT[],
  notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.trend_runs;
  v_hours INT;
  v_candidates TEXT[];
  v_job_id UUID;
  v_job_status TEXT;
BEGIN
  v_hours := CASE p_window
    WHEN '1h' THEN 1
    WHEN '6h' THEN 6
    ELSE 24
  END;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_run
    FROM public.trend_runs
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_run.run_id IS NOT NULL THEN
      RETURN QUERY SELECT
        v_run.run_id::text,
        v_run.window_key,
        v_run.started_at,
        v_run.ended_at,
        v_run.status,
        v_run.inputs,
        v_run.outputs,
        v_run.reason_codes,
        v_run.notes;
      RETURN;
    END IF;
  END IF;

  SELECT array_agg(h.tag ORDER BY h.velocity_score DESC NULLS LAST, h.usage_last_24h DESC, h.usage_count DESC)
    INTO v_candidates
  FROM public.hashtags h
  WHERE h.status = 'normal'
  LIMIT GREATEST(1, LEAST(p_candidate_limit, 500));

  v_candidates := COALESCE(v_candidates, ARRAY[]::TEXT[]);

  INSERT INTO public.trend_runs (
    segment_id,
    window_key,
    lookback_hours,
    algorithm_version,
    candidate_limit,
    status,
    idempotency_key,
    inputs
  ) VALUES (
    p_segment_id,
    p_window,
    v_hours,
    p_algorithm_version,
    GREATEST(1, LEAST(p_candidate_limit, 500)),
    'running',
    p_idempotency_key,
    jsonb_build_object(
      'segment_id', p_segment_id,
      'window', p_window,
      'lookback_hours', v_hours,
      'candidate_limit', GREATEST(1, LEAST(p_candidate_limit, 500)),
      'candidate_hashtags', v_candidates
    )
  )
  RETURNING * INTO v_run;

  -- Enqueue a single batch job (worker will fan-out / compute snapshots)
  SELECT job_id, status
    INTO v_job_id, v_job_status
  FROM public.enqueue_decision_job_v1(
    p_job_type := 'compute_trend_snapshot',
    p_subject_type := 'segment_trend',
    p_subject_id := p_segment_id,
    p_payload := jsonb_build_object(
      'run_id', v_run.run_id,
      'segment_id', p_segment_id,
      'window', p_window,
      'lookback_hours', v_hours,
      'algorithm_version', p_algorithm_version,
      'candidate_hashtags', v_candidates
    ),
    p_priority := 200,
    p_idempotency_key := COALESCE(p_idempotency_key, v_run.run_id::text)
  );

  UPDATE public.trend_runs
     SET decision_job_id = v_job_id,
         updated_at = now()
   WHERE run_id = v_run.run_id;

  -- Record in immutable event log for audit/replay
  PERFORM public.emit_decision_event(
    p_event_type := 'trend_run_requested',
    p_source_system := 'discovery',
    p_subject_type := 'segment_trend',
    p_subject_id := p_segment_id,
    p_payload := jsonb_build_object(
      'run_id', v_run.run_id,
      'segment_id', p_segment_id,
      'window', p_window,
      'lookback_hours', v_hours,
      'candidate_limit', GREATEST(1, LEAST(p_candidate_limit, 500)),
      'decision_job_id', v_job_id
    ),
    p_algorithm_version := p_algorithm_version,
    p_execution_context := jsonb_build_object('stage','enqueue','job_type','compute_trend_snapshot'),
    p_idempotency_key := COALESCE(p_idempotency_key, v_run.run_id::text),
    p_actor_type := 'system',
    p_actor_id := NULL
  );

  RETURN QUERY SELECT
    v_run.run_id::text,
    v_run.window_key,
    v_run.started_at,
    v_run.ended_at,
    v_run.status,
    v_run.inputs,
    v_run.outputs,
    v_run.reason_codes,
    v_run.notes;
END;
$$;

REVOKE ALL ON FUNCTION public.start_trend_run_v1(TEXT, TEXT, INT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_trend_run_v1(TEXT, TEXT, INT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.start_trend_run_v1 IS
  'Internal contract: creates a trend run record + enqueues a decision_jobs batch job + emits a decision_engine event.';
