-- Fix: qualify trend_runs columns in PL/pgSQL functions
-- Because RETURNS TABLE adds OUT params (run_id/status/etc) which can conflict with column names.

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
  v_job_uuid UUID;
  v_job_status TEXT;
BEGIN
  v_hours := CASE p_window
    WHEN '1h' THEN 1
    WHEN '6h' THEN 6
    ELSE 24
  END;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT tr.* INTO v_run
    FROM public.trend_runs tr
    WHERE tr.idempotency_key = p_idempotency_key
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

  BEGIN
    SELECT e.job_id, e.status
      INTO v_job_uuid, v_job_status
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
    ) e;

    UPDATE public.trend_runs tr
       SET decision_job_id = v_job_uuid,
           updated_at = now()
     WHERE tr.run_id = v_run.run_id;
  EXCEPTION WHEN OTHERS THEN
    v_job_uuid := NULL;
    v_job_status := NULL;
  END;

  PERFORM public.emit_decision_event(
    p_event_type := 'trend_run_requested',
    p_source_system := 'discovery',
    p_subject_type := 'segment',
    p_subject_id := p_segment_id,
    p_payload := jsonb_build_object(
      'run_id', v_run.run_id,
      'segment_id', p_segment_id,
      'window', p_window,
      'lookback_hours', v_hours,
      'candidate_limit', GREATEST(1, LEAST(p_candidate_limit, 500)),
      'decision_job_id', v_job_uuid
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


CREATE OR REPLACE FUNCTION public.execute_trend_run_v1(
  p_run_id UUID
)
RETURNS TABLE (
  run_id TEXT,
  "window" TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  status TEXT,
  outputs JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.trend_runs;
  v_candidates TEXT[];
  v_now TIMESTAMPTZ := now();
  v_items JSONB := '[]'::jsonb;
  v_segment_id TEXT;
  v_algorithm_version TEXT;
  v_content_hash TEXT;
  v_snapshot_id UUID;
  v_version INT;
BEGIN
  SELECT tr.* INTO v_run
  FROM public.trend_runs tr
  WHERE tr.run_id = p_run_id
  LIMIT 1;

  IF v_run.run_id IS NULL THEN
    RAISE EXCEPTION 'ERR_NOT_FOUND';
  END IF;

  IF v_run.status <> 'running' THEN
    RETURN QUERY SELECT v_run.run_id::text, v_run.window_key, v_run.started_at, v_run.ended_at, v_run.status, v_run.outputs;
    RETURN;
  END IF;

  v_segment_id := v_run.segment_id;
  v_algorithm_version := v_run.algorithm_version;

  v_candidates := COALESCE(ARRAY(
    SELECT jsonb_array_elements_text(v_run.inputs->'candidate_hashtags')
  ), ARRAY[]::text[]);

  WITH scored AS (
    SELECT
      h.tag,
      h.normalized_tag,
      (
        LEAST(1.0, COALESCE(h.velocity_score, 0.0) / 50.0) * 0.60 +
        LEAST(1.0, COALESCE(h.usage_last_24h, 0)::numeric / 500.0) * 0.30 +
        LEAST(1.0, COALESCE(h.reels_count, 0)::numeric / 100.0) * 0.10
      )::numeric AS score
    FROM public.hashtags h
    WHERE h.status = 'normal'
      AND (array_length(v_candidates, 1) IS NULL OR h.tag = ANY(v_candidates))
    ORDER BY score DESC, h.velocity_score DESC NULLS LAST, h.usage_last_24h DESC
    LIMIT v_run.candidate_limit
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'trend_id', 'hashtag:' || scored.normalized_tag,
      'type', 'hashtag',
      'subject_id', scored.tag,
      'score', scored.score,
      'window', v_run.window_key,
      'generated_at', v_now,
      'flags', jsonb_build_array('rank.velocity')
    )
  ), '[]'::jsonb)
  INTO v_items
  FROM scored;

  UPDATE public.trend_runs tr
     SET outputs = jsonb_build_object('trend_items', v_items),
         status = 'succeeded',
         ended_at = v_now,
         claimed_by = NULL,
         claimed_at = NULL,
         claim_expires_at = NULL,
         updated_at = v_now
   WHERE tr.run_id = v_run.run_id
   RETURNING * INTO v_run;

  v_content_hash := encode(
    extensions.digest(
      convert_to(
        COALESCE(v_algorithm_version, '') || ':' || COALESCE(v_segment_id, '') || ':' || COALESCE(v_run.window_key, '') || ':' || v_items::text,
        'utf8'
      ),
      'sha256'::text
    ),
    'hex'
  );

  SELECT COALESCE(max(ds.version_number), 0) + 1
    INTO v_version
  FROM public.decision_snapshots ds
  WHERE ds.subject_type = 'segment_trend'
    AND ds.subject_id = v_segment_id;

  INSERT INTO public.decision_snapshots (
    subject_type,
    subject_id,
    decision_type,
    algorithm_version,
    version_number,
    score,
    confidence_score,
    trust_weight,
    breakdown,
    content_hash,
    source_events,
    execution_context,
    created_by,
    organization_id
  ) VALUES (
    'segment_trend',
    v_segment_id,
    'trend_score',
    v_algorithm_version,
    v_version,
    1.0,
    0.95,
    1.0,
    jsonb_build_object('trend_items', v_items, 'run_id', v_run.run_id),
    v_content_hash,
    ARRAY[]::uuid[],
    jsonb_build_object('run_id', v_run.run_id, 'window', v_run.window_key, 'mode', 'sync'),
    NULL,
    '00000000-0000-0000-0000-000000000000'::uuid
  )
  RETURNING snapshot_id INTO v_snapshot_id;

  BEGIN
    UPDATE public.decision_jobs dj
       SET status = 'completed',
           updated_at = now(),
           result_snapshot_id = v_snapshot_id,
           assigned_worker_id = COALESCE(v_run.claimed_by, 'trends-worker')
     WHERE dj.job_id = v_run.decision_job_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM public.emit_decision_event(
    p_event_type := 'trend_run_completed',
    p_source_system := 'discovery',
    p_subject_type := 'segment',
    p_subject_id := v_segment_id,
    p_payload := jsonb_build_object(
      'run_id', v_run.run_id,
      'status', v_run.status,
      'window', v_run.window_key,
      'snapshot_id', v_snapshot_id
    ),
    p_algorithm_version := v_algorithm_version,
    p_execution_context := jsonb_build_object('stage','complete','mode','sync'),
    p_idempotency_key := v_run.run_id::text || ':complete',
    p_actor_type := 'system',
    p_actor_id := NULL
  );

  RETURN QUERY SELECT v_run.run_id::text, v_run.window_key, v_run.started_at, v_run.ended_at, v_run.status, v_run.outputs;
END;
$$;

REVOKE ALL ON FUNCTION public.start_trend_run_v1(TEXT, TEXT, INT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_trend_run_v1(TEXT, TEXT, INT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.execute_trend_run_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_trend_run_v1(UUID) TO service_role;
