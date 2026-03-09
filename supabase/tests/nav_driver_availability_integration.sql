-- Integration assertions for navigation dispatch hardening.
-- Run after migrations are applied.

DO $$
DECLARE
  has_fn boolean;
  has_constraint boolean;
  has_idx boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'nav_set_driver_availability'
  ) INTO has_fn;

  IF NOT has_fn THEN
    RAISE EXCEPTION 'Missing function public.nav_set_driver_availability(uuid, text)';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nav_driver_profiles_active_requires_verification'
  ) INTO has_constraint;

  IF NOT has_constraint THEN
    RAISE EXCEPTION 'Missing constraint nav_driver_profiles_active_requires_verification';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_driver_zone_active'
  ) INTO has_idx;

  IF NOT has_idx THEN
    RAISE EXCEPTION 'Missing index idx_driver_zone_active';
  END IF;
END
$$;

-- Function-level behavior checks for error contracts.
DO $$
BEGIN
  BEGIN
    PERFORM public.nav_set_driver_availability(gen_random_uuid(), 'invalid');
    RAISE EXCEPTION 'Expected invalid availability error was not raised';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      NULL;
  END;

  BEGIN
    PERFORM public.nav_set_driver_availability(gen_random_uuid(), 'online');
    RAISE EXCEPTION 'Expected missing profile error was not raised';
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN
      NULL;
  END;
END
$$;
