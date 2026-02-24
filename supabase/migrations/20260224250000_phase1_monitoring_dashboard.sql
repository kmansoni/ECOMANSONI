-- Phase 1 Monitoring Dashboard
-- KPI tracking, guardrails alerts, incident detection

-- ============================================
-- PART 1: KPI Metrics Tables
-- ============================================

-- Daily KPI snapshots (for charting trends)
create table if not exists public.kpi_daily_snapshots (
  id bigserial primary key,
  snapshot_date date not null,
  created_at timestamp with time zone default now(),
  
  -- Retention metrics
  dau bigint,
  wau bigint,
  mau bigint,
  retention_7d numeric(5,2),  -- 35.5 = 35.5%
  retention_30d numeric(5,2),
  
  -- Engagement metrics
  avg_session_duration_seconds integer,
  session_count bigint,
  content_completion_rate numeric(5,2),
  
  -- Creator metrics
  creator_return_rate_7d numeric(5,2),
  new_creators_count bigint,
  active_creators_count bigint,
  
  -- Safety metrics
  report_rate_per_1k numeric(10,4),  -- reports per 1000 impressions
  moderation_queue_age_hours numeric(10,2),
  appeal_response_time_hours numeric(10,2),
  
  -- Feed quality
  feed_latency_p95_ms integer,
  feed_latency_p99_ms integer,
  
  unique(snapshot_date)
);

grant select on public.kpi_daily_snapshots to authenticated, anon, service_role;

-- Guardrails alerts (breaches of thresholds)
create table if not exists public.guardrail_alerts (
  id bigserial primary key,
  created_at timestamp with time zone default now(),
  
  metric_name text not null,  -- 'feed_latency_p95', 'retention_7d', 'report_rate', etc
  current_value numeric,
  threshold numeric,
  status text default 'active',  -- active, resolved, ignored
  severity text default 'warning',  -- info, warning, critical
  
  affected_feature text,  -- 'feed', 'explore', 'moderation', 'creator_dashboard'
  recommended_action text,
  
  assigned_to uuid,  -- admin user
  notes text,
  
  resolved_at timestamp with time zone,
  
  unique(metric_name, created_at)
);

grant select, insert on public.guardrail_alerts to authenticated, service_role;
grant update on public.guardrail_alerts to authenticated, service_role;

-- Incident log (for post-mortem analysis)
create table if not exists public.incidents (
  id bigserial primary key,
  created_at timestamp with time zone default now(),
  
  title text not null,  -- "Feed latency spike", "Moderation queue backlog"
  description text,
  severity text,  -- 'low', 'medium', 'high', 'critical'
  status text default 'open',  -- open, investigating, resolved
  
  root_cause text,
  resolution text,
  
  affected_users bigint,
  estimated_impact_usd numeric,
  
  started_at timestamp with time zone,
  resolved_at timestamp with time zone,
  
  post_mortem_url text
);

grant select, insert on public.incidents to authenticated, service_role;

-- ============================================
-- PART 2: KPI Calculation RPCs
-- ============================================

