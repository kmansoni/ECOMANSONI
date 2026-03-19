-- Restore profiles SELECT policy that was dropped in 20260313184432_critical_security_hardening_v1.sql
-- without a replacement. This caused direct queries to profiles (used in UserProfilePage)
-- to return empty results for all authenticated users.
-- RPC search_user_profiles was unaffected because it uses SECURITY DEFINER.

DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);
