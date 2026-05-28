-- ============================================================================
-- Post Reminders Notification Worker — pg_cron
-- Каждую минуту отправляет push-уведомления для напоминаний о постах.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Partial index для быстрого поиска pending напоминаний
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_post_reminders_pending
  ON public.post_reminders (remind_at)
  WHERE notified = false;
-- ---------------------------------------------------------------------------
-- Функция-обёртка для pg_cron (вызывает Edge Function через X-Internal-Call)
-- Edge Function post-reminder-notify использует service_role и X-Internal-Call header
-- для внутреннего вызова без Bearer token.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_post_reminder_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_ref TEXT;
  v_func_url TEXT;
BEGIN
  -- Получаем project ref из current_setting
  BEGIN
    v_project_ref := current_setting('app.supabase_project_ref', true);
  EXCEPTION WHEN OTHERS THEN
    v_project_ref := NULL;
  END;

  -- Если project_ref не настроен, используем fallback через API
  -- Supabase Edge Functions доступны по адресу:
  -- https://<project-ref>.supabase.co/functions/v1/<function-name>
  IF v_project_ref IS NOT NULL AND v_project_ref != '' THEN
    v_func_url := 'https://' || v_project_ref || '.supabase.co/functions/v1/post-reminder-notify';
  ELSE
    -- Fallback: логируем что функция не вызвана
    RAISE NOTICE 'post-reminder-notify skipped: app.supabase_project_ref not set';
    RETURN;
  END IF;

  -- Вызываем Edge Function с X-Internal-Call: 1 header
  -- Edge Function проверяет этот header для internal calls
  PERFORM net.http_post(
    url := v_func_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Call', '1'
    ),
    body := '{"cron":true}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  -- Логируем ошибку но не падаем — cron job должен продолжать работать
  RAISE WARNING 'trigger_post_reminder_notifications failed: %', SQLERRM;
END;
$$;
-- Безопасность: только service_role может вызывать
REVOKE ALL ON FUNCTION public.trigger_post_reminder_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_post_reminder_notifications() FROM anon;
REVOKE ALL ON FUNCTION public.trigger_post_reminder_notifications() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_post_reminder_notifications() TO service_role;
COMMENT ON FUNCTION public.trigger_post_reminder_notifications() IS
  'Calls post-reminder-notify Edge Function. Scheduled by pg_cron every minute.';
-- ---------------------------------------------------------------------------
-- pg_cron schedule — каждую минуту
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_existing_job_id BIGINT;
BEGIN
  SELECT jobid
  INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'post-reminder-notify'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'post-reminder-notify',
    '* * * * *',
    'SELECT public.trigger_post_reminder_notifications()'
  );
END;
$$;
-- ---------------------------------------------------------------------------
-- Настройка project_ref (выполнить после деплоя)
-- ---------------------------------------------------------------------------
-- ALTER DATABASE CURRENT SET app.supabase_project_ref = 'your-project-ref';
-- или через Supabase Dashboard → Settings → Database → Extensions → plv8 → Configuration;
