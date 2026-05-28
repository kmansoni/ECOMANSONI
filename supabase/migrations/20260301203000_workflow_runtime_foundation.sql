-- Stage 2 / Item #43 foundation: Workflow builder runtime (event -> condition -> action)

CREATE TABLE IF NOT EXISTS public.integration_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_event text NOT NULL,
  condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  action jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.integration_workflows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'success', 'failed', 'cancelled')),
  error text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_workflows_user_active
  ON public.integration_workflows(user_id, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_status
  ON public.workflow_runs(workflow_id, status, queued_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_status
  ON public.workflow_runs(user_id, status, queued_at DESC);
ALTER TABLE public.integration_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "integration_workflows_select_own" ON public.integration_workflows;
CREATE POLICY "integration_workflows_select_own"
ON public.integration_workflows
FOR SELECT
USING (user_id = auth.uid());
DROP POLICY IF EXISTS "integration_workflows_insert_own" ON public.integration_workflows;
CREATE POLICY "integration_workflows_insert_own"
ON public.integration_workflows
FOR INSERT
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "integration_workflows_update_own" ON public.integration_workflows;
CREATE POLICY "integration_workflows_update_own"
ON public.integration_workflows
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "integration_workflows_delete_own" ON public.integration_workflows;
CREATE POLICY "integration_workflows_delete_own"
ON public.integration_workflows
FOR DELETE
USING (user_id = auth.uid());
DROP POLICY IF EXISTS "workflow_runs_select_own" ON public.workflow_runs;
CREATE POLICY "workflow_runs_select_own"
ON public.workflow_runs
FOR SELECT
USING (user_id = auth.uid());
DROP POLICY IF EXISTS "workflow_runs_insert_own" ON public.workflow_runs;
CREATE POLICY "workflow_runs_insert_own"
ON public.workflow_runs
FOR INSERT
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "workflow_runs_update_own" ON public.workflow_runs;
CREATE POLICY "workflow_runs_update_own"
ON public.workflow_runs
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.integration_workflows_set_updated_at_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_integration_workflows_set_updated_at ON public.integration_workflows;
CREATE TRIGGER trg_integration_workflows_set_updated_at
BEFORE UPDATE ON public.integration_workflows
FOR EACH ROW
EXECUTE FUNCTION public.integration_workflows_set_updated_at_v1();
CREATE OR REPLACE FUNCTION public.workflow_runs_set_updated_at_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_workflow_runs_set_updated_at ON public.workflow_runs;
CREATE TRIGGER trg_workflow_runs_set_updated_at
BEFORE UPDATE ON public.workflow_runs
FOR EACH ROW
EXECUTE FUNCTION public.workflow_runs_set_updated_at_v1();
CREATE OR REPLACE FUNCTION public.workflow_create_v1(
  _name text,
  _trigger_event text,
  _condition jsonb DEFAULT '{}'::jsonb,
  _action jsonb DEFAULT '{}'::jsonb,
  _is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _id uuid;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _name IS NULL OR btrim(_name) = '' THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  IF _trigger_event IS NULL OR btrim(_trigger_event) = '' THEN
    RAISE EXCEPTION 'invalid_trigger_event' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.integration_workflows (
    user_id,
    name,
    trigger_event,
    condition,
    action,
    is_active
  )
  VALUES (
    _actor_id,
    btrim(_name),
    btrim(_trigger_event),
    COALESCE(_condition, '{}'::jsonb),
    COALESCE(_action, '{}'::jsonb),
    COALESCE(_is_active, true)
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;
CREATE OR REPLACE FUNCTION public.workflow_toggle_v1(
  _id uuid,
  _is_active boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _id IS NULL OR _is_active IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;

  UPDATE public.integration_workflows iw
  SET is_active = _is_active,
      updated_at = now()
  WHERE iw.id = _id
    AND iw.user_id = _actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow_not_found' USING ERRCODE = '22023';
  END IF;

  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.workflow_delete_v1(
  _id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _id IS NULL THEN
    RAISE EXCEPTION 'invalid_id' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.integration_workflows iw
  WHERE iw.id = _id
    AND iw.user_id = _actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow_not_found' USING ERRCODE = '22023';
  END IF;

  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.workflow_run_enqueue_v1(
  _workflow_id uuid,
  _event_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _run_id uuid;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _workflow_id IS NULL THEN
    RAISE EXCEPTION 'invalid_workflow_id' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.integration_workflows iw
    WHERE iw.id = _workflow_id
      AND iw.user_id = _actor_id
      AND iw.is_active = true
  ) THEN
    RAISE EXCEPTION 'workflow_not_active_or_not_found' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.workflow_runs (
    workflow_id,
    user_id,
    event_payload,
    status
  )
  VALUES (
    _workflow_id,
    _actor_id,
    COALESCE(_event_payload, '{}'::jsonb),
    'queued'
  )
  RETURNING id INTO _run_id;

  RETURN _run_id;
END;
$$;
REVOKE ALL ON FUNCTION public.workflow_create_v1(text, text, jsonb, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workflow_toggle_v1(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workflow_delete_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workflow_run_enqueue_v1(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workflow_create_v1(text, text, jsonb, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workflow_toggle_v1(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workflow_delete_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workflow_run_enqueue_v1(uuid, jsonb) TO authenticated;
