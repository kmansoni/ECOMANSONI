-- Road events and business registrations for navigator
-- Migration: road_events + business_registrations

-- ─── Road Events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.road_events (
  id text PRIMARY KEY,
  type text NOT NULL CHECK (type IN (
    'accident', 'police', 'road_works', 'traffic_jam', 'hazard',
    'speed_camera', 'pothole', 'fog', 'ice', 'flood',
    'closed_road', 'detour', 'fuel_price', 'other'
  )),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  description text DEFAULT '',
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  upvotes integer DEFAULT 0,
  downvotes integer DEFAULT 0,
  verified boolean DEFAULT false,
  photo_url text,
  created_at timestamptz DEFAULT now()
);

-- Index for spatial queries
CREATE INDEX IF NOT EXISTS idx_road_events_location
  ON public.road_events (lat, lng);

-- Index for active events
CREATE INDEX IF NOT EXISTS idx_road_events_expires
  ON public.road_events (expires_at);

-- RLS
ALTER TABLE public.road_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read road events"
  ON public.road_events FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert road events"
  ON public.road_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reported_by);

CREATE POLICY "Users can update own events"
  ON public.road_events FOR UPDATE
  TO authenticated
  USING (auth.uid() = reported_by);

-- ─── Business Registrations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_type text NOT NULL CHECK (business_type IN ('ip', 'ooo', 'self_employed')),
  name text NOT NULL,
  legal_name text,
  inn text NOT NULL,
  ogrn text,
  address text NOT NULL,
  lat double precision,
  lng double precision,
  phone text NOT NULL,
  website text,
  email text,
  category text NOT NULL,
  description text,
  working_hours text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_business_reg_user
  ON public.business_registrations (user_id);

CREATE INDEX IF NOT EXISTS idx_business_reg_status
  ON public.business_registrations (status);

CREATE INDEX IF NOT EXISTS idx_business_reg_category
  ON public.business_registrations (category);

-- RLS
ALTER TABLE public.business_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own registrations"
  ON public.business_registrations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Approved businesses visible to all"
  ON public.business_registrations FOR SELECT
  USING (status = 'approved');

CREATE POLICY "Users can insert own registrations"
  ON public.business_registrations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pending registrations"
  ON public.business_registrations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending');
