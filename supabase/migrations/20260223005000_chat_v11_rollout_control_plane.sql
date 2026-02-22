-- =====================================================
-- Chat protocol v1.1: rollout control plane
-- - singleton rollout state
-- - service-role write RPC
-- - authenticated read RPC with release-gate recommendation
-- =====================================================

CREATE TABLE IF NOT EXISTS public.chat_v11_rollout_control (
  singleton_id BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton_id = true),
  stage TEXT NOT NULL DEFAULT 'canary_1',
  kill_switch BOOLEAN NOT NULL DEFAULT false,
  note TEXT NULL,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_v11_rollout_control_stage_chk
    CHECK (stage IN ('canary_1', 'canary_10', 'canary_50', 'full'))
);

ALTER TABLE public.chat_v11_rollout_control ENABLE ROW LEVEL SECURITY;

INSERT INTO public.chat_v11_rollout_control(singleton_id, stage, kill_switch, note)
VALUES (true, 'canary_1', false, 'initial')
ON CONFLICT (singleton_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.chat_get_v11_rollout_state()
RETURNS TABLE(
  stage TEXT,
  kill_switch BOOLEAN,
  note TEXT,
  updated_at TIMESTAMPTZ,
  gate_rollout_ok BOOLEAN,
  rollout_decision TEXT,
  gate_p0_ok BOOLEAN,
  gate_p1_ok BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ctrl AS (
    SELECT c.stage, c.kill_switch, c.note, c.updated_at
    FROM public.chat_v11_rollout_control c
    WHERE c.singleton_id = true
    LIMIT 1
  ),
  gate AS (
    SELECT
      g.gate_rollout_ok,
      g.rollout_decision,
      g.gate_p0_ok,
      g.gate_p1_ok
    FROM public.chat_get_v11_release_gates() g
    LIMIT 1
  )
  SELECT
    ctrl.stage,
    ctrl.kill_switch,
    ctrl.note,
    ctrl.updated_at,
    gate.gate_rollout_ok,
    gate.rollout_decision,
    gate.gate_p0_ok,
    gate.gate_p1_ok
  FROM ctrl
  CROSS JOIN gate;
$$;

CREATE OR REPLACE FUNCTION public.chat_set_v11_rollout_state(
  p_stage TEXT,
  p_kill_switch BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS TABLE(
  stage TEXT,
  kill_switch BOOLEAN,
  note TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := auth.role();
BEGIN
  IF coalesce(v_role, '') <> 'service_role' THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN';
  END IF;

  IF p_stage IS NULL OR p_stage NOT IN ('canary_1', 'canary_10', 'canary_50', 'full') THEN
    RAISE EXCEPTION 'ERR_INVALID_ARGUMENT';
  END IF;

  INSERT INTO public.chat_v11_rollout_control(singleton_id, stage, kill_switch, note, updated_by, updated_at)
  VALUES (true, p_stage, coalesce(p_kill_switch, false), p_note, auth.uid(), now())
  ON CONFLICT (singleton_id)
  DO UPDATE SET
    stage = EXCLUDED.stage,
    kill_switch = EXCLUDED.kill_switch,
    note = EXCLUDED.note,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY
  SELECT c.stage, c.kill_switch, c.note, c.updated_at
  FROM public.chat_v11_rollout_control c
  WHERE c.singleton_id = true
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_get_v11_rollout_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_set_v11_rollout_state(TEXT, BOOLEAN, TEXT) TO service_role;

