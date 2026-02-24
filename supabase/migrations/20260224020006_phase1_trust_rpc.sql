-- Phase 1: L1.6 - Trust RPC functions
-- P1 FIX: Real rate limiting + JWT placeholder(app-layer recommended)

CREATE OR REPLACE FUNCTION calculate_trust_score_v1(p_actor_type actor_type,p_actor_id TEXT)
RETURNS NUMERIC(5,2) AS $$
DECLARE v_total NUMERIC(5,2):=50.00;v_events RECORD;v_time_factor NUMERIC;
BEGIN
  FOR v_events IN SELECT event_type,weight,created_at FROM risk_events 
    WHERE actor_type=p_actor_type AND actor_id=p_actor_id AND created_at>=now()-interval'90 days'ORDER BY created_at DESC LIMIT 100
  LOOP
    v_time_factor:=GREATEST(0.1,1.0-EXTRACT(epoch FROM(now()-v_events.created_at))/7776000.0);
    v_total:=v_total+(v_events.weight*v_time_factor);
  END LOOP;
  RETURN GREATEST(0,LEAST(100,v_total));
END;$$LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION enforce_rate_limit_v1(p_action TEXT,p_actor_type actor_type,p_actor_id TEXT,p_cost INT DEFAULT 1)
RETURNS BOOLEAN AS $$
DECLARE v_tier risk_tier;v_config RECORD;v_consumed INT;v_window_start TIMESTAMPTZ;v_temp_table TEXT;
BEGIN
  SELECT risk_tier INTO v_tier FROM trust_profiles WHERE actor_type=p_actor_type AND actor_id=p_actor_id;
  v_tier:=COALESCE(v_tier,'B');
  SELECT*INTO v_config FROM rate_limit_configs WHERE action=p_action AND enabled=true AND(tier=v_tier OR tier IS NULL)ORDER BY tier DESC NULLS LAST LIMIT 1;
  IF v_config IS NULL THEN RETURN true;END IF;
  v_window_start:=date_trunc('minute',now());
  v_temp_table:='rate_limit_consumption_'||p_action||'_'||v_tier;
  EXECUTE format('CREATE TEMP TABLE IF NOT EXISTS %I(actor_id TEXT,consumed INT,window_start TIMESTAMPTZ,PRIMARY KEY(actor_id,window_start))',v_temp_table);
  EXECUTE format('SELECT COALESCE(SUM(consumed),0)FROM %I WHERE actor_id=$1 AND window_start>=$2',v_temp_table)INTO v_consumed USING p_actor_id,v_window_start;
  IF v_consumed+p_cost>v_config.limit_value THEN RETURN false;END IF;
  EXECUTE format('INSERT INTO %I(actor_id,consumed,window_start)VALUES($1,$2,$3)ON CONFLICT(actor_id,window_start)DO UPDATE SET consumed=%I.consumed+$2',v_temp_table,v_temp_table)USING p_actor_id,p_cost,v_window_start;
  RETURN true;
END;$$LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION issue_delegation_token_v1(p_auth_context JSONB,p_service_id TEXT,p_scopes TEXT[],p_expires_minutes INT DEFAULT 60)
RETURNS TABLE(delegation_id UUID,token_jwt TEXT) AS $$
DECLARE v_user_id UUID;v_tenant_id UUID;v_delegation_id UUID;v_key BYTEA;v_payload JSONB;v_jwt TEXT:='JWT_GENERATION_REQUIRES_APP_LAYER_OR_PGJWT_EXTENSION';v_hash TEXT;
BEGIN
  PERFORM assert_actor_context_v1(p_auth_context);
  v_user_id:=COALESCE((p_auth_context->>'user_id')::UUID,auth.uid());
  v_tenant_id:=get_user_tenant_id_v1(v_user_id);
  IF NOT enforce_rate_limit_v1('token:issue','user',v_user_id::TEXT,1)THEN RAISE EXCEPTION'rate_limit_exceeded'USING ERRCODE='P0026';END IF;
  PERFORM validate_scopes_v1(p_scopes);
  INSERT INTO delegations(tenant_id,user_id,service_id,scopes,expires_at)VALUES(v_tenant_id,v_user_id,p_service_id,p_scopes,now()+make_interval(mins=>p_expires_minutes))RETURNING delegations.delegation_id INTO v_delegation_id;
  v_payload:=jsonb_build_object('sub',v_user_id,'tenant_id',v_tenant_id,'service_id',p_service_id,'scopes',p_scopes,'exp',extract(epoch FROM now()+make_interval(mins=>p_expires_minutes)),'iat',extract(epoch FROM now()),'jti',gen_random_uuid());
  v_hash:=encode(digest(v_jwt,'sha256'),'hex');
  INSERT INTO delegation_tokens(tenant_id,delegation_id,service_key_id,token_hash,jti,expires_at)VALUES(v_tenant_id,v_delegation_id,'placeholder',v_hash,v_payload->>'jti',to_timestamp((v_payload->>'exp')::NUMERIC));
  RETURN QUERY SELECT v_delegation_id,v_jwt;
END;$$LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION revoke_delegation_v1(p_auth_context JSONB,p_delegation_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_user_id UUID;v_tenant_id UUID;
BEGIN
  PERFORM assert_actor_context_v1(p_auth_context);
  v_user_id:=COALESCE((p_auth_context->>'user_id')::UUID,auth.uid());
  v_tenant_id:=get_user_tenant_id_v1(v_user_id);
  UPDATE delegations SET revoked_at=now()WHERE delegation_id=p_delegation_id AND tenant_id=v_tenant_id AND user_id=v_user_id AND revoked_at IS NULL;
  IF NOT FOUND THEN RETURN false;END IF;
  UPDATE delegation_tokens SET revoked_at=now()WHERE delegation_id=p_delegation_id AND revoked_at IS NULL;
  RETURN true;
END;$$LANGUAGE plpgsql SECURITY DEFINER;