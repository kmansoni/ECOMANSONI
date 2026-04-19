-- Migration: Multimodal Navigator — GTFS static, GTFS-RT realtime, metro maps, taxi cache
-- Phase 1 of transit-multimodal-v1

-- 1. Transit Agency
CREATE TABLE IF NOT EXISTS transit_agency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL,
  country_code char(2) NOT NULL,
  timezone text,
  url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE transit_agency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transit_agency_read_all" ON transit_agency FOR SELECT USING (true);

-- 2. GTFS Routes
CREATE TABLE IF NOT EXISTS gtfs_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id text NOT NULL,
  agency_id uuid REFERENCES transit_agency(id) ON DELETE CASCADE,
  route_short_name text,
  route_long_name text,
  route_type integer NOT NULL,
  route_color text,
  route_text_color text,
  route_desc text,
  is_active boolean DEFAULT true,
  city text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_gtfs_routes_agency ON gtfs_routes(agency_id);
CREATE INDEX idx_gtfs_routes_city ON gtfs_routes(city);
CREATE UNIQUE INDEX idx_gtfs_routes_route_id_city ON gtfs_routes(route_id, city);
ALTER TABLE gtfs_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gtfs_routes_read_all" ON gtfs_routes FOR SELECT USING (true);

-- 3. GTFS Stops
CREATE TABLE IF NOT EXISTS gtfs_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id text NOT NULL,
  stop_name text NOT NULL,
  stop_code text,
  stop_desc text,
  city text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  location_type integer DEFAULT 0,
  wheelchair_boarding boolean,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_gtfs_stops_city ON gtfs_stops(city);
CREATE INDEX idx_gtfs_stops_coords ON gtfs_stops(lat, lng);
CREATE UNIQUE INDEX idx_gtfs_stops_stop_id_city ON gtfs_stops(stop_id, city);
ALTER TABLE gtfs_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gtfs_stops_read_all" ON gtfs_stops FOR SELECT USING (true);

-- RPC function: find nearby stops
CREATE OR REPLACE FUNCTION transit_stops_near(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 1.0
)
RETURNS SETOF gtfs_stops
LANGUAGE sql STABLE
AS $$
  SELECT *
  FROM gtfs_stops
  WHERE (
    6371 * acos(
      cos(radians(p_lat)) * cos(radians(lat)) *
      cos(radians(lng) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(lat))
    )
  ) <= p_radius_km
  ORDER BY (
    6371 * acos(
      cos(radians(p_lat)) * cos(radians(lat)) *
      cos(radians(lng) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(lat))
    )
  )
  LIMIT 20;
$$;

-- 4. GTFS Trips
CREATE TABLE IF NOT EXISTS gtfs_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id text NOT NULL,
  route_id uuid REFERENCES gtfs_routes(id) ON DELETE CASCADE,
  service_id text NOT NULL,
  direction_id integer,
  block_id text,
  shape_id text,
  headsign text,
  wheelchair_accessible boolean,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_gtfs_trips_route ON gtfs_trips(route_id);
CREATE UNIQUE INDEX idx_gtfs_trips_trip_id ON gtfs_trips(trip_id);
ALTER TABLE gtfs_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gtfs_trips_read_all" ON gtfs_trips FOR SELECT USING (true);

-- 5. GTFS Stop Times
CREATE TABLE IF NOT EXISTS gtfs_stop_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid REFERENCES gtfs_trips(id) ON DELETE CASCADE,
  stop_id uuid REFERENCES gtfs_stops(id) ON DELETE CASCADE,
  arrival_seconds integer,
  departure_seconds integer,
  stop_sequence integer NOT NULL,
  pickup_type integer,
  drop_off_type integer
);
CREATE INDEX idx_gtfs_stop_times_trip ON gtfs_stop_times(trip_id);
CREATE INDEX idx_gtfs_stop_times_stop ON gtfs_stop_times(stop_id);
CREATE INDEX idx_gtfs_stop_times_trip_seq ON gtfs_stop_times(trip_id, stop_sequence);
ALTER TABLE gtfs_stop_times ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gtfs_stop_times_read_all" ON gtfs_stop_times FOR SELECT USING (true);

-- 6. GTFS-RT Vehicle Positions
CREATE TABLE IF NOT EXISTS transit_vehicle_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id text NOT NULL,
  vehicle_id text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  bearing double precision NOT NULL DEFAULT 0,
  speed_kmh double precision,
  delay_seconds integer DEFAULT 0,
  recorded_at timestamptz DEFAULT now()
);
CREATE INDEX idx_vehicle_positions_trip ON transit_vehicle_positions(trip_id);
CREATE INDEX idx_vehicle_positions_time ON transit_vehicle_positions(recorded_at);
ALTER TABLE transit_vehicle_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicle_positions_read_all" ON transit_vehicle_positions FOR SELECT USING (true);

-- 7. GTFS-RT Trip Updates
CREATE TABLE IF NOT EXISTS transit_trip_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id text NOT NULL,
  agency_id uuid REFERENCES transit_agency(id) ON DELETE SET NULL,
  delay_seconds integer DEFAULT 0,
  is_cancelled boolean DEFAULT false,
  predicted_arrival timestamptz,
  predicted_departure timestamptz,
  recorded_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX idx_trip_updates_trip ON transit_trip_updates(trip_id);
ALTER TABLE transit_trip_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip_updates_read_all" ON transit_trip_updates FOR SELECT USING (true);

-- 8. Metro Maps (offline schemas)
CREATE TABLE IF NOT EXISTS metro_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL,
  country_code char(2) NOT NULL,
  lines jsonb NOT NULL,
  version integer DEFAULT 1,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(city, country_code)
);
ALTER TABLE metro_maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metro_maps_read_all" ON metro_maps FOR SELECT USING (true);

-- 9. Taxi Estimates Cache
CREATE TABLE IF NOT EXISTS taxi_estimates_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash_key text UNIQUE NOT NULL,
  pickup_lat double precision NOT NULL,
  pickup_lng double precision NOT NULL,
  dest_lat double precision NOT NULL,
  dest_lng double precision NOT NULL,
  provider text NOT NULL DEFAULT 'yandex',
  estimates jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX idx_taxi_estimates_hash ON taxi_estimates_cache(hash_key);
ALTER TABLE taxi_estimates_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "taxi_estimates_read_all" ON taxi_estimates_cache FOR SELECT USING (true);

-- 10. GTFS Calendar (service schedules)
CREATE TABLE IF NOT EXISTS gtfs_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id text NOT NULL,
  city text NOT NULL,
  monday boolean DEFAULT false,
  tuesday boolean DEFAULT false,
  wednesday boolean DEFAULT false,
  thursday boolean DEFAULT false,
  friday boolean DEFAULT false,
  saturday boolean DEFAULT false,
  sunday boolean DEFAULT false,
  start_date date NOT NULL,
  end_date date NOT NULL,
  UNIQUE(service_id, city)
);
ALTER TABLE gtfs_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gtfs_calendar_read_all" ON gtfs_calendar FOR SELECT USING (true);

-- 11. Cleanup old realtime data (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_realtime_data()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM transit_vehicle_positions WHERE recorded_at < now() - interval '1 hour';
  DELETE FROM transit_trip_updates WHERE expires_at IS NOT NULL AND expires_at < now();
  DELETE FROM taxi_estimates_cache WHERE expires_at < now();
$$;
