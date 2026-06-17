-- Content Core — SQL Migration 002
-- Outbox Events and Lifecycle Logs tables with indexes
-- Created: 2024-01-01

-- ============================================================================
-- OUTBOX_EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  aggregate_version BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_FLIGHT', 'DELIVERED', 'DEAD_LETTER')),
  worker_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- CONTAINER_LIFECYCLE_LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS container_lifecycle_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('listing', 'publication', 'asset', 'campaign', 'saga')),
  entity_id UUID NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor_type TEXT NOT NULL
    CHECK (actor_type IN ('user', 'service', 'system', 'moderation', 'policy')),
  actor_id UUID NOT NULL,
  reason TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  policy_decision_id UUID,
  moderation_decision_id UUID,
  request_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Outbox events indexes
CREATE INDEX IF NOT EXISTS idx_outbox_events_pending ON outbox_events(status, next_attempt_at)
  WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_outbox_events_in_flight ON outbox_events(status, lease_expires_at)
  WHERE status = 'IN_FLIGHT';
CREATE INDEX IF NOT EXISTS idx_outbox_events_idempotency ON outbox_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate ON outbox_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_created ON outbox_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_events_dead_letter ON outbox_events(status, created_at)
  WHERE status = 'DEAD_LETTER';

-- Lifecycle logs indexes
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_entity ON container_lifecycle_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_entity_id ON container_lifecycle_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_idempotency ON container_lifecycle_logs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_actor ON container_lifecycle_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_created ON container_lifecycle_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_policy ON container_lifecycle_logs(policy_decision_id)
  WHERE policy_decision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_moderation ON container_lifecycle_logs(moderation_decision_id)
  WHERE moderation_decision_id IS NOT NULL;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE TRIGGER outbox_events_updated_at
  BEFORE UPDATE ON outbox_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE outbox_events IS 'Transactional outbox for at-least-once event delivery with distributed locking';
COMMENT ON TABLE container_lifecycle_logs IS 'Audit log for entity state transitions with idempotency';
COMMENT ON COLUMN outbox_events.aggregate_version IS 'Version for consumer ordering guard';
COMMENT ON COLUMN outbox_events.lease_expires_at IS 'Distributed lock expiry for worker processing this event';
COMMENT ON COLUMN outbox_events.idempotency_key IS 'Unique key for idempotent event delivery';
COMMENT ON COLUMN container_lifecycle_logs.idempotency_key IS 'Unique key for idempotent transition logging';
COMMENT ON COLUMN container_lifecycle_logs.actor_type IS 'Who triggered the transition: user, service, system, moderation, policy';
