-- ============================================
-- Phase 1: Fix check_guardrails_v1 to actually create alerts
-- ============================================

-- Drop old function first
drop function if exists public.check_guardrails_v1();

create or replace function public.check_guardrails_v1()
returns table (
  guardrail_name text,
  current_value numeric,
  threshold numeric,
  violated boolean,
  severity text,
  alert_created boolean
) as $$
declare
  v_name text;
  v_threshold numeric;
  v_current numeric;
  v_violated boolean;
  v_severity text;
  v_alert_created boolean := false;
begin
  -- Guardrail 1: Feed latency P95 < 500ms (mock data for now)
  v_name := 'feed_latency_p95';
  v_threshold := 500;
  v_current := 450;  -- placeholder
  v_violated := v_current > v_threshold;
  v_severity := case when v_violated then 'critical' else 'info' end;
  
  if v_violated then
    insert into public.guardrail_alerts (metric_name, current_value, threshold, severity, status, affected_feature)
    values (v_name, v_current, v_threshold, v_severity, 'active', 'feed')
    on conflict do nothing;
    v_alert_created := true;
  end if;
  
  return query select v_name, v_current, v_threshold, v_violated, v_severity, v_alert_created;
  
  -- Guardrail 2: Retention 7d > 35%
  v_name := 'retention_7d';
  v_threshold := 35;
  select retention_7d into v_current from public.get_user_cohorts_v1();
  v_violated := v_current < v_threshold;
  v_severity := case when v_violated then 'critical' else 'info' end;
  v_alert_created := false;
  
  if v_violated then
    insert into public.guardrail_alerts (metric_name, current_value, threshold, severity, status, affected_feature)
    values (v_name, v_current, v_threshold, v_severity, 'active', 'retention')
    on conflict do nothing;
    v_alert_created := true;
  end if;
  
  return query select v_name, v_current, v_threshold, v_violated, v_severity, v_alert_created;
  
  -- Guardrail 3: Report rate per 1k < 5
  v_name := 'report_rate_per_1k';
  v_threshold := 5;
  select report_rate_per_1k into v_current from public.get_safety_metrics_v1();
  v_violated := v_current > v_threshold;
  v_severity := case when v_violated then 'warning' else 'info' end;
  v_alert_created := false;
  
  if v_violated then
    insert into public.guardrail_alerts (metric_name, current_value, threshold, severity, status, affected_feature)
    values (v_name, v_current, v_threshold, v_severity, 'active', 'safety')
    on conflict do nothing;
    v_alert_created := true;
  end if;
  
  return query select v_name, v_current, v_threshold, v_violated, v_severity, v_alert_created;
  
  -- Guardrail 4: Moderation queue age < 24 hours
  v_name := 'moderation_queue_age';
  v_threshold := 24;
  select moderation_queue_age_hours into v_current from public.get_safety_metrics_v1();
  v_violated := v_current > v_threshold;
  v_severity := case when v_violated then 'warning' else 'info' end;
  v_alert_created := false;
  
  if v_violated then
    insert into public.guardrail_alerts (metric_name, current_value, threshold, severity, status, affected_feature)
    values (v_name, v_current, v_threshold, v_severity, 'active', 'moderation')
    on conflict do nothing;
    v_alert_created := true;
  end if;
  
  return query select v_name, v_current, v_threshold, v_violated, v_severity, v_alert_created;
  
  -- Guardrail 5: Creator return rate > 40%
  v_name := 'creator_return_rate';
  v_threshold := 40;
  select creator_return_rate_7d into v_current from public.get_creator_metrics_v1();
  v_violated := v_current < v_threshold;
  v_severity := case when v_violated then 'warning' else 'info' end;
  v_alert_created := false;
  
  if v_violated then
    insert into public.guardrail_alerts (metric_name, current_value, threshold, severity, status, affected_feature)
    values (v_name, v_current, v_threshold, v_severity, 'active', 'creators')
    on conflict do nothing;
    v_alert_created := true;
  end if;
  
  return query select v_name, v_current, v_threshold, v_violated, v_severity, v_alert_created;
end;
$$ language plpgsql security definer;

-- Now re-run to create actual alerts
select * from check_guardrails_v1();

-- Log results
do $$
declare
  v_alert_count int;
begin
  select count(*) into v_alert_count from guardrail_alerts where status = 'active';
  raise notice 'Guardrail check complete: % active alerts', v_alert_count;
end $$;
