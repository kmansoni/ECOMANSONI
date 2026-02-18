-- Single-call RPC to open DM by display_name (avoids extra roundtrip)
CREATE OR REPLACE FUNCTION public.get_or_create_dm_by_display_name(target_display_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT p.user_id INTO target_user_id
  FROM public.profiles p
  WHERE p.display_name = target_display_name
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target not registered';
  END IF;

  RETURN public.get_or_create_dm(target_user_id);
END;
$$;