-- ============================================
-- Phase 1: Seed test data for KPI monitoring
-- ============================================
-- Purpose: Create 7 days of realistic KPI snapshots to test guardrail logic
-- Timeline: Last 7 days with varying metrics to trigger different alert states

-- Day -7: Healthy metrics (all green)
insert into kpi_daily_snapshots (
  snapshot_date,
  dau, wau, mau,
  retention_7d, retention_30d,
  avg_session_duration_seconds, session_count, content_completion_rate,
  report_rate_per_1k, moderation_queue_age_hours,
  creator_return_rate_7d, new_creators_count, active_creators_count
) values (
  current_date - interval '7 days',
  1800, 6200, 12000,
  42.5, 28.3,
  520, 4200, 74.2,
  2.8, 6.5,
  45.3, 180, 520
);

-- Day -6: Healthy metrics (all green)
insert into kpi_daily_snapshots (
  snapshot_date,
  dau, wau, mau,
  retention_7d, retention_30d,
  avg_session_duration_seconds, session_count, content_completion_rate,
  report_rate_per_1k, moderation_queue_age_hours,
  creator_return_rate_7d, new_creators_count, active_creators_count
) values (
  current_date - interval '6 days',
  1950, 6500, 12500,
  44.1, 29.5,
  535, 4500, 76.8,
  3.1, 8.2,
  47.2, 195, 540
);

-- Day -5: Yellow alert - retention drops to 36% (below 40%, above red 35%)
insert into kpi_daily_snapshots (
  snapshot_date,
  dau, wau, mau,
  retention_7d, retention_30d,
  avg_session_duration_seconds, session_count, content_completion_rate,
  report_rate_per_1k, moderation_queue_age_hours,
  creator_return_rate_7d, new_creators_count, active_creators_count
) values (
  current_date - interval '5 days',
  1600, 5800, 12200,
  36.8, 26.1,
  480, 3800, 70.5,
  3.5, 10.5,
  43.2, 160, 490
);

-- Day -4: Red alert - retention 32% (below 35%), queue age 26h (>24h)
insert into kpi_daily_snapshots (
  snapshot_date,
  dau, wau, mau,
  retention_7d, retention_30d,
  avg_session_duration_seconds, session_count, content_completion_rate,
  report_rate_per_1k, moderation_queue_age_hours,
  creator_return_rate_7d, new_creators_count, active_creators_count
) values (
  current_date - interval '4 days',
  1450, 5500, 11800,
  32.3, 24.8,
  420, 3500, 67.2,
  4.2, 26.5,
  41.5, 145, 470
);

-- Day -3: Multiple red alerts - report rate 5.8 (>5), creator return 38% (<40%)
insert into kpi_daily_snapshots (
  snapshot_date,
  dau, wau, mau,
  retention_7d, retention_30d,
  avg_session_duration_seconds, session_count, content_completion_rate,
  report_rate_per_1k, moderation_queue_age_hours,
  creator_return_rate_7d, new_creators_count, active_creators_count
) values (
  current_date - interval '3 days',
  1520, 5700, 12000,
  33.5, 25.3,
  445, 3650, 68.8,
  5.8, 28.3,
  38.2, 152, 480
);

-- Day -2: Recovery started - retention 37% (yellow), report rate back to 3.8
insert into kpi_daily_snapshots (
  snapshot_date,
  dau, wau, mau,
  retention_7d, retention_30d,
  avg_session_duration_seconds, session_count, content_completion_rate,
  report_rate_per_1k, moderation_queue_age_hours,
  creator_return_rate_7d, new_creators_count, active_creators_count
) values (
  current_date - interval '2 days',
  1700, 6000, 12300,
  37.8, 26.9,
  490, 3900, 71.5,
  3.8, 18.5,
  42.1, 168, 505
);

-- Day -1 (yesterday): Back to green - all metrics healthy
insert into kpi_daily_snapshots (
  snapshot_date,
  dau, wau, mau,
  retention_7d, retention_30d,
  avg_session_duration_seconds, session_count, content_completion_rate,
  report_rate_per_1k, moderation_queue_age_hours,
  creator_return_rate_7d, new_creators_count, active_creators_count
) values (
  current_date - interval '1 day',
  1850, 6300, 12600,
  41.2, 28.5,
  510, 4150, 73.8,
  3.2, 12.0,
  44.8, 182, 530
);

-- Now run guardrail check to populate alerts based on this data
-- This will create guardrail_alerts for days -5, -4, -3 (yellow/red)
select check_guardrails_v1();

-- Log results
do $$
declare
  v_snapshot_count int;
  v_alert_count int;
begin
  select count(*) into v_snapshot_count from kpi_daily_snapshots;
  select count(*) into v_alert_count from guardrail_alerts;
  
  raise notice 'Seed data complete: % snapshots, % alerts created', v_snapshot_count, v_alert_count;
end $$;
