-- Content Core — SQL Migration 001
-- Assets and Processing Jobs tables with indexes
-- Created: 2024-01-01

-- ============================================================================
-- ASSETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'DELETED')),
  aggregate_version BIGINT NOT NULL DEFAULT 0,
  storage_key TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PROCESSING_JOBS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL
    CHECK (job_type IN (
      'PROBE', 'THUMBNAIL', 'BLURHASH', 'COVER',
      'TRANSCODE', 'CAPTIONS', 'WAVEFORM'
    )),
  status TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'IN_PROGRESS', 'DONE', 'FAILED', 'SKIPPED')),
  priority INT NOT NULL DEFAULT 50,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  queued_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  worker_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id, job_type)
);

-- ============================================================================
-- PROCESSING_JOB_EDGES TABLE (DAG)
-- ============================================================================

CREATE TABLE IF NOT EXISTS processing_job_edges (
  parent_job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
  child_job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_job_id, child_job_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Assets indexes
CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner_id);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_idempotency ON assets(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_created ON assets(created_at DESC);

-- Processing jobs indexes
CREATE INDEX IF NOT EXISTS idx_processing_jobs_asset_type ON processing_jobs(asset_id, job_type);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_queue ON processing_jobs(status, priority DESC)
  WHERE status = 'QUEUED';
CREATE INDEX IF NOT EXISTS idx_processing_jobs_asset_status ON processing_jobs(asset_id, status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_worker ON processing_jobs(worker_id)
  WHERE worker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_processing_jobs_lease ON processing_jobs(lease_expires_at)
  WHERE lease_expires_at IS NOT NULL AND status = 'IN_PROGRESS';

-- Processing job edges indexes
CREATE INDEX IF NOT EXISTS idx_processing_edges_parent ON processing_job_edges(parent_job_id);
CREATE INDEX IF NOT EXISTS idx_processing_edges_child ON processing_job_edges(child_job_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER processing_jobs_updated_at
  BEFORE UPDATE ON processing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE assets IS 'Media assets with optimistic locking via aggregate_version';
COMMENT ON TABLE processing_jobs IS 'Processing job queue with DAG dependencies via processing_job_edges';
COMMENT ON TABLE processing_job_edges IS 'DAG edges for processing job dependencies';
COMMENT ON COLUMN assets.aggregate_version IS 'Optimistic locking version, incremented on each state change';
COMMENT ON COLUMN assets.idempotency_key IS 'Unique key for idempotent upload operations';
COMMENT ON COLUMN processing_jobs.job_type IS 'Type of processing: PROBE (required), THUMBNAIL, BLURHASH, COVER, TRANSCODE, CAPTIONS, WAVEFORM';
COMMENT ON COLUMN processing_jobs.is_required IS 'If true, job must complete before asset is considered READY';
COMMENT ON COLUMN processing_jobs.lease_expires_at IS 'Distributed lock expiry for worker claiming this job';
