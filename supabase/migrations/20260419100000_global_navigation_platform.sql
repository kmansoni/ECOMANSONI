-- ============================================================================
-- Global Navigation Platform: trip history, traffic light timings,
-- road lane details, road markings, crowdsourced observations
-- ============================================================================

-- ── Trip History ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trip_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Route info
  origin_name TEXT NOT NULL,
  origin_address TEXT,
  origin_lat DOUBLE PRECISION NOT NULL,
  origin_lon DOUBLE PRECISION NOT NULL,
  destination_name TEXT NOT NULL,
  destination_address TEXT,
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lon DOUBLE PRECISION NOT NULL,
  -- Trip metrics
  distance_meters INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  avg_speed_kmh NUMERIC(5,1) DEFAULT 0,
  max_speed_kmh NUMERIC(5,1) DEFAULT 0,
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  -- Route geometry (simplified for storage)
  route_geometry JSONB, -- [[lon,lat], ...] simplified polyline
  -- Traffic conditions during trip
  traffic_score INTEGER CHECK (traffic_score BETWEEN 1 AND 10),
  -- Trip status
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled', 'paused')),
  -- Metadata
  vehicle_type VARCHAR(20) DEFAULT 'car',
  route_type VARCHAR(20) DEFAULT 'fastest',
  fuel_consumed_liters NUMERIC(6,2),
  co2_grams NUMERIC(8,1),
  toll_cost NUMERIC(8,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_history_user ON trip_history(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_history_status ON trip_history(status) WHERE status = 'active';

ALTER TABLE trip_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_history_own ON trip_history
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Traffic Light Timings ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS traffic_light_timings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_node_id BIGINT,
  city_id VARCHAR(50),
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  -- Cycle data
  cycle_seconds INTEGER NOT NULL,
  phases JSONB NOT NULL DEFAULT '[]',
  -- e.g. [{"name":"NS Green","duration":30,"color":"green"},
  --       {"name":"NS Yellow","duration":3,"color":"yellow"},
  --       {"name":"EW Green","duration":25,"color":"green"},
  --       {"name":"EW Yellow","duration":3,"color":"yellow"}]
  -- Source tracking
  source VARCHAR(100) NOT NULL DEFAULT 'crowdsourced',
  source_url TEXT,
  confidence NUMERIC(3,2) DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  observation_count INTEGER DEFAULT 1,
  -- Temporal
  last_updated TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  -- Adaptive / Fixed
  is_adaptive BOOLEAN DEFAULT FALSE,
  -- Day-of-week profiles (adaptive lights change by time)
  day_profiles JSONB,
  -- e.g. {"weekday":{"07:00":{"cycle":90},"10:00":{"cycle":60}},
  --       "weekend":{"all":{"cycle":60}}}
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_tl_timings_osm ON traffic_light_timings(osm_node_id);
CREATE INDEX IF NOT EXISTS idx_tl_timings_location ON traffic_light_timings
  USING gist (
    (ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography)
  );
CREATE INDEX IF NOT EXISTS idx_tl_timings_city ON traffic_light_timings(city_id);

ALTER TABLE traffic_light_timings ENABLE ROW LEVEL SECURITY;

-- Public read, authenticated write
CREATE POLICY tl_timings_read ON traffic_light_timings
  FOR SELECT USING (true);
CREATE POLICY tl_timings_write ON traffic_light_timings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY tl_timings_update ON traffic_light_timings
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ── Road Lane Details ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS road_lane_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_way_id BIGINT NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('forward', 'backward', 'both')),
  lane_count INTEGER NOT NULL DEFAULT 1,
  -- Per-lane turn info as array
  turn_lanes TEXT[], -- e.g. ['left', 'through', 'through|right', 'right']
  destination_lanes TEXT[], -- e.g. ['A1 Moscow', '', '', 'Center']
  -- Road properties
  width_meters NUMERIC(4,1),
  surface VARCHAR(30), -- asphalt, concrete, gravel, paving_stones
  max_speed INTEGER,
  -- Restrictions
  bus_lane BOOLEAN DEFAULT FALSE,
  bicycle_lane BOOLEAN DEFAULT FALSE,
  -- Source
  source VARCHAR(50) DEFAULT 'osm',
  last_updated TIMESTAMPTZ DEFAULT now(),
  UNIQUE(osm_way_id, direction)
);

CREATE INDEX IF NOT EXISTS idx_lane_details_way ON road_lane_details(osm_way_id);

ALTER TABLE road_lane_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY lane_details_read ON road_lane_details
  FOR SELECT USING (true);

-- ── Road Markings ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS road_markings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_way_id BIGINT,
  marking_type VARCHAR(30) NOT NULL
    CHECK (marking_type IN ('solid', 'dashed', 'double_solid', 'double_dashed',
                            'solid_dashed', 'zigzag', 'crosswalk', 'stop_line',
                            'arrow_left', 'arrow_right', 'arrow_straight')),
  color VARCHAR(10) DEFAULT 'white' CHECK (color IN ('white', 'yellow', 'blue', 'red')),
  -- Geometry
  lat_start DOUBLE PRECISION NOT NULL,
  lon_start DOUBLE PRECISION NOT NULL,
  lat_end DOUBLE PRECISION NOT NULL,
  lon_end DOUBLE PRECISION NOT NULL,
  -- Source
  source VARCHAR(50) DEFAULT 'osm',
  last_updated TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_road_markings_way ON road_markings(osm_way_id);

ALTER TABLE road_markings ENABLE ROW LEVEL SECURITY;

CREATE POLICY road_markings_read ON road_markings
  FOR SELECT USING (true);

-- ── Crowdsourced Traffic Light Observations ──────────────────────────────────

