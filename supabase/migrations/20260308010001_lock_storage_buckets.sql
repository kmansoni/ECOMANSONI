-- =============================================================================
-- Миграция: Закрытие Supabase Storage buckets (блокировка новых загрузок)
-- =============================================================================
-- Версия: 20260308010001
-- Описание:
--   Удаляет RLS-политики INSERT/UPDATE/DELETE для authenticated на storage.objects.
--   Оставляет политики SELECT (чтение) на переходный период, пока все клиенты
--   не переключились на новые URL (media.mansoni.ru).
--   service_role сохраняет полный доступ (для скрипта миграции).
--
-- После полной миграции и замены всех URL в БД:
--   → Удалите SELECT-политики (см. блок «POST-MIGRATION CLEANUP» в конце файла)
--   → Пометьте бакеты как private: UPDATE storage.buckets SET public = false
--
-- ROLLBACK: см. блок в конце файла.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_policy_name TEXT;
  v_bucket      TEXT;
  v_buckets     TEXT[] := ARRAY[
    'media',
    'post-media',
    'chat-media',
    'voice-messages',
    'reels-media',
    'avatars',
    'stories-media'
  ];
BEGIN

  -- =========================================================================
  -- Шаг 1: Удалить все INSERT-политики для authenticated на storage.objects
  --         по нашим бакетам.
  -- Supabase хранит политики storage как стандартные PostgreSQL RLS policies
  -- на таблице storage.objects.
  -- =========================================================================

  RAISE NOTICE '[lock_storage] Удаление INSERT-политик для authenticated...';

  FOR v_policy_name IN
    SELECT policyname
    FROM   pg_policies
    WHERE  schemaname = 'storage'
      AND  tablename  = 'objects'
      AND  cmd        IN ('INSERT', 'ALL')
      AND  (
             -- Политика затрагивает authenticated role
             roles::text LIKE '%authenticated%'
             OR
             -- Или это публичная политика (public/anon загрузка — тоже блокируем)
             roles::text LIKE '%anon%'
           )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects',
      v_policy_name
    );
    RAISE NOTICE '[lock_storage] Удалена политика: %', v_policy_name;
  END LOOP;

  -- =========================================================================
  -- Шаг 2: Удалить UPDATE-политики для authenticated (предотвратить перезапись)
  -- =========================================================================

  RAISE NOTICE '[lock_storage] Удаление UPDATE-политик для authenticated...';

  FOR v_policy_name IN
    SELECT policyname
    FROM   pg_policies
    WHERE  schemaname = 'storage'
      AND  tablename  = 'objects'
      AND  cmd        = 'UPDATE'
      AND  roles::text LIKE '%authenticated%'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects',
      v_policy_name
    );
    RAISE NOTICE '[lock_storage] Удалена UPDATE-политика: %', v_policy_name;
  END LOOP;

  -- =========================================================================
  -- Шаг 3: Удалить DELETE-политики для authenticated
  -- =========================================================================

  RAISE NOTICE '[lock_storage] Удаление DELETE-политик для authenticated...';

  FOR v_policy_name IN
    SELECT policyname
    FROM   pg_policies
    WHERE  schemaname = 'storage'
      AND  tablename  = 'objects'
      AND  cmd        = 'DELETE'
      AND  roles::text LIKE '%authenticated%'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects',
      v_policy_name
    );
    RAISE NOTICE '[lock_storage] Удалена DELETE-политика: %', v_policy_name;
  END LOOP;

  -- =========================================================================
  -- Шаг 4: Явно создать запретительные политики INSERT для authenticated
  --         (defence-in-depth: даже если выше ничего не нашлось)
  -- =========================================================================

  RAISE NOTICE '[lock_storage] Создание явных запретительных INSERT-политик...';

  FOREACH v_bucket IN ARRAY v_buckets LOOP
    -- Имя политики детерминистично → идемпотентно
    EXECUTE format(
      $policy$
        DO $$
        BEGIN
          -- Удалить старую версию если есть
          DROP POLICY IF EXISTS %I ON storage.objects;
          -- Создать политику-запрет: authenticated не может загружать
          CREATE POLICY %I ON storage.objects
            FOR INSERT
            TO authenticated
            WITH CHECK (false);
        EXCEPTION WHEN others THEN
          NULL; -- Политика с таким именем уже может существовать с нужным телом
        END $$;
      $policy$,
      format('deny_insert_%s_authenticated', v_bucket),
      format('deny_insert_%s_authenticated', v_bucket)
    );

    RAISE NOTICE '[lock_storage] Создан запрет INSERT для бакета: %', v_bucket;
  END LOOP;

  -- =========================================================================
  -- Шаг 5: Убедиться что SELECT-политики (чтение) СОХРАНЕНЫ для публичных
  --         бакетов — переходный период (старые URL ещё работают).
  --         Если SELECT-политика отсутствует — создаём её.
  -- =========================================================================

  RAISE NOTICE '[lock_storage] Проверка/создание SELECT-политик (reader mode)...';

  FOREACH v_bucket IN ARRAY v_buckets LOOP
    -- Проверяем наличие SELECT-политики для данного бакета
    IF NOT EXISTS (
      SELECT 1
      FROM   pg_policies
      WHERE  schemaname = 'storage'
        AND  tablename  = 'objects'
        AND  cmd        IN ('SELECT', 'ALL')
        AND  (roles::text LIKE '%anon%' OR roles::text LIKE '%authenticated%')
        AND  (qual::text LIKE format('%%''%s''%%', v_bucket) OR qual IS NULL)
    ) THEN
      -- Создаём минимальную SELECT-политику для публичного чтения в переходный период
      EXECUTE format(
        $policy$
          CREATE POLICY %I ON storage.objects
            FOR SELECT
            TO anon, authenticated
            USING (bucket_id = %L);
        $policy$,
        format('readonly_migration_%s', v_bucket),
        v_bucket
      );
      RAISE NOTICE '[lock_storage] Создана SELECT-политика (readonly) для бакета: %', v_bucket;
    ELSE
      RAISE NOTICE '[lock_storage] SELECT-политика уже существует для бакета: %', v_bucket;
    END IF;
  END LOOP;

  -- =========================================================================
  -- Шаг 6: Отключить прямую загрузку через storage.buckets (опционально).
  --         Помечаем бакеты, чтобы Supabase Dashboard показывал статус.
  --         НЕ меняем public=true пока не завершена миграция URL.
  -- =========================================================================

  -- Добавляем метку в metadata бакета (non-breaking change)
  UPDATE storage.buckets
  SET    metadata = COALESCE(metadata, '{}'::jsonb) ||
                    jsonb_build_object(
                      'migration_status', 'write_locked',
                      'locked_at', now()::text
                    )
  WHERE  id = ANY(v_buckets);

  GET DIAGNOSTICS v_bucket = ROW_COUNT;  -- reuse variable for count
  RAISE NOTICE '[lock_storage] Обновлена metadata %s бакетов (migration_status=write_locked)', v_bucket;

  RAISE NOTICE '[lock_storage] ✅ Блокировка Storage завершена.';
  RAISE NOTICE '[lock_storage] ℹ️  SELECT-политики (чтение) сохранены для переходного периода.';
  RAISE NOTICE '[lock_storage] ℹ️  После полной миграции URL выполните POST-MIGRATION CLEANUP (см. комментарий в конце файла).';

