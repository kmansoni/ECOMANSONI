-- ============================================================
-- BUG FIX #1: Enable RLS on custom auth tables
-- auth_accounts, auth_devices, auth_sessions, auth_audit_events,
-- device_active_account — contain passwords/tokens/hashes.
-- All access is via security-definer RPCs (service_role),
-- so hard-blocking anon/authenticated direct access is correct.
-- ============================================================

ALTER TABLE public.auth_accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_accounts       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.auth_devices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_devices        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.auth_audit_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_audit_events   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.device_active_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_active_account FORCE ROW LEVEL SECURITY;

-- Drop any stale policies first (idempotent)
DROP POLICY IF EXISTS "service_role_all" ON public.auth_accounts;
DROP POLICY IF EXISTS "service_role_all" ON public.auth_devices;
DROP POLICY IF EXISTS "service_role_all" ON public.auth_sessions;
DROP POLICY IF EXISTS "service_role_all" ON public.auth_audit_events;
DROP POLICY IF EXISTS "service_role_all" ON public.device_active_account;

-- Single policy: service_role only (all RPCs use service_role client)
CREATE POLICY "service_role_all" ON public.auth_accounts
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.auth_devices
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.auth_sessions
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.auth_audit_events
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON public.device_active_account
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ============================================================
-- BUG FIX #2: Add missing telemetry_events partitions
-- Current: only 2026_h1 (Jan–Jul) and 2026_h2 (Jul–Dec 2026).
-- Any INSERT with event_time >= 2027-01-01 would crash with:
--   "no partition of relation found for row"
-- Add yearly partitions for 2027 and 2028 as a safe buffer.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.telemetry_events_2027_h1
  PARTITION OF public.telemetry_events
  FOR VALUES FROM ('2027-01-01') TO ('2027-07-01');

CREATE TABLE IF NOT EXISTS public.telemetry_events_2027_h2
  PARTITION OF public.telemetry_events
  FOR VALUES FROM ('2027-07-01') TO ('2028-01-01');

CREATE TABLE IF NOT EXISTS public.telemetry_events_2028_h1
  PARTITION OF public.telemetry_events
  FOR VALUES FROM ('2028-01-01') TO ('2028-07-01');

CREATE TABLE IF NOT EXISTS public.telemetry_events_2028_h2
  PARTITION OF public.telemetry_events
  FOR VALUES FROM ('2028-07-01') TO ('2029-01-01');

-- ============================================================
-- BUG FIX #3: feature_flags RLS
-- feature_flags controls rollout percentages for all users.
-- Without RLS any authenticated user could UPDATE the table
-- directly via PostgREST and self-enable features.
-- ============================================================

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all"    ON public.feature_flags;
DROP POLICY IF EXISTS "authenticated_read"  ON public.feature_flags;

-- Allow any authenticated user to READ flags (needed by is_feature_enabled_for_user_v1)
CREATE POLICY "authenticated_read" ON public.feature_flags
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

-- Only service_role can write
CREATE POLICY "service_role_write" ON public.feature_flags
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
