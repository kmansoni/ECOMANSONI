-- Phase 1 EPIC L: Rate Limit Audits Table
-- Tracks every rate limit decision for compliance + analytics

CREATE TABLE IF NOT EXISTS rate_limit_audits(
  audit_id BIGSERIAL PRIMARY KEY,
  actor_type actor_type NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  tokens_available NUMERIC(10,2),
  tokens_consumed NUMERIC(10,2),
  request_id TEXT,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX rate_limit_audits_actor_idx ON rate_limit_audits(actor_type, actor_id, action);
CREATE INDEX rate_limit_audits_action_idx ON rate_limit_audits(action);
CREATE INDEX rate_limit_audits_created_idx ON rate_limit_audits(created_at DESC);
CREATE INDEX rate_limit_audits_request_idx ON rate_limit_audits(request_id) WHERE request_id IS NOT NULL;

-- Prevent public access
ALTER TABLE rate_limit_audits ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE ON rate_limit_audits FROM anon,authenticated;
-- Only service role can write audit logs
CREATE POLICY rate_limit_audits_service_write ON rate_limit_audits FOR INSERT TO service_role WITH CHECK(true);
CREATE POLICY rate_limit_audits_read_own ON rate_limit_audits FOR SELECT TO authenticated USING(actor_type='user' AND actor_id=auth.uid()::TEXT);
