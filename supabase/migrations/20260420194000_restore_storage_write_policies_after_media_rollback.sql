-- =============================================================================
-- Restore Supabase Storage writes after media.mansoni.ru rollback.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_bucket TEXT;
  v_buckets TEXT[] := ARRAY['media', 'post-media', 'chat-media', 'voice-messages', 'reels-media', 'avatars', 'stories-media'];
BEGIN
  FOREACH v_bucket IN ARRAY v_buckets LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', format('deny_insert_%s_authenticated', v_bucket));
  END LOOP;

  DROP POLICY IF EXISTS "media_upload_own_prefix" ON storage.objects;
  CREATE POLICY "media_upload_own_prefix" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'media'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  DROP POLICY IF EXISTS "media_delete_own" ON storage.objects;
  CREATE POLICY "media_delete_own" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'media'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  DROP POLICY IF EXISTS "Users can upload post media" ON storage.objects;
  CREATE POLICY "Users can upload post media" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'post-media' AND auth.uid() IS NOT NULL);

  DROP POLICY IF EXISTS "Users can upload chat media" ON storage.objects;
  CREATE POLICY "Users can upload chat media" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'chat-media' AND auth.uid() IS NOT NULL);

  DROP POLICY IF EXISTS "Users can upload stories media" ON storage.objects;
  CREATE POLICY "Users can upload stories media" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'stories-media' AND auth.uid() IS NOT NULL);

  DROP POLICY IF EXISTS "Users can delete own stories media" ON storage.objects;
  CREATE POLICY "Users can delete own stories media" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'stories-media' AND auth.uid()::text = (storage.foldername(name))[1]);

  DROP POLICY IF EXISTS "Users can upload their own reels" ON storage.objects;
  CREATE POLICY "Users can upload their own reels" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'reels-media'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );

  DROP POLICY IF EXISTS "Users can update their own reels" ON storage.objects;
  CREATE POLICY "Users can update their own reels" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'reels-media'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );

  DROP POLICY IF EXISTS "Users can delete their own reels" ON storage.objects;
  CREATE POLICY "Users can delete their own reels" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'reels-media'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );

  DROP POLICY IF EXISTS "allow_insert_avatars_authenticated" ON storage.objects;
  CREATE POLICY "allow_insert_avatars_authenticated" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

  DROP POLICY IF EXISTS "allow_insert_voice_messages_authenticated" ON storage.objects;
  CREATE POLICY "allow_insert_voice_messages_authenticated" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'voice-messages' AND auth.uid() IS NOT NULL);

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
      AND column_name = 'metadata'
  ) THEN
    UPDATE storage.buckets
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('migration_status', 'write_restored', 'restored_at', now()::text)
    WHERE id = ANY(v_buckets);
  END IF;
END $$;

COMMIT;