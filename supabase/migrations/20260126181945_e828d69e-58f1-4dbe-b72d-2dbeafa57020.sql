-- Remove duplicate trigger that increments/decrements post comments_count twice
DROP TRIGGER IF EXISTS update_post_comments_count_trigger ON public.comments;