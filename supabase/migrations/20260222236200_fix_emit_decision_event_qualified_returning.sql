-- Fix: emit_decision_event ambiguous event_id in RETURNING
-- In plpgsql, RETURNS TABLE columns are variables; qualify RETURNING columns explicitly.

CREATE OR REPLACE FUNCTION public.emit_decision_event(
  p_event_type text,
  p_source_system text,
  p_subject_type text,
  p_subject_id text,
  p_payload jsonb,
  p_algorithm_version text,
  p_execution_context jsonb default '{}',
  p_idempotency_key text default null,
  p_actor_type text default 'system',
  p_actor_id uuid default null
)
RETURNS TABLE (
  event_id uuid,
  created_at timestamptz,
  stored_ok boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_event_id uuid;
  v_created_at timestamptz;
BEGIN
  v_org_id := '00000000-0000-0000-0000-000000000000'::uuid;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT (ir.result_payload->>'event_id')::uuid
      INTO v_event_id
    FROM public.idempotency_register ir
    WHERE ir.idempotency_key = p_idempotency_key
      AND ir.result_status = 'success'
    LIMIT 1;

    IF v_event_id IS NOT NULL THEN
      SELECT de.created_at
        INTO v_created_at
      FROM public.decision_engine_events de
      WHERE de.event_id = v_event_id
      LIMIT 1;

      RETURN QUERY SELECT v_event_id, v_created_at, TRUE;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.decision_engine_events (
    event_type,
    source_system,
    subject_type,
    subject_id,
    payload,
    algorithm_version,
    execution_context,
    idempotency_key,
    actor_type,
    actor_id,
    organization_id
  ) VALUES (
    p_event_type,
    p_source_system,
    p_subject_type,
    p_subject_id,
    p_payload,
    p_algorithm_version,
    p_execution_context,
    p_idempotency_key,
    p_actor_type,
    p_actor_id,
    v_org_id
  )
  RETURNING public.decision_engine_events.event_id,
            public.decision_engine_events.created_at
  INTO v_event_id, v_created_at;

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.idempotency_register (idempotency_key, result_status, result_payload, organization_id)
    VALUES (
      p_idempotency_key,
      'success',
      jsonb_build_object('event_id', v_event_id, 'created_at', v_created_at),
      v_org_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_event_id, v_created_at, TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.emit_decision_event TO service_role;
