-- ─────────────────────────────────────────────────────────────────────────────
-- Жалобы на поездку такси
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taxi_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('rude_driver','unsafe_driving','wrong_route','overcharge','dirty_car','no_show','other')),
  description text,
  photos jsonb DEFAULT '[]',
  status text DEFAULT 'submitted' CHECK (status IN ('submitted','reviewing','resolved','rejected')),
  resolution text,
  created_at timestamptz DEFAULT now() NOT NULL,
  resolved_at timestamptz
);

ALTER TABLE taxi_complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "taxi_complaints_select_own" ON taxi_complaints
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "taxi_complaints_insert_own" ON taxi_complaints
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "taxi_complaints_update_own" ON taxi_complaints
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_taxi_complaints_ride ON taxi_complaints(ride_id);
CREATE INDEX IF NOT EXISTS idx_taxi_complaints_user ON taxi_complaints(user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Кэш маршрутов общественного транспорта
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transit_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_number text NOT NULL,
  route_type text NOT NULL CHECK (route_type IN ('bus','trolleybus','tram','metro','suburban')),
  name text NOT NULL,
  stops jsonb NOT NULL DEFAULT '[]',
  schedule jsonb DEFAULT '{}',
  color text DEFAULT '#3B82F6',
  is_active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE transit_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transit_routes_read_all" ON transit_routes
  FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_transit_routes_type ON transit_routes(route_type, is_active);
CREATE INDEX IF NOT EXISTS idx_transit_routes_number ON transit_routes(route_number);
