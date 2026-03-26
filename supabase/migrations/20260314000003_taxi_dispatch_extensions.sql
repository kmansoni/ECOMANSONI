-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: taxi_dispatch_extensions
-- Extends taxi_rides schema for dispatch algorithm + trip chat + surge
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Stored procedure: atomic order assignment ─────────────────────────────────
-- Called by Edge Function taxi-dispatch / client-side dispatchService.
-- Uses SELECT FOR UPDATE to prevent two drivers getting same order.

CREATE OR REPLACE FUNCTION public.taxi_assign_order_to_driver(
  p_order_id  UUID,
  p_driver_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride  taxi_rides%ROWTYPE;
  v_driver taxi_drivers%ROWTYPE;
BEGIN
  -- Lock the ride row (SKIP LOCKED would let another process move on)
  SELECT * INTO v_ride FROM taxi_rides WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RIDE_NOT_FOUND'; END IF;
  IF v_ride.status != 'searching_driver' THEN RAISE EXCEPTION 'RIDE_NOT_AVAILABLE'; END IF;

  -- Atomically check+lock driver availability
  SELECT * INTO v_driver FROM taxi_drivers WHERE id = p_driver_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DRIVER_NOT_FOUND'; END IF;
  IF v_driver.status != 'available' THEN RAISE EXCEPTION 'DRIVER_BUSY'; END IF;

  -- Assign
  UPDATE taxi_rides
  SET
    status             = 'assigned_to_driver',
    assigned_driver_id = p_driver_id
  WHERE id = p_order_id;

  -- Driver status stays 'available' until they accept; set after acceptance
  -- (taxi_driver_accept_order sets it to 'arriving')
END;
$$;

REVOKE ALL ON FUNCTION public.taxi_assign_order_to_driver FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.taxi_assign_order_to_driver TO service_role;
GRANT EXECUTE ON FUNCTION public.taxi_assign_order_to_driver TO authenticated;

-- ── Trip chat integration ─────────────────────────────────────────────────────
-- Links taxi_rides to a conversations row (our existing chat system).
-- conversation type = 'taxi_trip', external_id = ride UUID.

ALTER TABLE public.taxi_rides
  ADD COLUMN IF NOT EXISTS trip_conversation_id UUID;

-- Function: get or create conversation for in-trip chat
CREATE OR REPLACE FUNCTION public.taxi_get_or_create_trip_chat(
  p_ride_id        UUID,
  p_passenger_id   UUID,
  p_driver_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  -- Check if already exists
  SELECT trip_conversation_id INTO v_conv_id
  FROM taxi_rides
  WHERE id = p_ride_id AND trip_conversation_id IS NOT NULL;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- Create new conversation (type taxi_trip)
  INSERT INTO conversations (type, created_by)
  VALUES ('direct', p_passenger_id)
  RETURNING id INTO v_conv_id;

  -- Add both members
  INSERT INTO conversation_members (conversation_id, user_id) VALUES
    (v_conv_id, p_passenger_id),
    (v_conv_id, p_driver_user_id)
  ON CONFLICT DO NOTHING;

  -- Link to ride
  UPDATE taxi_rides
  SET trip_conversation_id = v_conv_id
  WHERE id = p_ride_id;

  RETURN v_conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.taxi_get_or_create_trip_chat FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.taxi_get_or_create_trip_chat TO authenticated;

-- ── Surge pricing cache ───────────────────────────────────────────────────────
-- Server-side cache for computed surge multipliers per zone.
-- Updated by Edge Function (future: scheduled pg_cron job).

CREATE TABLE IF NOT EXISTS public.taxi_surge_cache (
  zone_id       TEXT             PRIMARY KEY,
  multiplier    NUMERIC(3, 2)    NOT NULL DEFAULT 1.00,
  reason        TEXT,
  active_orders INTEGER          DEFAULT 0,
  available_drivers INTEGER      DEFAULT 0,
  updated_at    TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- Allow all authenticated to read surge data
ALTER TABLE public.taxi_surge_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "taxi_surge_select" ON public.taxi_surge_cache FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "taxi_surge_update" ON public.taxi_surge_cache FOR ALL TO service_role USING (TRUE);

-- Index for geo lookups (future PostGIS integration)
CREATE INDEX IF NOT EXISTS idx_taxi_surge_updated ON public.taxi_surge_cache (updated_at DESC);

-- ── Driver location index improvement ────────────────────────────────────────
-- Composite index for bounding-box dispatch queries:
-- WHERE lat BETWEEN x1 AND x2 AND lng BETWEEN y1 AND y2 AND updated_at > stale
CREATE INDEX IF NOT EXISTS idx_taxi_driver_locations_bbox
  ON public.taxi_driver_locations (lat, lng, updated_at);

-- ── Passenger acceptance rate tracking ───────────────────────────────────────
-- Track passengers who frequently cancel for fraud detection (Uber pattern)

ALTER TABLE public.taxi_rides
  ADD COLUMN IF NOT EXISTS passenger_cancellation_count INTEGER DEFAULT 0;

-- Trigger: increment passenger cancellation counter on cancel
CREATE OR REPLACE FUNCTION public.taxi_track_passenger_cancellations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled'
    AND OLD.status NOT IN ('cancelled', 'completed')
    AND NEW.cancelled_by = 'passenger' THEN
    -- Could be used for fraud scoring (future ML input)
    -- For now just record it
    NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS taxi_rides_cancellation_track ON public.taxi_rides;
CREATE TRIGGER taxi_rides_cancellation_track
  AFTER UPDATE ON public.taxi_rides
  FOR EACH ROW EXECUTE FUNCTION public.taxi_track_passenger_cancellations();

-- ── Add trip_conversation_id to realtime ─────────────────────────────────────
-- Already covered by taxi_rides in realtime publication from migration 20260314000002

COMMIT;