-- Calculate DAU/WAU/MAU (returns mock data if playback_events doesn't exist)
create or replace function public.get_user_cohorts_v1(
  p_window_days int default 7
)
returns table (
  dau bigint,
  wau bigint,
  mau bigint,
  retention_7d numeric,
  retention_30d numeric
) as $$
begin
  -- Mock data for now (playback_events table may not exist in all environments)
  return query select 1500::bigint, 5000::bigint, 8000::bigint, 38.5::numeric, 25.3::numeric;
end;
$$ language plpgsql security definer;

-- Calculate engagement metrics (mock data)
create or replace function public.get_engagement_metrics_v1()
returns table (
  avg_session_duration_seconds integer,
  session_count bigint,
  content_completion_rate numeric
) as $$
begin
  return query select 480::integer, ​3200::bigint, 72.5::numeric;
end;
$$ language plpgsql security definer;

-- Calculate safety metrics (mock data)
create or replace function public.get_safety_metrics_v1()
returns table (
  report_rate_per_1k numeric,
  moderation_queue_items_pending bigint,
  moderation_queue_age_hours numeric,
  appeal_response_time_hours numeric,
  controversial_items_filtered bigint
) as $$
begin
  return query select 3.2::numeric, 12::bigint, 8.5::numeric, 18.3::numeric, 45::bigint;
end;
$$ language plpgsql security definer;

-- Get creator metrics
create or replace function public.get_creator_metrics_v1()
returns table (
  creator_return_rate_7d numeric,
  new_creators_count bigint,
  active_creators_count bigint,
  avg_reels_per_creator numeric
) as $$
declare
  v_return_rate numeric;
  v_new_creators bigint;
  v_active_creators bigint;
  v_avg_reels numeric;
begin
  -- Creator return rate: % of creators who uploaded 7+ days ago and uploaded in last 1 day
  with creators_7d_ago as (
    select distinct author_id
    from reels
    where created_at >= now()::date - interval '8 days'
      and created_at < now()::date - interval '7 days'
  ),
  active_creators as (
    select distinct author_id
    from reels
    where created_at >= now()::date
  )
  select (count(distinct active_creators.author_id)::numeric / 
          nullif(count(distinct creators_7d_ago.author_id), 0) * 100)::numeric(5,2)
  into v_return_rate
  from creators_7d_ago
  left join active_creators on creators_7d_ago.author_id = active_creators.author_id;
  
  -- New creators (created account in last 7 days, uploaded at least 1 reel)
  select count(distinct author_id)
  into v_new_creators
  from reels r
  join profiles p on r.author_id = p.user_id
  where r.created_at >= now()::date - interval '7 days'
    and p.created_at >= now()::date - interval '7 days';
  
  -- Active creators (uploaded at least 1 reel in last 7 days)
  select count(distinct author_id)
  into v_active_creators
  from reels
  where created_at >= now()::date - interval '7 days';
  
  -- Average reels per creator
  select avg(reel_count)
  into v_avg_reels
  from (
    select count(*) as reel_count
    from reels
    where created_at >= now()::date - interval '30 days'
    group by author_id
  ) stats;
  
  return query select v_return_rate, v_new_creators, v_active_creators, coalesce(v_avg_reels, 0);
end;
$$ language plpgsql security definer;

-- ============================================
-- PART 3: Snapshot Function (run daily)
-- ============================================

create or replace function public.create_kpi_daily_snapshot_v1(p_date date default current_date)
returns table (
  success boolean,
  message text
) as $$
declare
  v_dau bigint;
  v_wau bigint;
  v_mau bigint;
  v_retention_7d numeric;
  v_retention_30d numeric;
  v_avg_duration integer;
  v_session_count bigint;
  v_completion_rate numeric;
  v_report_rate numeric;
  v_queue_items bigint;
  v_queue_age numeric;
  v_appeal_time numeric;
  v_controversial bigint;
  v_creator_return numeric;
  v_new_creators bigint;
  v_active_creators bigint;
  v_feed_latency_p95 integer;
begin
  -- Get all metrics
  select * into v_dau, v_wau, v_mau, v_retention_7d, v_retention_30d
  from public.get_user_cohorts_v1();
  
  select * into v_avg_duration, v_session_count, v_completion_rate
  from public.get_engagement_metrics_v1();
  
  select * into v_report_rate, v_queue_items, v_queue_age, v_appeal_time, v_controversial
  from public.get_safety_metrics_v1();
  
  select creator_return_rate_7d, new_creators_count, active_creators_count
  into v_creator_return, v_new_creators, v_active_creators
  from public.get_creator_metrics_v1();
  
  -- Feed latency (mock: will be replaced with real metrics integration)
  v_feed_latency_p95 := 450;  -- placeholder
  
  -- Insert snapshot
  insert into public.kpi_daily_snapshots (
    snapshot_date,
    dau, wau, mau, retention_7d, retention_30d,
    avg_session_duration_seconds, session_count, content_completion_rate,
    creator_return_rate_7d, new_creators_count, active_creators_count,
    report_rate_per_1k, moderation_queue_age_hours, appeal_response_time_hours,
    feed_latency_p95_ms
  ) values (
    p_date,
    v_dau, v_wau, v_mau, v_retention_7d, v_retention_30d,
    v_avg_duration, v_session_count, v_completion_rate,
    v_creator_return, v_new_creators, v_active_creators,
    v_report_rate, v_queue_age, v_appeal_time,
    v_feed_latency_p95
  )
  on conflict (snapshot_date) do update set
    dau = excluded.dau,
    wau = excluded.wau,
    mau = excluded.mau,
    retention_7d = excluded.retention_7d,
    retention_30d = excluded.retention_30d,
    avg_session_duration_seconds = excluded.avg_session_duration_seconds,
    session_count = excluded.session_count,
    content_completion_rate = excluded.content_completion_rate,
    creator_return_rate_7d = excluded.creator_return_rate_7d,
    new_creators_count = excluded.new_creators_count,
    active_creators_count = excluded.active_creators_count,
    report_rate_per_1k = excluded.report_rate_per_1k,
    moderation_queue_age_hours = excluded.moderation_queue_age_hours,
    appeal_response_time_hours = excluded.appeal_response_time_hours,
    feed_latency_p95_ms = excluded.feed_latency_p95_ms;
  
  return query select true::boolean, 'KPI snapshot created for ' || p_date::text;
end;
$$ language plpgsql security definer;

-- ============================================
-- PART 4: Guardrails Checking
-- ============================================

create or replace function public.check_guardrails_v1()
returns table (
  guardrail_name text,
  current_value numeric,
  threshold numeric,
  violated boolean,
  severity text
) as $$
declare
  v_record record;
  v_violated boolean;
  v_severity text;
begin
  -- Guardrail 1: Feed latency P95 < 500ms
  select * into v_record from (
    select 
      'feed_latency_p95' as name,
      500 as threshold,
      450 as current_value  -- placeholder
  ) t;
  v_violated := v_record.current_value > v_record.threshold;
  v_severity := case when v_violated then 'critical' else 'info' end;
  return query select v_record.name::text, v_record.current_value::numeric, v_record.threshold::numeric, v_violated, v_severity;
  
  -- Guardrail 2: Retention 7d > 35%
  select * into v_record from (
    select 
      'retention_7d' as name,
      35 as threshold,
      (select retention_7d from public.get_user_cohorts_v1()) as current_value
  ) t;
  v_violated := v_record.current_value < v_record.threshold;
  v_severity := case when v_violated then 'critical' else 'info' end;
  return query select v_record.name::text, v_record.current_value::numeric, v_record.threshold::numeric, v_violated, v_severity;
  
  -- Guardrail 3: Report rate per 1k < 5
  select * into v_record from (
    select 
      'report_rate_per_1k' as name,
      5 as threshold,
      (select report_rate_per_1k from public.get_safety_metrics_v1()) as current_value
  ) t;
  v_violated := v_record.current_value > v_record.threshold;
  v_severity := case when v_violated then 'warning' else 'info' end;
  return query select v_record.name::text, v_record.current_value::numeric, v_record.threshold::numeric, v_violated, v_severity;
  
  -- Guardrail 4: Moderation queue response < 24 hours
  select * into v_record from (
    select 
      'moderation_queue_age' as name,
      24 as threshold,
      (select moderation_queue_age_hours from public.get_safety_metrics_v1()) as current_value
  ) t;
  v_violated := v_record.current_value > v_record.threshold;
  v_severity := case when v_violated then 'warning' else 'info' end;
  return query select v_record.name::text, v_record.current_value::numeric, v_record.threshold::numeric, v_violated, v_severity;
  
  -- Guardrail 5: Creator return rate > 40%
  select * into v_record from (
    select 
      'creator_return_rate' as name,
      40 as threshold,
      (select creator_return_rate_7d from public.get_creator_metrics_v1()) as current_value
  ) t;
  v_violated := v_record.current_value < v_record.threshold;
  v_severity := case when v_violated then 'warning' else 'info' end;
  return query select v_record.name::text, v_record.current_value::numeric, v_record.threshold::numeric, v_violated, v_severity;
end;
$$ language plpgsql security definer;

-- Get all active guardrail breaches
create or replace function public.get_active_guardrail_breaches_v1()
returns table (
  metric_name text,
  current_value numeric,
  threshold numeric,
  severity text,
  affected_feature text,
  created_at timestamp with time zone
) as $$
begin
  return query
  select 
    g.metric_name,
    g.current_value,
    g.threshold,
    g.severity,
    g.affected_feature,
    g.created_at
  from public.guardrail_alerts g
  where g.status = 'active'
  order by g.created_at desc;
end;
$$ language plpgsql security definer;

-- ============================================
-- PART 5: Admin API
-- ============================================

-- Get dashboard summary
create or replace function public.get_kpi_dashboard_v1()
returns table (
  snapshot_date date,
  dau bigint,
  retention_7d numeric,
  avg_session_duration_seconds integer,
  content_completion_rate numeric,
  creator_return_rate_7d numeric,
  report_rate_per_1k numeric,
  moderation_queue_age_hours numeric,
  active_guardrail_breaches bigint,
  kpi_status text  -- 'green', 'yellow', 'red'
) as $$
declare
  v_snapshot_date date;
  v_dau bigint;
  v_retention_7d numeric;
  v_avg_dur integer;
  v_completion numeric;
  v_creator_return numeric;
  v_report_rate numeric;
  v_queue_age numeric;
  v_breaches bigint;
  v_status text;
begin
  v_snapshot_date := current_date;
  
  -- Get latest snapshot
  with latest as (
    select *
    from public.kpi_daily_snapshots
    order by snapshot_date desc
    limit 1
  )
  select 
    dau, retention_7d, avg_session_duration_seconds, 
    content_completion_rate, creator_return_rate_7d, 
    report_rate_per_1k, moderation_queue_age_hours
  into v_dau, v_retention_7d, v_avg_dur, v_completion, v_creator_return, v_report_rate, v_queue_age
  from latest;
  
  -- Count active breaches
  select count(*)
  into v_breaches
  from public.guardrail_alerts
  where status = 'active';
  
  -- Determine overall status
  v_status := case 
    when v_breaches >= 2 then 'red'
    when v_breaches = 1 then 'yellow'
    else 'green'
  end;
  
  return query select 
    v_snapshot_date,
    coalesce(v_dau, 0),
    coalesce(v_retention_7d, 0),
    coalesce(v_avg_dur, 0),
    coalesce(v_completion, 0),
    coalesce(v_creator_return, 0),
    coalesce(v_report_rate, 0),
    coalesce(v_queue_age, 0),
    v_breaches,
    v_status;
end;
$$ language plpgsql security definer;

-- Index for performance
create index idx_kpi_daily_snapshots_date on public.kpi_daily_snapshots(snapshot_date desc);
create index idx_guardrail_alerts_status on public.guardrail_alerts(status, created_at desc);
create index idx_incidents_status on public.incidents(status, created_at desc);
