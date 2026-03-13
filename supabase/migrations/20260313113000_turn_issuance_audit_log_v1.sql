-- TURN issuance audit log for security and SLO observability.

create table if not exists public.turn_issuance_audit (
  id bigint generated always as identity primary key,
  request_id text not null,
  auth_type text not null check (auth_type in ('jwt', 'api_key')),
  user_hash text not null,
  ip_hash text not null,
  outcome text not null,
  status_code integer not null,
  latency_ms integer not null check (latency_ms >= 0),
  ttl_seconds integer,
  error_code text,
  region_hint text,
  created_at timestamptz not null default now()
);

create index if not exists idx_turn_issuance_audit_created_at
  on public.turn_issuance_audit (created_at desc);

create index if not exists idx_turn_issuance_audit_outcome_created
  on public.turn_issuance_audit (outcome, created_at desc);

alter table public.turn_issuance_audit enable row level security;

revoke all on table public.turn_issuance_audit from public;
revoke all on table public.turn_issuance_audit from anon;
revoke all on table public.turn_issuance_audit from authenticated;

grant insert, select on table public.turn_issuance_audit to service_role;
