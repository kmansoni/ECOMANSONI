-- Fix: execute_trend_run_v1 snapshot insert must match decision_snapshots schema

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

  -- Snapshot is best-effort: if anything fails, run still returns succeeded.
  BEGIN
    INSERT INTO public.decision_snapshots (
      subject_type,
      subject_id,
      organization_id,
      version_number,
      algorithm_version,
      snapshot_timestamp,
      decision_type,
      decision_payload,
      source_events,
      content_hash,
      confidence_score,
      trust_weight,
      is_provisional
    ) VALUES (
      'segment_trend',
      v_segment_id,
      '00000000-0000-0000-0000-000000000000'::uuid,
      v_version,
      v_algorithm_version,
      v_now,
      'trend_score',
      jsonb_build_object(
        'run_id', v_run.run_id,
        'window', v_run.window_key,
        'segment_id', v_segment_id,
        'trend_items', v_items
      ),
      '[]'::jsonb,
      v_content_hash,
      0.95,
      1.0,
      false
    )
    RETURNING snapshot_id INTO v_snapshot_id;

    UPDATE public.decision_jobs dj
       SET status = 'completed',
           updated_at = now(),
           result_snapshot_id = v_snapshot_id,
           assigned_worker_id = COALESCE(v_run.claimed_by, 'trends-worker')
     WHERE dj.job_id = v_run.decision_job_id;
  EXCEPTION WHEN OTHERS THEN
    v_snapshot_id := NULL;
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

REVOKE ALL ON FUNCTION public.execute_trend_run_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_trend_run_v1(UUID) TO service_role;
