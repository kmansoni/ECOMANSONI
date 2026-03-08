-- ─────────────────────────────────────────────────────────────────────────────
-- Notification Schedule / Quiet Hours
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Table notification_schedules
CREATE TABLE IF NOT EXISTS public.notification_schedules (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  quiet_hours_enabled   boolean     NOT NULL DEFAULT false,
  quiet_start           time        NOT NULL DEFAULT '23:00',
  quiet_end             time        NOT NULL DEFAULT '07:00',
  -- 0=Sunday,1=Monday,...,6=Saturday (ISO weekday aligned to JS getDay())
  quiet_days            integer[]   NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  -- IANA timezone name, e.g. "Europe/Moscow"
  timezone              text        NOT NULL DEFAULT 'UTC',
  -- user_ids whose messages break quiet hours regardless
  exceptions            text[]      NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 2. Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_notification_schedules_user_id
  ON public.notification_schedules(user_id);

-- 3. Auto-update updated_at
CREATE OR REPLACE FUNCTION public.trg_notification_schedules_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_schedules_updated_at ON public.notification_schedules;
CREATE TRIGGER trg_notification_schedules_updated_at
  BEFORE UPDATE ON public.notification_schedules
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_schedules_updated_at();

-- 4. RLS: owner-only
ALTER TABLE public.notification_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qh_select_own" ON public.notification_schedules;
CREATE POLICY "qh_select_own" ON public.notification_schedules
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "qh_insert_own" ON public.notification_schedules;
CREATE POLICY "qh_insert_own" ON public.notification_schedules
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "qh_update_own" ON public.notification_schedules;
CREATE POLICY "qh_update_own" ON public.notification_schedules
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "qh_delete_own" ON public.notification_schedules;
CREATE POLICY "qh_delete_own" ON public.notification_schedules
  FOR DELETE USING (auth.uid() = user_id);

-- 5. Function: is_in_quiet_hours(p_user_id uuid) → boolean
--    Algorithm:
--      a) Load schedule; if not found or disabled → false
--      b) Convert now() to user's timezone
--      c) Check current day-of-week is in quiet_days
--      d) Handle wrap-around (e.g. 23:00 → 07:00 spans midnight)
--         If quiet_start < quiet_end: quiet if start <= now_time < end (simple range)
--         If quiet_start >= quiet_end: quiet if now_time >= start OR now_time < end (wraps midnight)
CREATE OR REPLACE FUNCTION public.is_in_quiet_hours(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_enabled  boolean;
  v_start    time;
  v_end      time;
  v_days     integer[];
  v_tz       text;
  v_now_tz   timestamptz;
  v_now_time time;
  v_dow      integer;  -- 0=Sun … 6=Sat
BEGIN
  SELECT quiet_hours_enabled, quiet_start, quiet_end, quiet_days, timezone
    INTO v_enabled, v_start, v_end, v_days, v_tz
    FROM public.notification_schedules
   WHERE user_id = p_user_id;

  IF NOT FOUND OR NOT v_enabled THEN
    RETURN false;
  END IF;

  -- Convert current UTC time to user's local timezone
  BEGIN
    v_now_tz := now() AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN
    -- Invalid timezone string: fall back to UTC
    v_now_tz := now() AT TIME ZONE 'UTC';
  END;

  v_now_time := v_now_tz::time;
  -- Extract JS-compatible day-of-week (0=Sun)
  v_dow := EXTRACT(DOW FROM v_now_tz)::integer;

  -- Check if current day is in quiet_days
  IF NOT (v_dow = ANY(v_days)) THEN
    RETURN false;
  END IF;

  -- Check time range (handles midnight wrap-around)
  IF v_start < v_end THEN
    -- Simple range: e.g. 09:00 – 18:00
    RETURN v_now_time >= v_start AND v_now_time < v_end;
  ELSE
    -- Wrap-around: e.g. 23:00 – 07:00 spans midnight
    RETURN v_now_time >= v_start OR v_now_time < v_end;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_in_quiet_hours(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_in_quiet_hours(uuid) TO service_role;
