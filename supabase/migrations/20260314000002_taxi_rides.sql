-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: taxi_rides — полная схема такси-платформы
--
-- Покрывает функционал всех 6 open-source проектов:
--   - amitshekhariitbhu/ridesharing-uber-lyft-app  → driver accept/reject
--   - piyush022/Uber-Clone-Backend                 → rides queue + matching
--   - LakshayD02/Full_Stack_Uber_Clone              → full trip lifecycle
--   - anasabbal/mini-uber-microservice             → driver/rider/location separation
--   - hyderali0889/Trippo                          → real-time location
--   - asif-khan-2k19/QuickRide                     → bidirectional rating
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── ENUMs ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE taxi_driver_status AS ENUM (
    'offline', 'available', 'arriving', 'busy', 'on_break'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE taxi_ride_status AS ENUM (
    'searching_driver',
    'assigned_to_driver',
    'driver_arriving',
    'driver_arrived',
    'in_trip',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE taxi_vehicle_class AS ENUM (
    'economy', 'comfort', 'business', 'minivan', 'premium', 'kids', 'green'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE taxi_payment_method AS ENUM (
    'card', 'cash', 'apple_pay', 'google_pay', 'corporate'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE taxi_cancellation_reason AS ENUM (
    'long_wait', 'wrong_car', 'changed_plans',
    'driver_not_responding', 'found_another', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── taxi_drivers ──────────────────────────────────────────────────────────────
-- Профиль водителя (1:1 с auth.users)

CREATE TABLE IF NOT EXISTS public.taxi_drivers (
  id                UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID             NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT             NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  phone             TEXT             NOT NULL CHECK (char_length(phone) BETWEEN 7 AND 20),
  photo             TEXT,
  car_make          TEXT             NOT NULL,
  car_model         TEXT             NOT NULL,
  car_color         TEXT             NOT NULL,
  car_plate_number  TEXT             NOT NULL CHECK (char_length(car_plate_number) BETWEEN 5 AND 15),
  car_year          SMALLINT         NOT NULL CHECK (car_year BETWEEN 2000 AND 2030),
  car_class         taxi_vehicle_class NOT NULL,
  status            taxi_driver_status NOT NULL DEFAULT 'offline',
  rating            NUMERIC(3, 2)    NOT NULL DEFAULT 5.00 CHECK (rating BETWEEN 1 AND 5),
  trips_count       INTEGER          NOT NULL DEFAULT 0,
  acceptance_rate   SMALLINT         NOT NULL DEFAULT 100 CHECK (acceptance_rate BETWEEN 0 AND 100),
  years_on_platform SMALLINT         NOT NULL DEFAULT 0,
  shift_earnings    INTEGER          NOT NULL DEFAULT 0,
  shift_trips       SMALLINT         NOT NULL DEFAULT 0,
  online_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- ── taxi_driver_locations ─────────────────────────────────────────────────────
-- Текущая позиция водителя — upsert-only, 1 row per driver

CREATE TABLE IF NOT EXISTS public.taxi_driver_locations (
  driver_id   UUID             PRIMARY KEY REFERENCES public.taxi_drivers(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  heading     SMALLINT         NOT NULL DEFAULT 0 CHECK (heading BETWEEN 0 AND 360),
  updated_at  TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- Spatial index для nearest-driver queries
CREATE INDEX IF NOT EXISTS idx_taxi_driver_locations_geo
  ON public.taxi_driver_locations (lat, lng);

-- ── taxi_rides ────────────────────────────────────────────────────────────────
-- Основная таблица поездок

CREATE TABLE IF NOT EXISTS public.taxi_rides (
  id                      UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id            UUID                   NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  driver_id               UUID                   REFERENCES public.taxi_drivers(id),
  assigned_driver_id      UUID                   REFERENCES public.taxi_drivers(id),
  last_rejected_driver_id UUID                   REFERENCES public.taxi_drivers(id),

  status                  taxi_ride_status       NOT NULL DEFAULT 'searching_driver',

  -- Pickup
  pickup_address          TEXT                   NOT NULL,
  pickup_lat              DOUBLE PRECISION        NOT NULL,
  pickup_lng              DOUBLE PRECISION        NOT NULL,

  -- Destination
  destination_address     TEXT                   NOT NULL,
  destination_lat         DOUBLE PRECISION        NOT NULL,
  destination_lng         DOUBLE PRECISION        NOT NULL,

  -- Trip details
  tariff                  taxi_vehicle_class     NOT NULL,
  payment_method          taxi_payment_method    NOT NULL DEFAULT 'card',
  estimated_price         INTEGER                NOT NULL,
  final_price             INTEGER,
  estimated_distance      NUMERIC(6, 2)          NOT NULL,
  estimated_duration      SMALLINT               NOT NULL,
  pin_code                CHAR(4)                NOT NULL,
  discount                INTEGER,
  promo_code              TEXT,

  -- Driver info (denormalised for history)
  passenger_name          TEXT,
  passenger_rating        NUMERIC(3, 2) DEFAULT 4.5,

  -- Waiting meter
  arrived_at              TIMESTAMPTZ,
  trip_started_at         TIMESTAMPTZ,
  waiting_charge          INTEGER,

  -- Cancellation
  cancellation_reason     taxi_cancellation_reason,
  cancelled_by            TEXT CHECK (cancelled_by IN ('passenger', 'driver', 'system')),

  -- Timestamps
  created_at              TIMESTAMPTZ            NOT NULL DEFAULT now(),
  completed_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,

  -- Integrity
  CONSTRAINT ride_price_positive CHECK (estimated_price > 0),
  CONSTRAINT ride_pin_numeric    CHECK (pin_code ~ '^[0-9]{4}$'),
  CONSTRAINT completed_has_final CHECK (
    status != 'completed' OR final_price IS NOT NULL
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_taxi_rides_passenger    ON public.taxi_rides (passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_taxi_rides_driver       ON public.taxi_rides (driver_id, status);
CREATE INDEX IF NOT EXISTS idx_taxi_rides_status       ON public.taxi_rides (status) WHERE status IN ('searching_driver', 'assigned_to_driver', 'driver_arriving', 'driver_arrived', 'in_trip');
CREATE INDEX IF NOT EXISTS idx_taxi_rides_assigned     ON public.taxi_rides (assigned_driver_id) WHERE assigned_driver_id IS NOT NULL;

-- Partial unique: one active ride per passenger at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_taxi_rides_passenger_active
  ON public.taxi_rides (passenger_id)
  WHERE status NOT IN ('completed', 'cancelled');

-- Partial unique: one active ride per driver at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_taxi_rides_driver_active
  ON public.taxi_rides (driver_id)
  WHERE status IN ('driver_arriving', 'driver_arrived', 'in_trip');

-- ── taxi_ratings ──────────────────────────────────────────────────────────────
-- Bidirectional rating (QuickRide / Trippo pattern)

CREATE TABLE IF NOT EXISTS public.taxi_ratings (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id      UUID      NOT NULL REFERENCES public.taxi_rides(id) ON DELETE CASCADE,
  rater_id     UUID      NOT NULL REFERENCES auth.users(id),
  ratee_id     UUID      NOT NULL REFERENCES auth.users(id),
  rater_role   TEXT      NOT NULL CHECK (rater_role IN ('passenger', 'driver')),
  rating       SMALLINT  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT      CHECK (char_length(comment) <= 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (ride_id, rater_id)  -- one rating per ride per rater
);

CREATE INDEX IF NOT EXISTS idx_taxi_ratings_ratee ON public.taxi_ratings (ratee_id);

-- ── taxi_driver_ratings (driver rates passenger) table ───────────────────────

CREATE TABLE IF NOT EXISTS public.taxi_driver_ratings (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID      NOT NULL REFERENCES public.taxi_rides(id) ON DELETE CASCADE,
  driver_id    UUID      NOT NULL REFERENCES public.taxi_drivers(id),
  passenger_id UUID      NOT NULL REFERENCES auth.users(id),
  rating       SMALLINT  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT      CHECK (char_length(comment) <= 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (order_id, driver_id)
);

-- ── taxi_scheduled_rides ─────────────────────────────────────────────────────
-- Pre-booked rides (Uber/Яндекс Такси pattern)

CREATE TABLE IF NOT EXISTS public.taxi_scheduled_rides (
  id                UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id      UUID                NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pickup_address    TEXT                NOT NULL,
  pickup_lat        DOUBLE PRECISION    NOT NULL,
  pickup_lng        DOUBLE PRECISION    NOT NULL,
  destination_address TEXT              NOT NULL,
  destination_lat   DOUBLE PRECISION    NOT NULL,
  destination_lng   DOUBLE PRECISION    NOT NULL,
  tariff            taxi_vehicle_class  NOT NULL,
  payment_method    taxi_payment_method NOT NULL DEFAULT 'card',
  scheduled_at      TIMESTAMPTZ         NOT NULL,
  estimated_price   INTEGER             NOT NULL,
  status            TEXT                NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'cancelled')),
  ride_id           UUID                REFERENCES public.taxi_rides(id),
  created_at        TIMESTAMPTZ         NOT NULL DEFAULT now(),

  CONSTRAINT scheduled_min_30min CHECK (scheduled_at >= created_at + INTERVAL '30 minutes')
);

CREATE INDEX IF NOT EXISTS idx_taxi_scheduled_rides_passenger
  ON public.taxi_scheduled_rides (passenger_id, scheduled_at)
  WHERE status = 'pending';

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.taxi_drivers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_rides            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_ratings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_driver_ratings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_scheduled_rides  ENABLE ROW LEVEL SECURITY;

-- taxi_drivers: own row + public read (passengers need driver info)
CREATE POLICY "taxi_drivers_select" ON public.taxi_drivers FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "taxi_drivers_insert" ON public.taxi_drivers FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "taxi_drivers_update" ON public.taxi_drivers FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- taxi_driver_locations: all read (map), own write
CREATE POLICY "taxi_driver_locations_select" ON public.taxi_driver_locations FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "taxi_driver_locations_write"  ON public.taxi_driver_locations FOR ALL    TO authenticated USING (
  driver_id IN (SELECT id FROM public.taxi_drivers WHERE user_id = auth.uid())
);

-- taxi_rides: passenger sees own, driver sees assigned
CREATE POLICY "taxi_rides_select" ON public.taxi_rides FOR SELECT TO authenticated USING (
  passenger_id = auth.uid()
  OR driver_id IN (SELECT id FROM public.taxi_drivers WHERE user_id = auth.uid())
  OR assigned_driver_id IN (SELECT id FROM public.taxi_drivers WHERE user_id = auth.uid())
);
CREATE POLICY "taxi_rides_insert" ON public.taxi_rides FOR INSERT TO authenticated WITH CHECK (passenger_id = auth.uid());
CREATE POLICY "taxi_rides_update_passenger" ON public.taxi_rides FOR UPDATE TO authenticated USING (passenger_id = auth.uid());
CREATE POLICY "taxi_rides_update_driver"    ON public.taxi_rides FOR UPDATE TO authenticated USING (
  driver_id IN (SELECT id FROM public.taxi_drivers WHERE user_id = auth.uid())
  OR assigned_driver_id IN (SELECT id FROM public.taxi_drivers WHERE user_id = auth.uid())
);

-- taxi_ratings: own
CREATE POLICY "taxi_ratings_select" ON public.taxi_ratings FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "taxi_ratings_insert" ON public.taxi_ratings FOR INSERT TO authenticated WITH CHECK (rater_id = auth.uid());

-- taxi_driver_ratings: own
CREATE POLICY "taxi_driver_ratings_select" ON public.taxi_driver_ratings FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "taxi_driver_ratings_insert" ON public.taxi_driver_ratings FOR INSERT TO authenticated WITH CHECK (
  driver_id IN (SELECT id FROM public.taxi_drivers WHERE user_id = auth.uid())
);

-- taxi_scheduled_rides
CREATE POLICY "taxi_scheduled_select" ON public.taxi_scheduled_rides FOR SELECT TO authenticated USING (passenger_id = auth.uid());
CREATE POLICY "taxi_scheduled_insert" ON public.taxi_scheduled_rides FOR INSERT TO authenticated WITH CHECK (passenger_id = auth.uid());
CREATE POLICY "taxi_scheduled_update" ON public.taxi_scheduled_rides FOR UPDATE TO authenticated USING (passenger_id = auth.uid());

-- ── Stored procedures ─────────────────────────────────────────────────────────

-- Driver accepts order: validates status, sets driver on ride
CREATE OR REPLACE FUNCTION public.taxi_driver_accept_order(
  p_driver_id UUID,
  p_order_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride taxi_rides%ROWTYPE;
  v_driver taxi_drivers%ROWTYPE;
BEGIN
  -- Lock the ride row to prevent race conditions
  SELECT * INTO v_ride FROM taxi_rides WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RIDE_NOT_FOUND'; END IF;
  IF v_ride.status != 'assigned_to_driver' THEN RAISE EXCEPTION 'RIDE_NOT_AVAILABLE'; END IF;
  IF v_ride.assigned_driver_id != p_driver_id THEN RAISE EXCEPTION 'RIDE_NOT_YOURS'; END IF;

  -- Check driver is available
  SELECT * INTO v_driver FROM taxi_drivers WHERE id = p_driver_id FOR UPDATE;
  IF v_driver.status != 'available' THEN RAISE EXCEPTION 'DRIVER_NOT_AVAILABLE'; END IF;

  -- Update ride
  UPDATE taxi_rides
  SET status = 'driver_arriving', driver_id = p_driver_id
  WHERE id = p_order_id;

  -- Update driver status
  UPDATE taxi_drivers SET status = 'arriving' WHERE id = p_driver_id;
END;
$$;

-- Confirm pickup by PIN
CREATE OR REPLACE FUNCTION public.taxi_confirm_pickup_pin(
  p_driver_id UUID,
  p_order_id  UUID,
  p_pin       TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride taxi_rides%ROWTYPE;
BEGIN
  SELECT * INTO v_ride FROM taxi_rides WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RIDE_NOT_FOUND'; END IF;
  IF v_ride.driver_id != p_driver_id THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF v_ride.status != 'driver_arrived' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF v_ride.pin_code != p_pin THEN RAISE EXCEPTION 'INVALID_PIN'; END IF;

  UPDATE taxi_rides
  SET status = 'in_trip', trip_started_at = now()
  WHERE id = p_order_id;

  UPDATE taxi_drivers SET status = 'busy' WHERE id = p_driver_id;
END;
$$;

-- Complete trip: calculate final price including waiting
CREATE OR REPLACE FUNCTION public.taxi_complete_trip(
  p_driver_id UUID,
  p_order_id  UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride      taxi_rides%ROWTYPE;
  v_wait_min  NUMERIC;
  v_wait_charge INTEGER := 0;
  v_final     INTEGER;
  FREE_MIN    CONSTANT SMALLINT := 5;
  RATE_PER_MIN CONSTANT SMALLINT := 5;
BEGIN
  SELECT * INTO v_ride FROM taxi_rides WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RIDE_NOT_FOUND'; END IF;
  IF v_ride.driver_id != p_driver_id THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF v_ride.status != 'in_trip' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  -- Calculate waiting charge
  IF v_ride.arrived_at IS NOT NULL AND v_ride.trip_started_at IS NOT NULL THEN
    v_wait_min := EXTRACT(EPOCH FROM (v_ride.trip_started_at - v_ride.arrived_at)) / 60;
    IF v_wait_min > FREE_MIN THEN
      v_wait_charge := CEIL((v_wait_min - FREE_MIN) * RATE_PER_MIN);
    END IF;
  END IF;

  v_final := v_ride.estimated_price + v_wait_charge;

  UPDATE taxi_rides
  SET
    status          = 'completed',
    completed_at    = now(),
    final_price     = v_final,
    waiting_charge  = v_wait_charge
  WHERE id = p_order_id;

  UPDATE taxi_drivers
  SET
    status         = 'available',
    shift_trips    = shift_trips + 1,
    shift_earnings = shift_earnings + v_final
  WHERE id = p_driver_id;

  RETURN json_build_object('final_price', v_final, 'waiting_charge', v_wait_charge);
END;
$$;

-- Grant
REVOKE ALL ON FUNCTION public.taxi_driver_accept_order FROM PUBLIC;
REVOKE ALL ON FUNCTION public.taxi_confirm_pickup_pin FROM PUBLIC;
REVOKE ALL ON FUNCTION public.taxi_complete_trip FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.taxi_driver_accept_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.taxi_confirm_pickup_pin TO authenticated;
GRANT EXECUTE ON FUNCTION public.taxi_complete_trip TO authenticated;

-- ── Realtime ──────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.taxi_rides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.taxi_driver_locations;

COMMIT;
