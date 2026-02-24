-- Phase 1: L1.4 - Delegations with kid binding (P1 FIX)
-- Telegram-grade: scopes validated, tokens bound to keys

CREATE TABLE delegations(
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id)ON DELETE CASCADE,
  delegation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id)ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  scopes TEXT[]NOT NULL DEFAULT'{}',
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,service_id)REFERENCES service_identities(tenant_id,service_id)ON DELETE CASCADE
);

CREATE UNIQUE INDEX delegations_unique_active_idx ON delegations(tenant_id,user_id,service_id)WHERE revoked_at IS NULL;
CREATE INDEX delegations_tenant_user_idx ON delegations(tenant_id,user_id);
CREATE INDEX delegations_service_idx ON delegations(tenant_id,service_id);

CREATE TABLE delegation_tokens(
  tenant_id UUID NOT NULL,
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id UUID NOT NULL REFERENCES delegations(delegation_id)ON DELETE CASCADE,
  service_key_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  jti TEXT,
  nonce TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX delegation_tokens_delegation_idx ON delegation_tokens(delegation_id);
CREATE INDEX delegation_tokens_hash_idx ON delegation_tokens(token_hash);
CREATE INDEX delegation_tokens_purge_idx ON delegation_tokens(expires_at)WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION delegations_validate_scopes_trigger()
RETURNS TRIGGER AS $$ BEGIN PERFORM validate_scopes_v1(NEW.scopes);RETURN NEW;END;$$ LANGUAGE plpgsql;

CREATE TRIGGER delegations_scopes_validation BEFORE INSERT OR UPDATE OF scopes ON delegations FOR EACH ROW EXECUTE FUNCTION delegations_validate_scopes_trigger();

ALTER TABLE delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegation_tokens ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE ON delegations FROM anon,authenticated;
REVOKE ALL ON delegation_tokens FROM anon,authenticated;
GRANT SELECT ON delegations TO authenticated;

CREATE POLICY delegations_owner_read ON delegations FOR SELECT TO authenticated USING(user_id=auth.uid());

CREATE TRIGGER delegations_updated_at BEFORE UPDATE ON delegations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();