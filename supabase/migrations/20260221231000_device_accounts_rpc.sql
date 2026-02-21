-- DB-backed multi-account: RPC that lists accounts for the current device installation.
-- Key property: any authenticated account that is already linked to the device_id
-- can list all linked accounts for that same device_id (Telegram-like switcher).

-- Ensure optional metadata columns exist.
ALTER TABLE public.device_accounts
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INT;

CREATE INDEX IF NOT EXISTS device_accounts_device_id_idx
  ON public.device_accounts(device_id);

-- Upsert link for current user.
CREATE OR REPLACE FUNCTION public.upsert_device_account(
  p_device_id TEXT,
  p_label TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_device_id IS NULL OR btrim(p_device_id) = '' THEN
    RAISE EXCEPTION 'invalid_device_id';
  END IF;

  INSERT INTO public.device_accounts (device_id, user_id, label, last_active_at)
  VALUES (p_device_id, auth.uid(), p_label, now())
  ON CONFLICT (device_id, user_id)
  DO UPDATE SET
    label = COALESCE(EXCLUDED.label, public.device_accounts.label),
    last_active_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_device_account(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_device_account(TEXT, TEXT) TO authenticated;

-- List accounts linked to this device_id.
-- Security model: caller must be authenticated AND must already have a row
-- in device_accounts for this device_id.
CREATE OR REPLACE FUNCTION public.list_device_accounts_for_device(
  p_device_id TEXT
)
RETURNS TABLE (
  device_id TEXT,
  user_id UUID,
  label TEXT,
  sort_order INT,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  display_name TEXT,
  username TEXT,
  avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_device_id IS NULL OR btrim(p_device_id) = '' THEN
    RAISE EXCEPTION 'invalid_device_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.device_accounts da
    WHERE da.device_id = p_device_id
      AND da.user_id = auth.uid()
  ) THEN
    -- Not a member of this device installation.
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    da.device_id,
    da.user_id,
    da.label,
    da.sort_order,
    da.last_active_at,
    da.created_at,
    p.display_name,
    p.username,
    p.avatar_url
  FROM public.device_accounts da
  LEFT JOIN public.profiles p
    ON p.user_id = da.user_id
  WHERE da.device_id = p_device_id
  ORDER BY da.sort_order NULLS LAST,
           da.last_active_at DESC NULLS LAST,
           da.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_device_accounts_for_device(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_device_accounts_for_device(TEXT) TO authenticated;
