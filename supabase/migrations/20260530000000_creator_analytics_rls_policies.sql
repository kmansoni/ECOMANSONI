-- ============================================================================
-- Phase 1 EPIC J: RLS Policies for Analytics Tables
--
-- Security requirement: Every analytics table MUST have RLS policies
-- Users can only see metrics for their own content
-- ============================================================================

-- Enable RLS for analytics tables (if not already enabled)
ALTER TABLE public.reel_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_metrics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_metrics_snapshots ENABLE ROW LEVEL SECURITY;

-- 1) Reel metrics: Creators can view their own reel metrics
CREATE POLICY "reel_metrics_owner_select"
  ON public.reel_metrics
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.id = reel_metrics.reel_id
      AND r.author_id = auth.uid()
    )
  );

-- Reel metrics: Service role can INSERT/UPDATE for background workers
CREATE POLICY "reel_metrics_service_upsert"
  ON public.reel_metrics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2) Reel metrics snapshots: Creator can view their own reel's snapshots
CREATE POLICY "reel_metrics_snapshots_owner_select"
  ON public.reel_metrics_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.id = reel_metrics_snapshots.reel_id
      AND r.author_id = auth.uid()
    )
  );

-- Reel metrics snapshots: Service role can INSERT/UPDATE
CREATE POLICY "reel_metrics_snapshots_service_upsert"
  ON public.reel_metrics_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3) Creator metrics: Creator can view their own metrics
CREATE POLICY "creator_metrics_owner_select"
  ON public.creator_metrics
  FOR SELECT
  TO authenticated
  USING (creator_id = auth.uid());

-- Creator metrics: Service role can INSERT/UPDATE
CREATE POLICY "creator_metrics_service_upsert"
  ON public.creator_metrics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4) Creator metrics snapshots: Creator can view their own snapshots
CREATE POLICY "creator_metrics_snapshots_owner_select"
  ON public.creator_metrics_snapshots
  FOR SELECT
  TO authenticated
  USING (creator_id = auth.uid());

-- Creator metrics snapshots: Service role can INSERT/UPDATE
CREATE POLICY "creator_metrics_snapshots_service_upsert"
  ON public.creator_metrics_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Summary:
-- - ✅ RLS enabled on all analytics tables
-- - ✅ Users can only see their own metrics
-- - ✅ Service role has full access for background workers
-- ============================================================================