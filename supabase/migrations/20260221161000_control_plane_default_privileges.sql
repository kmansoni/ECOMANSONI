-- ============================================================================
-- SECURITY PATCH: default privileges hardening (functions)
--
-- Why:
--  - Postgres defaults often grant EXECUTE on newly created functions to PUBLIC.
--  - This is a common "returns in a month" hole for sensitive RPC.
--
-- What:
--  - For future functions created by the migration owner role in schema public,
--    revoke EXECUTE from PUBLIC by default.
--
-- NOTE:
--  - This does not change existing function privileges.
--  - This affects only future functions created by the same role.
--  - You MUST keep explicitly GRANTing EXECUTE to anon/authenticated where
--    appropriate in migrations for public RPCs.
-- ============================================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
