-- Phase 1: L1.5 - Trust core tables

CREATE TYPE risk_tier AS ENUM('A','B','C','D');
CREATE TYPE enforcement_level AS ENUM('E0','E1','E2','E3','E4','E5');
CREATE TYPE actor_type AS ENUM('user','device','ip','org','service');

CREATE TABLE trust_profiles(
  actor_type actor_type NOT NULL,
  actor_id TEXT NOT NULL,
  trust_score NUMERIC(5,2)NOT NULL DEFAULT 50.00 CHECK(trust_score>=0 AND trust_score<=100),
  risk_tier risk_tier NOT NULL DEFAULT'B',
  enforcement_level enforcement_level NOT NULL DEFAULT'E0',
  signals JSONB NOT NULL DEFAULT'{}',
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_type,actor_id)
);

CREATE INDEX trust_profiles_tier_idx ON trust_profiles(risk_tier);
CREATE INDEX trust_profiles_enforcement_idx ON trust_profiles(enforcement_level);

CREATE TABLE risk_events(
  event_id BIGSERIAL PRIMARY KEY,
  actor_type actor_type NOT NULL,
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  weight NUMERIC(5,2)NOT NULL DEFAULT 0,
  meta JSONB,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX risk_events_actor_idx ON risk_events(actor_type,actor_id);
CREATE INDEX risk_events_created_idx ON risk_events(created_at DESC);
CREATE UNIQUE INDEX risk_events_request_idx ON risk_events(request_id)WHERE request_id IS NOT NULL;

CREATE TABLE rate_limit_configs(
  config_id SERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  tier risk_tier,
  action TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT'token_bucket'CHECK(algorithm IN('token_bucket','fixed_window','sliding_window')),
  limit_value INT NOT NULL CHECK(limit_value>0),
  window_seconds INT NOT NULL CHECK(window_seconds>0),
  burst INT,
  cost_per_action INT NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX rate_limit_configs_unique_idx ON rate_limit_configs(scope,tier,action);
CREATE INDEX rate_limit_configs_action_idx ON rate_limit_configs(action)WHERE enabled=true;

ALTER TABLE trust_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_configs ENABLE ROW LEVEL SECURITY;

REVOKE INSERT,UPDATE,DELETE ON trust_profiles FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON risk_events FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON rate_limit_configs FROM anon,authenticated;

GRANT SELECT ON trust_profiles TO authenticated;
GRANT SELECT ON rate_limit_configs TO anon,authenticated;

CREATE POLICY trust_profiles_owner_read ON trust_profiles FOR SELECT TO authenticated USING(actor_type='user'AND actor_id=auth.uid()::TEXT);
CREATE POLICY rate_limit_configs_read_all ON rate_limit_configs FOR SELECT TO anon,authenticated USING(enabled=true);

CREATE TRIGGER rate_limit_configs_updated_at BEFORE UPDATE ON rate_limit_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();