CREATE TABLE IF NOT EXISTS tl_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  -- What the user observed
  color_seen VARCHAR(10) NOT NULL CHECK (color_seen IN ('red', 'yellow', 'green')),
  duration_seconds INTEGER, -- how long they waited / saw green
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Nearest known traffic light
  matched_timing_id UUID REFERENCES traffic_light_timings(id) ON DELETE SET NULL,
  -- Quality
  accuracy_meters NUMERIC(6,1),
  device_speed_kmh NUMERIC(5,1)
);

CREATE INDEX IF NOT EXISTS idx_tl_obs_location ON tl_observations
  USING gist (
    (ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography)
  );
CREATE INDEX IF NOT EXISTS idx_tl_obs_time ON tl_observations(timestamp DESC);

ALTER TABLE tl_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tl_obs_insert ON tl_observations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY tl_obs_read ON tl_observations
  FOR SELECT USING (true);

-- ── RPC: Save trip ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION save_trip(
  p_origin_name TEXT,
  p_origin_address TEXT,
  p_origin_lat DOUBLE PRECISION,
  p_origin_lon DOUBLE PRECISION,
  p_dest_name TEXT,
  p_dest_address TEXT,
  p_dest_lat DOUBLE PRECISION,
  p_dest_lon DOUBLE PRECISION,
  p_distance_meters INTEGER DEFAULT 0,
  p_duration_seconds INTEGER DEFAULT 0,
  p_avg_speed NUMERIC DEFAULT 0,
  p_max_speed NUMERIC DEFAULT 0,
  p_route_geometry JSONB DEFAULT NULL,
  p_traffic_score INTEGER DEFAULT NULL,
  p_vehicle_type VARCHAR DEFAULT 'car',
  p_route_type VARCHAR DEFAULT 'fastest'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO trip_history (
    user_id, origin_name, origin_address, origin_lat, origin_lon,
    destination_name, destination_address, destination_lat, destination_lon,
    distance_meters, duration_seconds, avg_speed_kmh, max_speed_kmh,
    route_geometry, traffic_score, vehicle_type, route_type,
    status, started_at, ended_at
  ) VALUES (
    auth.uid(), p_origin_name, p_origin_address, p_origin_lat, p_origin_lon,
    p_dest_name, p_dest_address, p_dest_lat, p_dest_lon,
    p_distance_meters, p_duration_seconds, p_avg_speed, p_max_speed,
    p_route_geometry, p_traffic_score, p_vehicle_type, p_route_type,
    'completed', now() - (p_duration_seconds || ' seconds')::interval, now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── RPC: Get trip history ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_trip_history(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  origin_name TEXT,
  origin_address TEXT,
  origin_lat DOUBLE PRECISION,
  origin_lon DOUBLE PRECISION,
  destination_name TEXT,
  destination_address TEXT,
  destination_lat DOUBLE PRECISION,
  destination_lon DOUBLE PRECISION,
  distance_meters INTEGER,
  duration_seconds INTEGER,
  avg_speed_kmh NUMERIC,
  max_speed_kmh NUMERIC,
  traffic_score INTEGER,
  vehicle_type VARCHAR,
  route_type VARCHAR,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  status VARCHAR
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    id, origin_name, origin_address, origin_lat, origin_lon,
    destination_name, destination_address, destination_lat, destination_lon,
    distance_meters, duration_seconds, avg_speed_kmh, max_speed_kmh,
    traffic_score, vehicle_type, route_type, started_at, ended_at, status
  FROM trip_history
  WHERE user_id = auth.uid()
  ORDER BY started_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- ── RPC: Get nearby traffic light timings ────────────────────────────────────

CREATE OR REPLACE FUNCTION get_nearby_traffic_lights(
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION,
  p_radius_meters INTEGER DEFAULT 500
)
RETURNS TABLE (
  id UUID,
  osm_node_id BIGINT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  cycle_seconds INTEGER,
  phases JSONB,
  is_adaptive BOOLEAN,
  confidence NUMERIC,
  last_updated TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    id, osm_node_id, lat, lon, cycle_seconds, phases,
    is_adaptive, confidence, last_updated
  FROM traffic_light_timings
  WHERE ST_DWithin(
    ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
    p_radius_meters
  )
  AND (expires_at IS NULL OR expires_at > now())
  ORDER BY ST_Distance(
    ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
  )
  LIMIT 20;
$$;

-- ── RPC: Submit traffic light observation ────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_tl_observation(
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION,
  p_color VARCHAR,
  p_duration INTEGER DEFAULT NULL,
  p_accuracy NUMERIC DEFAULT NULL,
  p_speed NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_timing_id UUID;
BEGIN
  -- Find nearest known traffic light within 30m
  SELECT tlt.id INTO v_timing_id
  FROM traffic_light_timings tlt
  WHERE ST_DWithin(
    ST_SetSRID(ST_MakePoint(tlt.lon, tlt.lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
    30
  )
  ORDER BY ST_Distance(
    ST_SetSRID(ST_MakePoint(tlt.lon, tlt.lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
  )
  LIMIT 1;

  INSERT INTO tl_observations (
    user_id, lat, lon, color_seen, duration_seconds,
    matched_timing_id, accuracy_meters, device_speed_kmh
  ) VALUES (
    auth.uid(), p_lat, p_lon, p_color, p_duration,
    v_timing_id, p_accuracy, p_speed
  ) RETURNING id INTO v_id;

  -- Update observation count if matched
  IF v_timing_id IS NOT NULL THEN
    UPDATE traffic_light_timings
    SET observation_count = observation_count + 1,
        last_updated = now()
    WHERE id = v_timing_id;
  END IF;

  RETURN v_id;
END;
$$;
