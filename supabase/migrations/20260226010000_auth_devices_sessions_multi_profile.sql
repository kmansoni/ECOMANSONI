begin;

create extension if not exists pgcrypto;

create table if not exists public.auth_devices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  device_uid text not null unique,
  device_secret_hash text not null,
  platform text not null check (platform in ('web','ios','android','desktop')),
  device_model text,
  os_version text,
  app_version text,
  last_seen_at timestamptz,
  last_ip inet,
  last_user_agent text
);

create index if not exists auth_devices_last_seen_idx on public.auth_devices (last_seen_at desc);

create table if not exists public.auth_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  phone_e164 text unique,
  email text unique,
  password_hash text,
  is_banned boolean not null default false
);

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.auth_accounts(id) on delete cascade,
  device_id uuid not null references public.auth_devices(id) on delete cascade,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  refresh_token_hash text not null,
  refresh_issued_at timestamptz not null default now(),
  refresh_expires_at timestamptz not null,
  last_access_at timestamptz,
  last_ip inet,
  last_user_agent text,
  reuse_detected_at timestamptz
);

create index if not exists auth_sessions_account_idx on public.auth_sessions (account_id, status);
create index if not exists auth_sessions_device_idx on public.auth_sessions (device_id, status);
create index if not exists auth_sessions_refresh_exp_idx on public.auth_sessions (refresh_expires_at);

create table if not exists public.device_active_account (
  device_id uuid primary key references public.auth_devices(id) on delete cascade,
  account_id uuid not null references public.auth_accounts(id) on delete cascade,
  switched_at timestamptz not null default now()
);

create index if not exists device_active_account_account_idx on public.device_active_account(account_id);

create table if not exists public.auth_audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid references public.auth_accounts(id) on delete set null,
  device_id uuid references public.auth_devices(id) on delete set null,
  session_id uuid references public.auth_sessions(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  ip inet,
  user_agent text
);

create index if not exists auth_audit_events_account_idx on public.auth_audit_events (account_id, created_at desc);
create index if not exists auth_audit_events_device_idx on public.auth_audit_events (device_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_auth_sessions_updated_at on public.auth_sessions;
create trigger trg_auth_sessions_updated_at
before update on public.auth_sessions
for each row execute function public.set_updated_at();

commit;
