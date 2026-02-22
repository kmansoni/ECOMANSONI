-- =====================================================
-- Chat protocol v1.1: rollout journal/audit
-- =====================================================

CREATE TABLE IF NOT EXISTS public.chat_v11_rollout_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage TEXT NOT NULL,
  kill_switch BOOLEAN NOT NULL,
  note TEXT NULL,
  changed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'control_plane',
  CONSTRAINT chat_v11_rollout_journal_stage_chk
    CHECK (stage IN ('canary_1', 'canary_10', 'canary_50', 'full'))
);

CREATE INDEX IF NOT EXISTS idx_chat_v11_rollout_journal_changed_at
  ON public.chat_v11_rollout_journal (changed_at DESC);

ALTER TABLE public.chat_v11_rollout_journal ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.chat_log_v11_rollout_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.chat_v11_rollout_journal(stage, kill_switch, note, changed_by, changed_at, source)
  VALUES (
    NEW.stage,
    NEW.kill_switch,
    NEW.note,
    NEW.updated_by,
    NEW.updated_at,
    'control_plane'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_v11_rollout_journal ON public.chat_v11_rollout_control;
CREATE TRIGGER trg_chat_v11_rollout_journal
AFTER INSERT OR UPDATE ON public.chat_v11_rollout_control
FOR EACH ROW
EXECUTE FUNCTION public.chat_log_v11_rollout_change();

-- Backfill initial snapshot from current control row if journal is empty
INSERT INTO public.chat_v11_rollout_journal(stage, kill_switch, note, changed_by, changed_at, source)
SELECT c.stage, c.kill_switch, c.note, c.updated_by, c.updated_at, 'backfill'
FROM public.chat_v11_rollout_control c
WHERE c.singleton_id = true
  AND NOT EXISTS (SELECT 1 FROM public.chat_v11_rollout_journal);

CREATE OR REPLACE FUNCTION public.chat_get_v11_rollout_history(
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
  stage TEXT,
  kill_switch BOOLEAN,
  note TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ,
  source TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    j.stage,
    j.kill_switch,
    j.note,
    j.changed_by,
    j.changed_at,
    j.source
  FROM public.chat_v11_rollout_journal j
  ORDER BY j.changed_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$$;

GRANT EXECUTE ON FUNCTION public.chat_get_v11_rollout_history(INTEGER) TO authenticated;

