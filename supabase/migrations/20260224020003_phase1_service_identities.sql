-- Phase 1: L1.3 - Service identities with ENCRYPTED keys (P0 FIX)
-- Telegram-grade: Multi-tenant isolation + key rotation + pgcrypto encryption

-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE service_identities (
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, service_id)
);

CREATE INDEX service_identities_tenant_idx ON service_identities(tenant_id);

CREATE TABLE service_keys (
  tenant_id UUID NOT NULL,
  service_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  key_type TEXT NOT NULL CHECK (key_type IN ('hmac','ed25519')),
  algorithm TEXT NOT NULL CHECK (
    (key_type = 'hmac' AND algorithm IN ('HS256','HS384','HS512')) OR
    (key_type = 'ed25519' AND algorithm = 'EdDSA')
  ),
  key_format TEXT NOT NULL DEFAULT 'raw' CHECK (key_format IN ('raw','pem','jwk')),
  key_material_encrypted BYTEA NOT NULL, -- pgcrypto encrypted
  encryption_key_id TEXT NOT NULL DEFAULT 'default',
  not_before TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, service_id, key_id),
  FOREIGN KEY (tenant_id, service_id) REFERENCES service_identities(tenant_id, service_id) ON DELETE CASCADE
);

CREATE INDEX service_keys_tenant_service_idx ON service_keys(tenant_id, service_id);
CREATE INDEX service_keys_revoked_idx ON service_keys(revoked_at) WHERE revoked_at IS NOT NULL;

ALTER TABLE service_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON service_identities FROM anon, authenticated;
REVOKE ALL ON service_keys FROM anon, authenticated;
GRANT SELECT ON service_identities TO authenticated;

CREATE POLICY service_identities_admin_read ON service_identities
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members tm
       WHERE tm.tenant_id = service_identities.tenant_id
         AND tm.user_id = auth.uid()
         AND tm.role IN ('owner', 'admin')
    )
  );

-- Encryption/decryption helpers (uses ENV var for key)
CREATE OR REPLACE FUNCTION encrypt_service_key_v1(p_plaintext TEXT)
RETURNS BYTEA
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_encryption_key TEXT;
BEGIN
  -- Get encryption key from ENV (set via Superbase secrets)
  v_encryption_key := current_setting('app.settings.service_key_encryption_secret', true);
  
  IF v_encryption_key IS NULL OR v_encryption_key = '' THEN
    RAISE EXCEPTION 'encryption_key_not_configured' USING ERRCODE = 'P0020';
  END IF;

  RETURN pgp_sym_encrypt(p_plaintext, v_encryption_key);
END;
$$;

CREATE OR REPLACE FUNCTION decrypt_service_key_v1(p_encrypted BYTEA)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_encryption_key TEXT;
BEGIN
  v_encryption_key := current_setting('app.settings.service_key_encryption_secret', true);
  
  IF v_encryption_key IS NULL THEN
    RAISE EXCEPTION 'encryption_key_not_configured' USING ERRCODE = 'P0020';
  END IF;

  RETURN pgp_sym_decrypt(p_encrypted, v_encryption_key);
END;
$$;

CREATE OR REPLACE FUNCTION assert_service_active_v1(p_tenant_id UUID, p_service_id TEXT)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
    FROM service_identities
   WHERE tenant_id = p_tenant_id
     AND service_id = p_service_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'service_not_found' USING ERRCODE = 'P0007';
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'service_not_active: %', v_status USING ERRCODE = 'P0008';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION get_service_key_v1(p_tenant_id UUID, p_service_id TEXT, p_key_id TEXT)
RETURNS TABLE (
  algorithm TEXT,
  key_format TEXT,
  key_material TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sk.algorithm, 
    sk.key_format, 
    decrypt_service_key_v1(sk.key_material_encrypted) as key_material,
    sk.expires_at
  FROM service_keys sk
  WHERE sk.tenant_id = p_tenant_id
    AND sk.service_id = p_service_id
    AND sk.key_id = p_key_id
    AND sk.revoked_at IS NULL
    AND (sk.not_before IS NULL OR sk.not_before <= now())
    AND (sk.expires_at IS NULL OR sk.expires_at > now());
END;
$$;

CREATE TRIGGER service_identities_updated_at BEFORE UPDATE ON service_identities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
