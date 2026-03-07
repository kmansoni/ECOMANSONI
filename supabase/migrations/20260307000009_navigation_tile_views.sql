-- =============================================================================
-- ECOMANSONI Navigation Platform — Tile views for Martin
-- Migration: 20260307000009_navigation_tile_views.sql
-- Dependencies: 20260307000008_navigation_triggers.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- nav_traffic_segments_tiles
-- Purpose: expose latest traffic metrics with geometry for MVT rendering.
-- Source: latest nav_traffic_segments row per road_segment_id + nav_road_segments.geometry
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.nav_traffic_segments_tiles
WITH (security_invoker = true)
AS
WITH latest AS (
    SELECT DISTINCT ON (t.road_segment_id)
        t.id,
        t.road_segment_id,
        t.speed_kmh,
        t.free_flow_speed_kmh,
        t.congestion_level,
        t.confidence,
        t.sample_count,
        t.measured_at,
        t.created_at
    FROM public.nav_traffic_segments t
    WHERE t.road_segment_id IS NOT NULL
    ORDER BY t.road_segment_id, t.measured_at DESC, t.created_at DESC
)
SELECT
    l.id,
    l.road_segment_id,
    l.speed_kmh,
    l.free_flow_speed_kmh,
    l.congestion_level,
    l.confidence,
    l.sample_count,
    l.measured_at,
    l.created_at,
    r.geometry
FROM latest l
JOIN public.nav_road_segments r
  ON r.id = l.road_segment_id;

COMMENT ON VIEW public.nav_traffic_segments_tiles IS
    'Latest traffic metrics per road segment joined with nav_road_segments.geometry for Martin MVT layer.';

GRANT SELECT ON public.nav_traffic_segments_tiles TO authenticated;
GRANT SELECT ON public.nav_traffic_segments_tiles TO service_role;
