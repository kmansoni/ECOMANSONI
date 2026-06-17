-- Content Core — SQL Migration 007
-- Compensation Sagas table for durable persistence
-- Created: 2024-01-01

-- ============================================================================
-- COMPENSATION_SAGAS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS compensation_sagas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saga_type TEXT NOT NULL,
  trigger_event_id TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'requires_manual_review', 'dead_letter')),
  context JSONB NOT NULL DEFAULT '{}',
  container_id UUID,
  asset_id UUID,
  content_item_id UUID,
  steps JSONB NOT NULL DEFAULT '[]',
  current_step INT NOT NULL DEFAULT 0,
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Fast lookup by trigger event (for deduplication)
CREATE INDEX IF NOT EXISTS idx_sagas_trigger_event ON compensation_sagas(trigger_event_id);

-- Fast lookup by status (for worker queries)
CREATE INDEX IF NOT EXISTS idx_sagas_status ON compensation_sagas(status);

-- Fast lookup by container
CREATE INDEX IF NOT EXISTS idx_sagas_container ON compensation_sagas(container_id)
  WHERE container_id IS NOT NULL;

-- Fast lookup by content item
CREATE INDEX IF NOT EXISTS idx_sagas_content_item ON compensation_sagas(content_item_id)
  WHERE content_item_id IS NOT NULL;

-- Find sagas needing recovery
CREATE INDEX IF NOT EXISTS idx_sagas_needing_review ON compensation_sagas(status, updated_at)
  WHERE status = 'requires_manual_review';

-- Dead letter cleanup
CREATE INDEX IF NOT EXISTS idx_sagas_dead_letter ON compensation_sagas(status, created_at)
  WHERE status = 'dead_letter';

-- ============================================================================
-- TRIGGER
-- ============================================================================

CREATE OR REPLACE TRIGGER compensation_sagas_updated_at
  BEFORE UPDATE ON compensation_sagas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTION: upsert_saga
-- ============================================================================
-- Idempotent saga persistence with ON CONFLICT
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_saga(
  p_id UUID,
  p_saga_type TEXT,
  p_trigger_event_id TEXT,
  p_trigger_reason TEXT,
  p_status TEXT,
  p_context JSONB,
  p_container_id UUID,
  p_asset_id UUID,
  p_content_item_id UUID,
  p_steps JSONB,
  p_current_step INT,
  p_retry_count INT,
  p_last_error TEXT,
  p_started_at TIMESTAMPTZ,
  p_completed_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO compensation_sagas (
    id, saga_type, trigger_event_id, trigger_reason, status,
    context, container_id, asset_id, content_item_id,
    steps, current_step, retry_count, last_error,
    started_at, completed_at, created_at, updated_at
  ) VALUES (
    p_id, p_saga_type, p_trigger_event_id, p_trigger_reason, p_status,
    p_context, p_container_id, p_asset_id, p_content_item_id,
    p_steps, p_current_step, p_retry_count, p_last_error,
    p_started_at, p_completed_at, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    steps = EXCLUDED.steps,
    current_step = EXCLUDED.current_step,
    retry_count = EXCLUDED.retry_count,
    last_error = EXCLUDED.last_error,
    completed_at = EXCLUDED.completed_at,
    updated_at = NOW();
END;
$$;

-- ============================================================================
-- FUNCTION: find_saga_by_trigger
-- ============================================================================
-- For deduplication: check if saga already exists for trigger event
-- ============================================================================

CREATE OR REPLACE FUNCTION find_saga_by_trigger(
  p_trigger_event_id TEXT
)
RETURNS TABLE (
  id UUID,
  status TEXT,
  steps JSONB,
  current_step INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.status, s.steps, s.current_step
  FROM compensation_sagas s
  WHERE s.trigger_event_id = p_trigger_event_id
  AND s.status != 'dead_letter'
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;

-- ============================================================================
-- FUNCTION: find_running_sagas
-- ============================================================================
-- Find sagas that were running when worker crashed
-- ============================================================================

CREATE OR REPLACE FUNCTION find_running_sagas(
  p_stale_after_minutes INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  saga_type TEXT,
  trigger_event_id TEXT,
  steps JSONB,
  current_step INT,
  last_error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.saga_type,
    s.trigger_event_id,
    s.steps,
    s.current_step,
    s.last_error
  FROM compensation_sagas s
  WHERE s.status = 'running'
  AND s.updated_at < NOW() - (p_stale_after_minutes || ' minutes')::INTERVAL
  ORDER BY s.updated_at ASC
  LIMIT 100;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE compensation_sagas IS 'Durable saga state — survives worker restarts. Workers MUST persist after each step.';
COMMENT ON COLUMN compensation_sagas.trigger_event_id IS 'For deduplication: prevents starting duplicate sagas';
COMMENT ON COLUMN compensation_sagas.steps IS 'JSONB array of CompensationStep objects';
COMMENT ON FUNCTION upsert_saga IS 'Idempotent saga persistence with ON CONFLICT DO UPDATE';
COMMENT ON FUNCTION find_saga_by_trigger IS 'Deduplication check before creating new saga';
COMMENT ON FUNCTION find_running_sagas IS 'Recovery: find sagas that need resumption after worker crash';

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE compensation_sagas ENABLE ROW LEVEL SECURITY;

-- Background workers can do everything
CREATE POLICY compensation_sagas_all ON compensation_sagas
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Application role can read for monitoring
CREATE POLICY compensation_sagas_select ON compensation_sagas
  FOR SELECT
  USING (TRUE);

-- Grant permissions
GRANT ALL ON compensation_sagas TO service_role;
GRANT SELECT ON compensation_sagas TO application_role;
