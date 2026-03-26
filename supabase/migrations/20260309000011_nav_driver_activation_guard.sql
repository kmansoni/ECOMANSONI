-- =============================================================================
-- Navigation dispatch hardening: verified-only activation + zone/active composite index
-- =============================================================================

-- 1) Security baseline: unverified drivers must never stay active.
UPDATE public.nav_driver_profiles
SET is_active = false,
    updated_at = now()
WHERE is_active = true
  AND is_verified = false;

-- New profiles must be offline until verified.
ALTER TABLE public.nav_driver_profiles
  ALTER COLUMN is_active SET DEFAULT false;

ALTER TABLE public.nav_driver_profiles
  DROP CONSTRAINT IF EXISTS nav_driver_profiles_active_requires_verification;

ALTER TABLE public.nav_driver_profiles
  ADD CONSTRAINT nav_driver_profiles_active_requires_verification
  CHECK (NOT is_active OR is_verified);

-- 2) Dispatch lookup optimization requested in audit.
CREATE INDEX IF NOT EXISTS idx_driver_zone_active
  ON public.nav_driver_profiles(current_zone_id, is_active);

-- 3) Canonical SQL function for availability transitions with verification guard.
CREATE OR REPLACE FUNCTION public.nav_set_driver_availability(
  p_driver_id uuid,
  p_availability text
)
RETURNS TABLE(driver_id uuid, availability text, is_active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_verified boolean;
  v_is_active boolean;
BEGIN
  IF p_availability NOT IN ('online', 'offline', 'busy') THEN
    RAISE EXCEPTION 'Invalid availability: %', p_availability
      USING ERRCODE = '22023';
  END IF;

  v_is_active := (p_availability = 'online');

  SELECT dp.is_verified
    INTO v_is_verified
  FROM public.nav_driver_profiles dp
  WHERE dp.id = p_driver_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver profile not found: %', p_driver_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_is_active AND NOT v_is_verified THEN
    RAISE EXCEPTION 'Driver % is not verified and cannot be activated', p_driver_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.nav_driver_profiles
  SET is_active = v_is_active,
      updated_at = now()
  WHERE id = p_driver_id;

  RETURN QUERY
  SELECT p_driver_id, p_availability, v_is_active;
END;
$$;

REVOKE ALL ON FUNCTION public.nav_set_driver_availability(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nav_set_driver_availability(uuid, text) TO service_role;

COMMENT ON FUNCTION public.nav_set_driver_availability(uuid, text)
IS 'Sets driver availability with strict verification guard (online requires is_verified=true).';
