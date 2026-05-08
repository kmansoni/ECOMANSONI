-- GDPR Export: table to track user data export requests
-- Allows users to download all their personal data (Art. 20 GDPR Right to Data Portability)

create table if not exists gdpr_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  format text not null check (format in ('json', 'csv')),
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  metadata jsonb default '{}'
);

-- Index for efficient lookup by user
create index if not exists gdpr_exports_user_id_idx on gdpr_exports(user_id);

-- Index for cleanup query (expires_at)
create index if not exists gdpr_exports_expires_at_idx on gdpr_exports(expires_at);

-- RLS: users can only see their own exports
alter table gdpr_exports enable row level security;

create policy if not exists "Users can view their own exports"
  on gdpr_exports for select
  using (auth.uid() = user_id);

create policy if not exists "Users can create their own exports"
  on gdpr_exports for insert
  with check (auth.uid() = user_id);

-- Storage bucket for user exports (private — access via signed URLs only)
insert into storage.buckets (id, name, public)
values ('user-exports', 'user-exports', false)
on conflict (id) do update set public = false;

-- Storage RLS: users can only access their own export files
create policy if not exists "Users can upload own exports"
  on storage.objects for insert
  with check (bucket_id = 'user-exports' and (storage.foldername(name))[1] = auth.uid()::text);

create policy if not exists "Users can read own exports"
  on storage.objects for select
  using (bucket_id = 'user-exports' and (storage.foldername(name))[1] = auth.uid()::text);