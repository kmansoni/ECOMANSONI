-- Phase 1: L1.7 - Retention cleanup functions
-- P0 FIX: pg_cron enabled(not commented)

CREATE OR REPLACE FUNCTION purge_delegation_tokens_v1()
RETURNS TABLE(purged_count BIGINT) AS $$
DECLARE v_deleted1 BIGINT; v_deleted2 BIGINT;
BEGIN
  DELETE FROM delegation_tokens WHERE revoked_at IS NOT NULL AND revoked_at<now()-interval'30 days';
  GET DIAGNOSTICS v_deleted1 = ROW_COUNT;
  DELETE FROM delegation_tokens WHERE expires_at<now()-interval'30 days'AND revoked_at IS NULL;
  GET DIAGNOSTICS v_deleted2 = ROW_COUNT;
  RETURN QUERY SELECT v_deleted1 + v_deleted2;
END;$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION purge_service_keys_v1()
RETURNS TABLE(purged_count BIGINT) AS $$
DECLARE v_deleted BIGINT;
BEGIN
  DELETE FROM service_keys WHERE revoked_at IS NOT NULL AND revoked_at<now()-interval'90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN QUERY SELECT v_deleted;
END;$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION purge_risk_events_v1()
RETURNS TABLE(purged_count BIGINT) AS $$
DECLARE v_deleted BIGINT;
BEGIN
  DELETE FROM risk_events WHERE created_at<now()-interval'365 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN QUERY SELECT v_deleted;
END;$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION cleanup_phase1_retention_v1()
RETURNS TABLE(tokens_purged BIGINT,keys_purged BIGINT,events_purged BIGINT) AS $$
DECLARE v_tokens BIGINT;v_keys BIGINT;v_events BIGINT;
BEGIN
  SELECT purged_count INTO v_tokens FROM purge_delegation_tokens_v1();
  SELECT purged_count INTO v_keys FROM purge_service_keys_v1();
  SELECT purged_count INTO v_events FROM purge_risk_events_v1();
  RAISE NOTICE'Phase1 cleanup: tokens=%,keys=%,events=%',v_tokens,v_keys,v_events;
  RETURN QUERY SELECT v_tokens,v_keys,v_events;
END;$$LANGUAGE plpgsql SECURITY DEFINER;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'phase1-cleanup-nightly',
  '0 2 * * *',
  $$SELECT cleanup_phase1_retention_v1()$$
);