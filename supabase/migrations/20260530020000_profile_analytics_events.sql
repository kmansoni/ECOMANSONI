-- ============================================================================
-- Profile analytics events tracking
--
-- Tracks profile views, link clicks, and other profile-level interactions
-- Needed for CreatorAnalyticsDashboard Audience tab
-- ============================================================================

-- Table: profile_view_events
-- Records when a user views another user's profile
CREATE TABLE IF NOT EXISTS public.profile_view_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_view_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_view_owner_select"
  ON public.profile_view_events
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "profile_view_insert_authenticated"
  ON public.profile_view_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "profile_view_service_all"
  ON public.profile_view_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_profile_view_events_profile
  ON public.profile_view_events(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_view_events_viewer
  ON public.profile_view_events(viewer_id, created_at DESC);

COMMENT ON TABLE public.profile_view_events IS
  'Records profile view events for creator analytics';

-- Table: link_click_events
-- Records clicks on bio links
CREATE TABLE IF NOT EXISTS public.link_click_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  clicker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  link_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.link_click_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "link_click_owner_select"
  ON public.link_click_events
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "link_click_insert_authenticated"
  ON public.link_click_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "link_click_service_all"
  ON public.link_click_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_link_click_events_profile
  ON public.link_click_events(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_click_events_clicker
  ON public.link_click_events(clicker_id, created_at DESC);

COMMENT ON TABLE public.link_click_events IS
  'Records bio link click events for creator analytics';

-- ============================================================================
-- Summary:
-- - ✅ profile_view_events table with RLS for profile visits
-- - ✅ link_click_events table with RLS for bio link clicks
-- ============================================================================