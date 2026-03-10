-- Enforce data integrity for follower relationships.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'followers_follower_id_auth_users_fkey'
      AND conrelid = 'public.followers'::regclass
  ) THEN
    ALTER TABLE public.followers
      ADD CONSTRAINT followers_follower_id_auth_users_fkey
      FOREIGN KEY (follower_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'followers_following_id_auth_users_fkey'
      AND conrelid = 'public.followers'::regclass
  ) THEN
    ALTER TABLE public.followers
      ADD CONSTRAINT followers_following_id_auth_users_fkey
      FOREIGN KEY (following_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'followers_no_self_follow_chk'
      AND conrelid = 'public.followers'::regclass
  ) THEN
    ALTER TABLE public.followers
      ADD CONSTRAINT followers_no_self_follow_chk
      CHECK (follower_id <> following_id)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.followers VALIDATE CONSTRAINT followers_follower_id_auth_users_fkey;
ALTER TABLE public.followers VALIDATE CONSTRAINT followers_following_id_auth_users_fkey;
ALTER TABLE public.followers VALIDATE CONSTRAINT followers_no_self_follow_chk;
