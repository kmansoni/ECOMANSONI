-- Триггер для comments_count (если не существует)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_post_comment_change') THEN
    CREATE TRIGGER on_post_comment_change
    AFTER INSERT OR DELETE ON public.comments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_post_comments_count();
  END IF;
END $$;

-- Триггер для views_count (если не существует)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_post_view_insert') THEN
    CREATE TRIGGER on_post_view_insert
    AFTER INSERT ON public.post_views
    FOR EACH ROW
    EXECUTE FUNCTION public.increment_post_views();
  END IF;
END $$;