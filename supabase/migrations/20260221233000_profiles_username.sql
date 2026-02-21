-- Add missing `profiles.username` used by the frontend and several RPCs.
-- This migration is intentionally conservative: it makes the column exist and
-- ensures it is populated deterministically to avoid runtime 400 errors.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

-- Backfill: if username is missing, derive a unique stable value from user_id.
-- This avoids collisions and keeps the app functional immediately.
UPDATE public.profiles
SET username = 'u_' || substring(replace(user_id::text, '-', ''), 1, 16)
WHERE username IS NULL OR btrim(username) = '';

-- Helpful for lookups; keep non-unique to avoid failures on existing data.
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles (username);
