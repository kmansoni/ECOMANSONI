-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- ─── Login Notifications & Known Devices ─────────────────────────────────────
-- Safe for repeated runs (idempotent).

CREATE TABLE IF NOT EXISTS public.login_events (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address         inet,
  user_agent         text,
  device_fingerprint text,
  location_city      text,
  location_country   text,
  is_new_device      boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'login_events' AND policyname = 'owner_read'
  ) THEN
    CREATE POLICY owner_read ON public.login_events
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS login_events_user_id_created_at_idx
  ON public.login_events (user_id, created_at DESC);

-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.known_devices (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint text        NOT NULL,
  device_name        text,
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_fingerprint)
);

ALTER TABLE public.known_devices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'known_devices' AND policyname = 'owner_rw'
  ) THEN
    CREATE POLICY owner_rw ON public.known_devices
      USING      (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS known_devices_user_id_idx
  ON public.known_devices (user_id);

-- -----------------------------------------------------------------
-- Helper function: returns TRUE when the fingerprint is not yet recorded
-- for this user. Runs with security definer so edge function service role
-- can call it without exposing underlying tables via RPC.

CREATE OR REPLACE FUNCTION public.check_new_device(
  p_user_id    uuid,
  p_fingerprint text
) RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.known_devices
    WHERE user_id = p_user_id
      AND device_fingerprint = p_fingerprint
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_new_device(uuid, text) TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.login_events  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.known_devices TO service_role;
