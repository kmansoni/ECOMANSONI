-- ─────────────────────────────────────────────────────────────────────────────
-- DND (Do Not Disturb) status for users
-- Safe to re-run: uses IF NOT EXISTS / DO $$ EXCEPTION guards
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Table user_dnd_settings (owned by user, 1 row per user)
CREATE TABLE IF NOT EXISTS public.user_dnd_settings (
  user_id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dnd_enabled      boolean     NOT NULL DEFAULT false,
  dnd_until        timestamptz,                          -- NULL = indefinite
  dnd_exceptions   text[]      NOT NULL DEFAULT '{}',   -- user_id strings that bypass DND
  dnd_allow_calls  boolean     NOT NULL DEFAULT false,  -- allow calls even while DND
  dnd_auto_reply   text,                                 -- NULL = no auto-reply
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 2. Auto-update updated_at
CREATE OR REPLACE FUNCTION public.trg_user_dnd_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_dnd_settings_updated_at ON public.user_dnd_settings;
CREATE TRIGGER trg_user_dnd_settings_updated_at
  BEFORE UPDATE ON public.user_dnd_settings
  FOR EACH ROW EXECUTE FUNCTION public.trg_user_dnd_settings_updated_at();

-- 3. RLS: owner-only reads & writes
ALTER TABLE public.user_dnd_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dnd_select_own" ON public.user_dnd_settings;
CREATE POLICY "dnd_select_own" ON public.user_dnd_settings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "dnd_insert_own" ON public.user_dnd_settings;
CREATE POLICY "dnd_insert_own" ON public.user_dnd_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "dnd_update_own" ON public.user_dnd_settings;
CREATE POLICY "dnd_update_own" ON public.user_dnd_settings
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "dnd_delete_own" ON public.user_dnd_settings;
CREATE POLICY "dnd_delete_own" ON public.user_dnd_settings
  FOR DELETE USING (auth.uid() = user_id);

-- 4. Public read policy for DND check (sender needs to know if recipient is in DND)
--    Exposes ONLY dnd_enabled + dnd_until + dnd_allow_calls to authenticated users
--    Does NOT expose exceptions or auto_reply text (privacy sensitive)
DROP VIEW IF EXISTS public.user_dnd_public;
CREATE VIEW public.user_dnd_public AS
  SELECT user_id, dnd_enabled, dnd_until, dnd_allow_calls
  FROM public.user_dnd_settings
  WHERE dnd_enabled = true
    AND (dnd_until IS NULL OR dnd_until > now());

-- 5. Server-side function: is_user_in_dnd(target_user_id)
--    Returns true if the target user is currently in DND mode.
--    Runs as SECURITY DEFINER to bypass RLS for server-side notification routing.
CREATE OR REPLACE FUNCTION public.is_user_in_dnd(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_enabled  boolean;
  v_until    timestamptz;
BEGIN
  SELECT dnd_enabled, dnd_until
    INTO v_enabled, v_until
    FROM public.user_dnd_settings
   WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT v_enabled THEN
    RETURN false;
  END IF;

  -- Timed DND: if dnd_until is set and has passed, treat as disabled
  IF v_until IS NOT NULL AND v_until <= now() THEN
    -- Auto-disable stale DND row to keep state consistent
    UPDATE public.user_dnd_settings
       SET dnd_enabled = false, dnd_until = NULL
     WHERE user_id = p_user_id;
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- 6. Grant execute to authenticated role (used by Edge Functions)
GRANT EXECUTE ON FUNCTION public.is_user_in_dnd(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_in_dnd(uuid) TO service_role;
