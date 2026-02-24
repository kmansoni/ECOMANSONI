-- 20260224120000_creation_supermodule_p0_patches.sql
-- Mansoni Creation SuperModule v2 P0 patches:
-- - Deterministic idempotency store (cross-endpoint scope)
-- - Draft/revision core with HELD-aware lifecycle states
-- - Resumable multipart upload part ledger
-- - Story segments + live sessions core tables
-- - Publish outbox
-- - Telemetry partition + deterministic dedupe contract

create table if not exists public.idempotency_keys (
  scope text not null,
  key text not null,
  request_hash text not null,
  status text not null check (status in ('in_progress', 'succeeded', 'failed')),
  response_code integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  primary key (scope, key),
  check (length(scope) between 3 and 80),
  check (length(key) between 8 and 200)
);

create index if not exists idx_idempotency_keys_expires_at
  on public.idempotency_keys (expires_at);

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid(),
  mode text not null check (mode in ('POST', 'STORY', 'REELS', 'LIVE')),
  schema_version text not null default '1.0.1',
  timebase_hz integer not null check (timebase_hz in (1000, 90000)),
  graph_json jsonb not null,
  bounds_json jsonb not null default '{}'::jsonb,
  current_rev integer not null default 1 check (current_rev >= 1),
  state text not null default 'EDIT' check (state in (
    'IDLE',
    'SELECT_MODE',
    'CAPTURE',
    'IMPORT',
    'EDIT',
    'PREPARE_UPLOAD',
    'UPLOADING',
    'PROCESSING_MEDIA',
    'TRUST_GATES',
    'HELD',
    'READY_TO_PUBLISH',
    'PUBLISHING',
    'PUBLISHED',
    'FAILED',
    'CANCELLED'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_drafts_author_state_updated
  on public.drafts (author_id, state, updated_at desc);

create table if not exists public.draft_versions (
  draft_id uuid not null references public.drafts(id) on delete cascade,
  rev integer not null check (rev >= 1),
  graph_json jsonb not null,
  patch_json jsonb not null default '[]'::jsonb,
  actor_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (draft_id, rev)
);

create or replace function public.sync_draft_current_rev_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.drafts
     set current_rev = greatest(current_rev, new.rev),
         updated_at = now()
   where id = new.draft_id;
  return new;
end;
$$;

drop trigger if exists trg_sync_draft_current_rev_v1 on public.draft_versions;
create trigger trg_sync_draft_current_rev_v1
after insert on public.draft_versions
for each row
execute function public.sync_draft_current_rev_v1();

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  asset_kind text not null check (asset_kind in ('video', 'audio', 'image', 'live_track')),
  status text not null default 'initialized' check (status in ('initialized', 'uploading', 'complete', 'aborted', 'failed')),
  checksum_algo text not null default 'sha256',
  manifest_checksum text,
  size_bytes bigint not null check (size_bytes > 0),
  part_size_bytes integer not null check (part_size_bytes between 1048576 and 33554432),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_uploads_draft_created
  on public.uploads (draft_id, created_at desc);

create table if not exists public.upload_parts (
  upload_id uuid not null references public.uploads(id) on delete cascade,
  part_no integer not null check (part_no > 0),
  part_size_bytes integer not null check (part_size_bytes > 0),
  checksum text not null,
  etag text,
  committed_at timestamptz not null default now(),
  primary key (upload_id, part_no)
);

create index if not exists idx_upload_parts_upload_committed
  on public.upload_parts (upload_id, committed_at desc);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  upload_id uuid references public.uploads(id) on delete set null,
  kind text not null check (kind in ('video', 'audio', 'image', 'waveform', 'thumbnail', 'replay')),
  storage_path text not null,
  fingerprint_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_assets_draft
  on public.assets (draft_id);

create table if not exists public.transcode_jobs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  profile_id text not null,
  state text not null check (state in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transcode_jobs_state_created
  on public.transcode_jobs (state, created_at);

alter table public.posts
  add column if not exists draft_id uuid references public.drafts(id),
  add column if not exists publish_state text default 'published',
  add column if not exists visibility text default 'public';

create unique index if not exists idx_posts_draft_id_uniq
  on public.posts(draft_id)
  where draft_id is not null;

create table if not exists public.story_segments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  segment_index integer not null check (segment_index >= 0),
  start_tick bigint not null check (start_tick >= 0),
  end_tick bigint not null check (end_tick > start_tick),
  asset_id uuid references public.assets(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (story_id, segment_index)
);

create index if not exists idx_story_segments_story_idx
  on public.story_segments(story_id, segment_index);

alter table public.reels
  add column if not exists draft_id uuid references public.drafts(id),
  add column if not exists publish_state text default 'published',
  add column if not exists visibility text default 'public';

create unique index if not exists idx_reels_draft_id_uniq
  on public.reels(draft_id)
  where draft_id is not null;

create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  draft_id uuid references public.drafts(id) on delete set null,
  state text not null check (state in ('scheduled', 'starting', 'healthy', 'degraded', 'recovering', 'ended', 'terminated')),
  ingest_protocol text not null check (ingest_protocol in ('rtmp', 'webrtc')),
  stream_key_hash text not null,
  started_at timestamptz,
  ended_at timestamptz,
  replay_asset_id uuid references public.assets(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_live_sessions_author_created
  on public.live_sessions(author_id, created_at desc);

create table if not exists public.publish_events (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  mode text not null check (mode in ('POST', 'STORY', 'REELS', 'LIVE')),
  result text not null check (result in ('ok', 'error', 'held')),
  error_code text,
  trace_id text not null,
  idempotency_scope text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  foreign key (idempotency_scope, idempotency_key)
    references public.idempotency_keys(scope, key)
);

create index if not exists idx_publish_events_draft_created
  on public.publish_events(draft_id, created_at desc);

create table if not exists public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  decision text not null check (decision in ('ALLOW', 'HOLD', 'REJECT', 'ALLOW_WITH_ACTION')),
  decision_code text not null,
  explain_ref text,
  action_patch jsonb,
  applied_rev integer,
  created_at timestamptz not null default now()
);

create table if not exists public.rights_events (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  decision text not null check (decision in ('ALLOW', 'HOLD', 'REJECT', 'ALLOW_WITH_ACTION')),
  decision_code text not null,
  explain_ref text,
  action_patch jsonb,
  applied_rev integer,
  created_at timestamptz not null default now()
);

create table if not exists public.publish_outbox (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('publish.notifications', 'publish.search', 'publish.feed_fanout')),
  aggregate_id uuid not null,
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending', 'processing', 'done', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_publish_outbox_pending
  on public.publish_outbox(state, next_attempt_at, created_at);

create table if not exists public.telemetry_events (
  event_id uuid not null default gen_random_uuid(),
  event_name text not null,
  user_id uuid,
  content_id uuid,
  dedupe_key text not null,
  event_time timestamptz not null,
  dedupe_bucket_date date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (event_id, dedupe_bucket_date),
  unique (event_name, dedupe_key, dedupe_bucket_date)
) partition by range (dedupe_bucket_date);

create table if not exists public.telemetry_events_2026_h1
  partition of public.telemetry_events
  for values from ('2026-01-01') to ('2026-07-01');

create table if not exists public.telemetry_events_2026_h2
  partition of public.telemetry_events
  for values from ('2026-07-01') to ('2027-01-01');

create index if not exists idx_telemetry_events_name_time
  on public.telemetry_events (event_name, event_time desc);

create index if not exists idx_telemetry_events_content_time
  on public.telemetry_events (content_id, event_time desc);
