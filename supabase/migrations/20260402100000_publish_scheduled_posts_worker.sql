-- ============================================================================
-- Publish scheduled posts — pg_cron worker
-- Каждую минуту проверяет посты с scheduled_at <= NOW() и публикует их.
-- ============================================================================

-- Индекс для быстрого поиска ожидающих публикации постов
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_pending
  ON public.posts (scheduled_at)
  WHERE scheduled_at IS NOT NULL AND is_published = false;

-- ============================================================================
-- Функция: publish_scheduled_posts
-- Находит посты, у которых scheduled_at наступило, и ставит is_published = true.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.publish_scheduled_posts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT id
    FROM public.posts
    WHERE scheduled_at IS NOT NULL
      AND scheduled_at <= now()
      AND is_published = false
    ORDER BY scheduled_at ASC
    LIMIT 200
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.posts
    SET is_published = true,
        publish_state = 'published'
    WHERE id = v_row.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Безопасность: только service_role (pg_cron) может вызывать
REVOKE ALL ON FUNCTION public.publish_scheduled_posts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_scheduled_posts() FROM anon;
REVOKE ALL ON FUNCTION public.publish_scheduled_posts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.publish_scheduled_posts() TO service_role;

COMMENT ON FUNCTION public.publish_scheduled_posts() IS
  'Publishes posts whose scheduled_at has arrived. Called by pg_cron every minute.';

-- ============================================================================
-- pg_cron job — каждую минуту
-- ============================================================================
SELECT cron.schedule(
  'publish-scheduled-posts',
  '* * * * *',
  'SELECT public.publish_scheduled_posts()'
);
