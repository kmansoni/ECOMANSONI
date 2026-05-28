-- Cleanup job for partitioned turn_active_allocations
-- Runs every minute to prevent table bloat at 1B scale

-- Note: Requires pg_cron extension
-- Enable in Supabase: CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cleanup-turn-allocations',
  '* * * * *',
  $$
    SELECT public.cleanup_expired_turn_allocations();
  $$
);

-- Health check view for monitoring
CREATE OR REPLACE VIEW public.turn_health_check AS
SELECT 
  l.region,
  l.active_count,
  l.capacity_limit,
  l.utilization_pct,
  CASE 
    WHEN l.utilization_pct > 90 THEN 'critical'
    WHEN l.utilization_pct > 75 THEN 'warning'
    ELSE 'ok'
  END AS status
FROM public.get_turn_region_load(null::public.turn_region_t) l;

-- Alert view: regions exceeding capacity threshold
CREATE OR REPLACE VIEW public.turn_region_overload AS
SELECT *
FROM public.turn_health_check
WHERE status IN ('warning', 'critical');