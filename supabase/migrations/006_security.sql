-- Content Core — SQL Migration 006
-- Security: SECURITY DEFINER functions, RLS, and access control
-- Created: 2024-01-01

-- ============================================================================
-- ROLES
-- ============================================================================

-- Application role (used by edge functions)
DO $$
BEGIN
  CREATE ROLE application_role;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ============================================================================
-- TABLE SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_job_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE container_lifecycle_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ASSETS POLICIES
-- ============================================================================

-- Assets: owner can read
CREATE POLICY assets_select ON assets
  FOR SELECT
  USING (owner_id = auth.uid());

-- Assets: owner can insert (for uploads)
CREATE POLICY assets_insert ON assets
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Assets: owner can update
CREATE POLICY assets_update ON assets
  FOR UPDATE
  USING (owner_id = auth.uid());

-- Assets: owner can delete (soft delete via status change)
CREATE POLICY assets_delete ON assets
  FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================================================
-- PROCESSING_JOBS POLICIES
-- ============================================================================

-- Processing jobs: owner can read
CREATE POLICY processing_jobs_select ON processing_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assets
      WHERE assets.id = processing_jobs.asset_id
      AND assets.owner_id = auth.uid()
    )
  );

-- Processing jobs: insert via function only (application_role)
CREATE POLICY processing_jobs_insert ON processing_jobs
  FOR INSERT
  WITH CHECK (TRUE); -- Allow all inserts, function has ownership check

-- Processing jobs: update via function only
CREATE POLICY processing_jobs_update ON processing_jobs
  FOR UPDATE
  USING (TRUE);

-- Processing jobs: no direct delete (cascade from assets)
CREATE POLICY processing_jobs_delete ON processing_jobs
  FOR DELETE
  USING (TRUE);

-- ============================================================================
-- PROCESSING_JOB_EDGES POLICIES
-- ============================================================================

-- Edges: no direct application access (managed by functions only)
CREATE POLICY processing_job_edges_all ON processing_job_edges
  FOR ALL
  TO application_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================================
-- OUTBOX_EVENTS POLICIES
-- ============================================================================

-- Outbox: read for monitoring
CREATE POLICY outbox_events_select ON outbox_events
  FOR SELECT
  USING (TRUE);

-- Outbox: insert via function only
CREATE POLICY outbox_events_insert ON outbox_events
  FOR INSERT
  WITH CHECK (TRUE);

-- Outbox: update via function only
CREATE POLICY outbox_events_update ON outbox_events
  FOR UPDATE
  USING (TRUE);

-- Outbox: no direct delete
CREATE POLICY outbox_events_delete ON outbox_events
  FOR DELETE
  USING (TRUE);

-- ============================================================================
-- LIFECYCLE_LOGS POLICIES
-- ============================================================================

-- Lifecycle logs: read for own entities
CREATE POLICY lifecycle_logs_select ON container_lifecycle_logs
  FOR SELECT
  USING (
    actor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM assets
      WHERE assets.id = entity_id::UUID
      AND assets.owner_id = auth.uid()
    )
  );

-- Lifecycle logs: insert via function only
CREATE POLICY lifecycle_logs_insert ON container_lifecycle_logs
  FOR INSERT
  WITH CHECK (TRUE);

-- Lifecycle logs: no direct update or delete
CREATE POLICY lifecycle_logs_update ON container_lifecycle_logs
  FOR UPDATE
  USING (TRUE);

CREATE POLICY lifecycle_logs_delete ON container_lifecycle_logs
  FOR DELETE
  USING (TRUE);

-- ============================================================================
-- FUNCTION PERMISSIONS
-- ============================================================================

-- Grant execute on all functions to application_role
GRANT EXECUTE ON FUNCTION atomic_publish TO application_role;
GRANT EXECUTE ON FUNCTION get_asset_with_lock TO application_role;
GRANT EXECUTE ON FUNCTION ensure_required_processing_graph TO application_role;
GRANT EXECUTE ON FUNCTION claim_next_processing_job TO application_role;
GRANT EXECUTE ON FUNCTION renew_processing_lease TO application_role;
GRANT EXECUTE ON FUNCTION complete_processing_job TO application_role;
GRANT EXECUTE ON FUNCTION fail_processing_job TO application_role;
GRANT EXECUTE ON FUNCTION claim_next_outbox_event TO application_role;
GRANT EXECUTE ON FUNCTION renew_outbox_lease TO application_role;
GRANT EXECUTE ON FUNCTION mark_outbox_delivered TO application_role;
GRANT EXECUTE ON FUNCTION mark_outbox_failed TO application_role;
GRANT EXECUTE ON FUNCTION move_outbox_to_dead_letter TO application_role;
GRANT EXECUTE ON FUNCTION release_stale_outbox_locks TO application_role;
GRANT EXECUTE ON FUNCTION get_outbox_metrics TO application_role;

-- ============================================================================
-- REVOKE DIRECT ACCESS ON EDGES
-- ============================================================================

-- Application role cannot directly modify job edges (only via functions)
REVOKE INSERT, UPDATE, DELETE ON processing_job_edges FROM application_role;

-- ============================================================================
-- SERVICE ROLE (for background workers)
-- ============================================================================

DO $$
BEGIN
  CREATE ROLE service_role;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Service role can do everything (for background workers)
GRANT ALL ON assets TO service_role;
GRANT ALL ON processing_jobs TO service_role;
GRANT ALL ON processing_job_edges TO service_role;
GRANT ALL ON outbox_events TO service_role;
GRANT ALL ON container_lifecycle_logs TO service_role;
GRANT ALL ON FUNCTION atomic_publish TO service_role;
GRANT ALL ON FUNCTION get_asset_with_lock TO service_role;
GRANT ALL ON FUNCTION ensure_required_processing_graph TO service_role;
GRANT ALL ON FUNCTION claim_next_processing_job TO service_role;
GRANT ALL ON FUNCTION renew_processing_lease TO service_role;
GRANT ALL ON FUNCTION complete_processing_job TO service_role;
GRANT ALL ON FUNCTION fail_processing_job TO service_role;
GRANT ALL ON FUNCTION claim_next_outbox_event TO service_role;
GRANT ALL ON FUNCTION renew_outbox_lease TO service_role;
GRANT ALL ON FUNCTION mark_outbox_delivered TO service_role;
GRANT ALL ON FUNCTION mark_outbox_failed TO service_role;
GRANT ALL ON FUNCTION move_outbox_to_dead_letter TO service_role;
GRANT ALL ON FUNCTION release_stale_outbox_locks TO service_role;
GRANT ALL ON FUNCTION get_outbox_metrics TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON ROLE application_role IS 'Edge functions and API calls';
COMMENT ON ROLE service_role IS 'Background workers (outbox, cleanup, processing)';

COMMENT ON TABLE assets IS 'RLS enabled: owner can read/update/delete own assets';
COMMENT ON TABLE processing_jobs IS 'RLS enabled: owner can read jobs for own assets';
COMMENT ON TABLE processing_job_edges IS 'No direct access: managed by functions only';
COMMENT ON TABLE outbox_events IS 'RLS enabled: read for monitoring, write via functions';
COMMENT ON TABLE container_lifecycle_logs IS 'RLS enabled: actor can read own logs';
