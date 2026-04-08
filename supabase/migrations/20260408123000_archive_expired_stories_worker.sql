-- ============================================================================
-- Archive expired stories — pg_cron worker
-- Явно архивирует истекшие stories без зависимости от открытия экрана клиентом.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.archive_expired_stories_v1()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO public.archived_stories (user_id, story_id, archived_at)
  SELECT s.author_id, s.id, s.expires_at
  FROM public.stories s
  WHERE s.expires_at <= now()
  ON CONFLICT (user_id, story_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_expired_stories_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_expired_stories_v1() FROM anon;
REVOKE ALL ON FUNCTION public.archive_expired_stories_v1() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.archive_expired_stories_v1() TO service_role;

COMMENT ON FUNCTION public.archive_expired_stories_v1() IS
  'Archives expired stories into archived_stories. Called by pg_cron every 5 minutes.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.schedule(
        'archive-expired-stories',
        '*/5 * * * *',
        'SELECT public.archive_expired_stories_v1()'
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END$$;