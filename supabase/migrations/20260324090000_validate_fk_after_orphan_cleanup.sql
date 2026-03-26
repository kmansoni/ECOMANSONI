-- ============================================================
-- Migration: Validate FK constraints after orphan cleanup
-- Date: 2026-03-24
-- Purpose:
-- 1) Remove or normalize orphan rows created before FK rollout
-- 2) Validate previously added NOT VALID constraints
-- ============================================================

-- 1) Clean up orphan references to auth.users

-- Content ownership tables: orphan owners are deleted because content cannot
-- be reliably reassigned.
DELETE FROM public.posts p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.author_id);

DELETE FROM public.stories s
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.author_id);

DELETE FROM public.reels r
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.author_id);

DELETE FROM public.comments c
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.author_id);

DELETE FROM public.reel_comments rc
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = rc.author_id);

-- Followers and likes tables: remove orphan edges.
DELETE FROM public.followers f
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = f.follower_id)
   OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = f.following_id);

DELETE FROM public.post_likes pl
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = pl.user_id);

DELETE FROM public.reel_likes rl
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = rl.user_id);

DELETE FROM public.comment_likes cl
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = cl.user_id);

DELETE FROM public.reel_comment_likes rcl
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = rcl.user_id);

-- Notifications: in this schema actor_id is NOT NULL, so orphan actor rows
-- are removed (cannot be normalized to NULL safely).
DELETE FROM public.notifications n
WHERE n.actor_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = n.actor_id);

DELETE FROM public.notifications n
WHERE n.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = n.user_id);

-- 2) Validate constraints if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_posts_author_id') THEN
    ALTER TABLE public.posts VALIDATE CONSTRAINT fk_posts_author_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stories_author_id') THEN
    ALTER TABLE public.stories VALIDATE CONSTRAINT fk_stories_author_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_reels_author_id') THEN
    ALTER TABLE public.reels VALIDATE CONSTRAINT fk_reels_author_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_comments_author_id') THEN
    ALTER TABLE public.comments VALIDATE CONSTRAINT fk_comments_author_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_reel_comments_author_id') THEN
    ALTER TABLE public.reel_comments VALIDATE CONSTRAINT fk_reel_comments_author_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_followers_follower_id') THEN
    ALTER TABLE public.followers VALIDATE CONSTRAINT fk_followers_follower_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_followers_following_id') THEN
    ALTER TABLE public.followers VALIDATE CONSTRAINT fk_followers_following_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notifications_user_id') THEN
    ALTER TABLE public.notifications VALIDATE CONSTRAINT fk_notifications_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notifications_actor_id') THEN
    ALTER TABLE public.notifications VALIDATE CONSTRAINT fk_notifications_actor_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_post_likes_user_id') THEN
    ALTER TABLE public.post_likes VALIDATE CONSTRAINT fk_post_likes_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_reel_likes_user_id') THEN
    ALTER TABLE public.reel_likes VALIDATE CONSTRAINT fk_reel_likes_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_comment_likes_user_id') THEN
    ALTER TABLE public.comment_likes VALIDATE CONSTRAINT fk_comment_likes_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_reel_comment_likes_user_id') THEN
    ALTER TABLE public.reel_comment_likes VALIDATE CONSTRAINT fk_reel_comment_likes_user_id;
  END IF;
END $$;
