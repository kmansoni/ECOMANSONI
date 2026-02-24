-- ============================================
-- Phase 1: pg_cron - Daily KPI Snapshot Job
-- ============================================

-- Ensure pg_cron extension is enabled
create extension if not exists pg_cron;

-- Grant usage to postgres user (required for pg_cron)
grant usage on schema cron to postgres;

-- Schedule daily KPI snapshot creation at 01:00 UTC
-- This will call create_kpi_daily_snapshot_v1() which aggregates all metrics
select cron.schedule(
  'phase1-kpi-daily-snapshot',
  '0 1 * * *',
  'select public.create_kpi_daily_snapshot_v1();'
);

-- Log: Job scheduled successfully
-- Run in Supabase dashboard to verify:
-- SELECT jobname, schedule, command, nodename FROM cron.job;
