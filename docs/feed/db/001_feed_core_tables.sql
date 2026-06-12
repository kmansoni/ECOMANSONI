-- Mansoni Feed v1.1 — Core Tables
-- Применяется первым. Все таблицы feed-домена.

create table if not exists feed_posts (
  id uuid primary key,
  author_id uuid not null,
  content_type text not null,
  body_text text,
  media_manifest jsonb not null default '{}'::jsonb,
  visibility_scope text not null,
  status text not null,
  language_code text,
  region_code text,
  topic_tags text[] not null default '{}',
  quality_state text not null default 'unknown',
  moderation_state text not null default 'clear',
  trust_state text not null default 'normal',
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists feed_user_author_affinity (
  user_id uuid not null,
  author_id uuid not null,
  affinity_score numeric not null default 0,
  relationship_score numeric not null default 0,
  chat_score numeric not null default 0,
  call_score numeric not null default 0,
  interaction_score numeric not null default 0,
  negative_score numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, author_id)
);

create table if not exists feed_post_rank_snapshots (
  post_id uuid primary key references feed_posts(id) on delete cascade,
  impressions bigint not null default 0,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  saves bigint not null default 0,
  hides bigint not null default 0,
  reports bigint not null default 0,
  long_dwell_rate numeric not null default 0,
  fast_skip_rate numeric not null default 0,
  qae_score numeric not null default 0,
  snapshot_version text not null default 'v1',
  updated_at timestamptz not null default now()
);

create table if not exists feed_public_counters (
  post_id uuid primary key references feed_posts(id) on delete cascade,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  saves bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists feed_trust_profiles (
  subject_type text not null,
  subject_id uuid not null,
  trust_score numeric not null,
  risk_tier text not null,
  spam_score numeric not null default 0,
  authenticity_score numeric not null default 0,
  abuse_score numeric not null default 0,
  policy_flags text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (subject_type, subject_id)
);

create table if not exists feed_user_preferences (
  user_id uuid primary key,
  social_weight numeric not null default 0.40,
  discovery_weight numeric not null default 0.20,
  utility_weight numeric not null default 0.10,
  creator_weight numeric not null default 0.20,
  business_weight numeric not null default 0.10,
  text_media_bias numeric not null default 0,
  video_media_bias numeric not null default 0,
  local_bias numeric not null default 0,
  low_recommendation_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists feed_user_content_controls (
  user_id uuid not null,
  subject_type text not null,
  subject_key text not null,
  control_type text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, subject_type, subject_key, control_type)
);

create table if not exists feed_policy_versions (
  policy_version text primary key,
  surface text not null,
  config jsonb not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
