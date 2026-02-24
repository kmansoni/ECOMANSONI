-- Hotfix: ensure telemetry_events.dedupe_bucket_date is set on insert
-- Because generated columns cannot be used as partition keys.

create or replace function public.telemetry_events_set_bucket_date_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dedupe_bucket_date is null then
    new.dedupe_bucket_date := (new.event_time at time zone 'UTC')::date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_telemetry_events_set_bucket_date_v1 on public.telemetry_events;
create trigger trg_telemetry_events_set_bucket_date_v1
before insert on public.telemetry_events
for each row
execute function public.telemetry_events_set_bucket_date_v1();
