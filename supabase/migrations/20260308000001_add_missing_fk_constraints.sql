-- ============================================================
-- Migration: Add missing FK constraints to core Instagram tables
-- Priority: P0 — prevents orphaned records on user deletion
-- Date: 2026-03-08
-- ============================================================

-- NOTE: All constraints use ON DELETE CASCADE so that deleting
-- a user automatically removes all their content. This matches
-- Instagram's behaviour (account deletion removes all posts/stories/etc).

-- ============================================================
-- 1. posts.author_id → auth.users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_posts_author_id'
      AND table_name = 'posts'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT fk_posts_author_id
      FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 2. stories.author_id → auth.users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_stories_author_id'
      AND table_name = 'stories'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.stories
      ADD CONSTRAINT fk_stories_author_id
      FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 3. reels.author_id → auth.users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_reels_author_id'
      AND table_name = 'reels'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.reels
      ADD CONSTRAINT fk_reels_author_id
      FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 4. comments.author_id → auth.users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_comments_author_id'
      AND table_name = 'comments'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT fk_comments_author_id
      FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 5. reel_comments.author_id → auth.users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_reel_comments_author_id'
      AND table_name = 'reel_comments'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.reel_comments
      ADD CONSTRAINT fk_reel_comments_author_id
      FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 6. followers.follower_id → auth.users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_followers_follower_id'
      AND table_name = 'followers'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.followers
      ADD CONSTRAINT fk_followers_follower_id
      FOREIGN KEY (follower_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 7. followers.following_id → auth.users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_followers_following_id'
      AND table_name = 'followers'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.followers
      ADD CONSTRAINT fk_followers_following_id
      FOREIGN KEY (following_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 8. notifications.user_id → auth.users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_notifications_user_id'
      AND table_name = 'notifications'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT fk_notifications_user_id
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 9. notifications.actor_id → auth.users (SET NULL — actor may be deleted)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_notifications_actor_id'
      AND table_name = 'notifications'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT fk_notifications_actor_id
      FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 10. post_likes.user_id → auth.users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_post_likes_user_id'
      AND table_name = 'post_likes'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.post_likes
      ADD CONSTRAINT fk_post_likes_user_id
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 11. reel_likes.user_id → auth.users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_reel_likes_user_id'
      AND table_name = 'reel_likes'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.reel_likes
      ADD CONSTRAINT fk_reel_likes_user_id
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 12. comment_likes.user_id → auth.users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_comment_likes_user_id'
      AND table_name = 'comment_likes'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.comment_likes
      ADD CONSTRAINT fk_comment_likes_user_id
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 13. reel_comment_likes.user_id → auth.users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_reel_comment_likes_user_id'
      AND table_name = 'reel_comment_likes'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.reel_comment_likes
      ADD CONSTRAINT fk_reel_comment_likes_user_id
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 14. profiles.username — add UNIQUE constraint
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'profiles'
      AND indexname = 'idx_profiles_username_unique'
      AND schemaname = 'public'
  ) THEN
    -- NOTE: CONCURRENTLY is intentionally omitted here because migration runners
    -- execute migrations inside a transaction block, and PostgreSQL forbids
    -- CREATE INDEX CONCURRENTLY inside a transaction. The table is small enough
    -- that a regular index build completes in milliseconds and takes a brief
    -- ShareLock — acceptable for a one-time migration.
    CREATE UNIQUE INDEX idx_profiles_username_unique
      ON public.profiles(username)
      WHERE username IS NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 15. Add reels.duration column (missing field)
-- ============================================================
ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS duration INTEGER; -- seconds

-- ============================================================
-- 16. Add post_media dimensions and thumbnail
-- ============================================================
ALTER TABLE public.post_media
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- ============================================================
-- 17. Fix counter triggers: prevent negative counts
-- Apply GREATEST(0, ...) guard to post_likes counter trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_post_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
      SET likes_count = GREATEST(0, likes_count + 1)
      WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
      SET likes_count = GREATEST(0, likes_count - 1)
      WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- ============================================================
-- 18. Fix comment counter trigger: prevent negative counts
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_post_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
      SET comments_count = GREATEST(0, comments_count + 1)
      WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
      SET comments_count = GREATEST(0, comments_count - 1)
      WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;
