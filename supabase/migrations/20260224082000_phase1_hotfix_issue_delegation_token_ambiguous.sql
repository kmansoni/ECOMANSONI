-- Phase 1 hotfix: fix ambiguous delegation_id in issue_delegation_token_v1
-- Root cause: RETURNS TABLE(delegation_id, ...) creates output variables that can conflict.
-- Fix: assign to output variables explicitly and RETURN NEXT.

CREATE OR REPLACE FUNCTION issue_delegation_token_v1(
  p_auth_context JSONB,
  p_service_id TEXT,
  p_scopes TEXT[],
  p_expires_minutes INT DEFAULT 60
)
RETURNS TABLE(delegation_id UUID, token_jwt TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_delegation_id UUID;
  v_payload JSONB;
  v_jwt TEXT := 'JWT_GENERATION_REQUIRES_APP_LAYER_OR_PGJWT_EXTENSION';
  v_hash TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  PERFORM assert_actor_context_v1(p_auth_context);

  v_user_id := COALESCE((p_auth_context->>'user_id')::UUID, auth.uid());
  v_tenant_id := get_user_tenant_id_v1(v_user_id);

  IF NOT enforce_rate_limit_v1('token:issue', 'user', v_user_id::TEXT, 1) THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = 'P0026';
  END IF;

  PERFORM validate_scopes_v1(p_scopes);

  v_expires_at := now() + make_interval(mins => p_expires_minutes);

  SELECT d.delegation_id
    INTO v_delegation_id
    FROM delegations d
   WHERE d.tenant_id = v_tenant_id
     AND d.user_id = v_user_id
     AND d.service_id = p_service_id
     AND d.revoked_at IS NULL
   LIMIT 1;

  IF v_delegation_id IS NULL THEN
    INSERT INTO delegations(tenant_id, user_id, service_id, scopes, expires_at)
    VALUES (v_tenant_id, v_user_id, p_service_id, p_scopes, v_expires_at)
    RETURNING delegation_id INTO v_delegation_id;
  ELSE
    UPDATE delegations
       SET scopes = p_scopes,
           expires_at = v_expires_at,
           updated_at = now()
     WHERE delegations.delegation_id = v_delegation_id;
  END IF;

  v_payload := jsonb_build_object(
    'sub', v_user_id,
    'tenant_id', v_tenant_id,
    'service_id', p_service_id,
    'scopes', p_scopes,
    'exp', extract(epoch FROM v_expires_at),
    'iat', extract(epoch FROM now()),
    'jti', gen_random_uuid()
  );

  v_hash := encode(digest(v_jwt, 'sha256'), 'hex');

  INSERT INTO delegation_tokens(tenant_id, delegation_id, service_key_id, token_hash, jti, expires_at)
  VALUES (v_tenant_id, v_delegation_id, 'placeholder', v_hash, v_payload->>'jti', to_timestamp((v_payload->>'exp')::NUMERIC));

  delegation_id := v_delegation_id;
  token_jwt := v_jwt;
  RETURN NEXT;
  RETURN;
END;
$$;
