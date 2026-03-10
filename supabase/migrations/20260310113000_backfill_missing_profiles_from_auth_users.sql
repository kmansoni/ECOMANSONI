-- Backfill missing rows in public.profiles using auth.users metadata.
-- This fixes follower/following lists where relation rows exist but profile rows were lost.

INSERT INTO public.profiles (
  user_id,
  display_name,
  full_name,
  username,
  avatar_url,
  email
)
SELECT
  u.id AS user_id,
  COALESCE(
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'name'), ''),
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'username'), ''),
    NULLIF(BTRIM(SPLIT_PART(u.email, '@', 1)), ''),
    'u_' || SUBSTRING(REPLACE(u.id::text, '-', ''), 1, 8)
  ) AS display_name,
  COALESCE(
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'name'), '')
  ) AS full_name,
  COALESCE(
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'username'), ''),
    'u_' || SUBSTRING(REPLACE(u.id::text, '-', ''), 1, 16)
  ) AS username,
  COALESCE(
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'avatar_url'), ''),
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'picture'), '')
  ) AS avatar_url,
  u.email
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Fill essential fields in existing profiles when they are empty.
UPDATE public.profiles p
SET
  display_name = COALESCE(
    NULLIF(BTRIM(p.display_name), ''),
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'name'), ''),
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'username'), ''),
    NULLIF(BTRIM(SPLIT_PART(u.email, '@', 1)), ''),
    'u_' || SUBSTRING(REPLACE(p.user_id::text, '-', ''), 1, 8)
  ),
  username = COALESCE(
    NULLIF(BTRIM(p.username), ''),
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'username'), ''),
    'u_' || SUBSTRING(REPLACE(p.user_id::text, '-', ''), 1, 16)
  ),
  avatar_url = COALESCE(
    NULLIF(BTRIM(p.avatar_url), ''),
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'avatar_url'), ''),
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'picture'), '')
  ),
  email = COALESCE(
    NULLIF(BTRIM(p.email), ''),
    u.email
  )
FROM auth.users u
WHERE p.user_id = u.id
  AND (
    p.display_name IS NULL OR BTRIM(p.display_name) = '' OR
    p.username IS NULL OR BTRIM(p.username) = '' OR
    p.avatar_url IS NULL OR BTRIM(p.avatar_url) = '' OR
    p.email IS NULL OR BTRIM(p.email) = ''
  );