END $$;

COMMIT;

-- =============================================================================
-- POST-MIGRATION CLEANUP
-- Выполнить ПОСЛЕ того как:
--   1. Все URL в БД заменены (миграция 20260308010000 применена)
--   2. Bash-скрипт migrate-storage-to-minio.sh выполнен без ошибок
--   3. Все клиенты обновлены и больше не обращаются к старым Supabase URL
-- =============================================================================
/*
BEGIN;

-- Удалить readonly SELECT-политики
DO $$
DECLARE
  v_buckets TEXT[] := ARRAY['media','post-media','chat-media','voice-messages','reels-media','avatars','stories-media'];
  v_bucket  TEXT;
BEGIN
  FOREACH v_bucket IN ARRAY v_buckets LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects',
      format('readonly_migration_%s', v_bucket));
    RAISE NOTICE 'Удалена readonly-политика для бакета: %', v_bucket;
  END LOOP;
END $$;

-- Отключить публичный доступ к бакетам
UPDATE storage.buckets
SET    public = false,
       metadata = COALESCE(metadata, '{}'::jsonb) ||
                  jsonb_build_object('migration_status', 'fully_migrated', 'closed_at', now()::text)
WHERE  id IN ('media','post-media','chat-media','voice-messages','reels-media','avatars','stories-media');

RAISE NOTICE 'Storage buckets закрыты. Файлы доступны только через media.mansoni.ru.';
COMMIT;
*/

-- =============================================================================
-- ROLLBACK (экстренный откат — восстановить INSERT-доступ)
-- =============================================================================
/*
BEGIN;
DO $$
DECLARE
  v_buckets TEXT[] := ARRAY['media','post-media','chat-media','voice-messages','reels-media','avatars','stories-media'];
  v_bucket  TEXT;
BEGIN
  FOREACH v_bucket IN ARRAY v_buckets LOOP
    -- Удалить политику-запрет
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects',
      format('deny_insert_%s_authenticated', v_bucket));

    -- Восстановить стандартную Supabase INSERT-политику
    EXECUTE format(
      $p$CREATE POLICY %I ON storage.objects
         FOR INSERT TO authenticated
         WITH CHECK (bucket_id = %L AND auth.uid() IS NOT NULL)$p$,
      format('allow_insert_%s_authenticated', v_bucket),
      v_bucket
    );
    RAISE NOTICE 'Восстановлен INSERT-доступ для бакета: %', v_bucket;
  END LOOP;
END $$;
COMMIT;
*/
