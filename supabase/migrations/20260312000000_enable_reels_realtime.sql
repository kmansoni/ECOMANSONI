-- Добавить таблицы reels в Supabase Realtime публикацию
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reels;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_likes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_comments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_comment_likes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
