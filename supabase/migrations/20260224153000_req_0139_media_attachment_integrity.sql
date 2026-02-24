-- 20260224153000_req_0139_media_attachment_integrity.sql
-- REQ-0139: Media Attachment Integrity and Signed URL Access (P0)

-- Table: media_objects
-- Stores media metadata with integrity validation
create table if not exists public.media_objects (
  id uuid primary key default gen_random_uuid(),
  
  -- Storage path (private bucket)
  bucket_name text not null default 'media',
  object_path text not null,
  
  -- Metadata
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum_sha256 text, -- optional verification
  
  -- Ownership
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  uploaded_at timestamptz not null default now(),
  
  -- Referenced by (nullable, for orphan cleanup)
  entity_type text, -- 'message', 'reel', 'profile', etc.
  entity_id uuid,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraint on bucket + path
create unique index if not exists media_objects_bucket_path_uniq
  on public.media_objects(bucket_name, object_path);

-- Index for user media lookup
create index if not exists media_objects_uploaded_by_idx
  on public.media_objects(uploaded_by, uploaded_at desc);

-- Index for entity attachment lookup
create index if not exists media_objects_entity_idx
  on public.media_objects(entity_type, entity_id);

alter table public.media_objects enable row level security;

-- RLS: users can read their own media objects
create policy media_objects_select on public.media_objects
  for select using (uploaded_by = auth.uid());

-- RLS: users can insert their own media objects
create policy media_objects_insert on public.media_objects
  for insert with check (uploaded_by = auth.uid());

-- Trigger: updated_at
create or replace function public.set_media_objects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_media_objects_updated_at on public.media_objects;
create trigger trg_media_objects_updated_at
before update on public.media_objects
for each row
execute function public.set_media_objects_updated_at();

-- RPC: media_register_upload_v1
-- Validates and registers media metadata after upload
create or replace function public.media_register_upload_v1(
  p_object_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_checksum_sha256 text default null,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_media_id uuid;
  v_allowed_mimes text[] := array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/ogg', 'audio/webm'
  ];
begin
  -- Validate mime type
  if p_mime_type is null or not (p_mime_type = any(v_allowed_mimes)) then
    raise exception 'invalid_mime_type' using errcode = '22023';
  end if;

  -- Validate size (max 100MB)
  if p_size_bytes < 0 or p_size_bytes > 104857600 then
    raise exception 'invalid_size' using errcode = '22023';
  end if;

  -- Insert media object
  insert into public.media_objects (
    bucket_name, object_path, mime_type, size_bytes, checksum_sha256,
    uploaded_by, entity_type, entity_id
  ) values (
    'media', p_object_path, p_mime_type, p_size_bytes, p_checksum_sha256,
    auth.uid(), p_entity_type, p_entity_id
  )
  on conflict (bucket_name, object_path) do update
    set mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        checksum_sha256 = excluded.checksum_sha256,
        entity_type = excluded.entity_type,
        entity_id = excluded.entity_id,
        updated_at = now()
  returning id into v_media_id;

  return v_media_id;
end;
$$;

-- RPC: media_get_signed_url_v1
-- Generates short-lived signed URL for private media access
-- Note: Simplified implementation - full signed URL generation requires storage extension
create or replace function public.media_get_signed_url_v1(
  p_media_id uuid,
  p_expires_in_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket text;
  v_path text;
  v_mime text;
  v_uploaded_by uuid;
  v_url text;
begin
  -- Validate expiry (max 1 hour)
  if p_expires_in_seconds < 60 or p_expires_in_seconds > 3600 then
    raise exception 'invalid_expiry' using errcode = '22023';
  end if;

  -- Get media object
  select bucket_name, object_path, mime_type, uploaded_by
  into v_bucket, v_path, v_mime, v_uploaded_by
  from public.media_objects
  where id = p_media_id;

  if not found then
    raise exception 'media_not_found' using errcode = '42P01';
  end if;

  -- Check access: owner or participant in entity
  if v_uploaded_by != auth.uid() then
    -- TODO: Add entity-specific access checks
    -- For now, only owner can access
    raise exception 'access_denied' using errcode = '42501';
  end if;

  -- Return media metadata (actual signed URL generation delegated to client/edge function)
  -- In production, use storage.createSignedUrl() from Supabase client SDK
  v_url := format('/storage/v1/object/%s/%s', v_bucket, v_path);

  return jsonb_build_object(
    'bucket', v_bucket,
    'path', v_path,
    'url', v_url,
    'mime_type', v_mime,
    'expires_in', p_expires_in_seconds,
    'generated_at', now()
  );
end;
$$;

-- Grant execute to authenticated users
grant execute on function public.media_register_upload_v1(text, text, bigint, text, text, uuid) to authenticated;
grant execute on function public.media_get_signed_url_v1(uuid, integer) to authenticated;

-- Storage policies (Supabase storage bucket configuration)
-- Note: These are declarative policies for the 'media' bucket
-- Ensure bucket 'media' is private and requires authentication

-- Create storage bucket if not exists (via Supabase dashboard or migration)
-- insert into storage.buckets (id, name, public)
-- values ('media', 'media', false)
-- on conflict (id) do nothing;

-- Storage policies for private media access
-- Users can only upload to their own prefix
-- Users can only download their own files or files they have access to

-- These policies are managed via Supabase Storage RLS
-- Example:
-- create policy "Users can upload to own folder"
-- on storage.objects for insert
-- with check (auth.uid()::text = (storage.foldername(name))[1]);
