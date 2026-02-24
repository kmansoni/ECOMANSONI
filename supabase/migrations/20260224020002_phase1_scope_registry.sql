-- Phase 1: L1.2 - Scope registry with validation
-- Telegram-grade scope enforcement: NO wildcards, SSOT validation

CREATE TABLE scope_definitions (
  scope TEXT PRIMARY KEY,
  description TEXT,
  is_delegable BOOLEAN NOT NULL DEFAULT true,
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION validate_scopes_v1(p_scopes TEXT[])
RETURNS VOID
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_scope TEXT;
BEGIN
  IF p_scopes IS NULL OR array_length(p_scopes, 1) IS NULL THEN
    RETURN;
  END IF;

  FOREACH v_scope IN ARRAY p_scopes
  LOOP
    IF v_scope = '*' OR v_scope LIKE '%*%' THEN
      RAISE EXCEPTION 'scope_wildcard_forbidden: %', v_scope USING ERRCODE = 'P0004';
    END IF;

    IF trim(v_scope) = '' THEN
      RAISE EXCEPTION 'scope_empty' USING ERRCODE = 'P0005';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM scope_definitions sd
       WHERE sd.scope = v_scope
         AND sd.is_delegable = true
    ) THEN
      RAISE EXCEPTION 'scope_unknown_or_not_delegable: %', v_scope USING ERRCODE = 'P0006';
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE scope_definitions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON scope_definitions TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON scope_definitions FROM anon, authenticated;

CREATE POLICY scope_definitions_read_all ON scope_definitions
  FOR SELECT TO anon, authenticated
  USING (true);
