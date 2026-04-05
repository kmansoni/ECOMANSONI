-- Синхронизация: storage.objects → public.reels
-- 22 видео загружены в reels-media бакет, но 0 строк в таблице reels.
-- Строим публичные URL и вставляем записи для существующих пользователей.

-- Фикс бага: extract_hashtags() использовал regexp_replace(text[], ...) вместо text
CREATE OR REPLACE FUNCTION public.extract_hashtags(p_text text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_hashtags TEXT[];
BEGIN
  IF p_text IS NULL OR p_text = '' THEN
    RETURN ARRAY[]::TEXT[];
  END IF;
  SELECT array_agg(DISTINCT lower(regexp_replace(m[1], '^#', '')))
  INTO v_hashtags
  FROM regexp_matches(p_text, '#[а-яА-ЯёЁa-zA-Z0-9_]+', 'g') AS m;
  RETURN COALESCE(v_hashtags, ARRAY[]::TEXT[]);
END;
$$;

DO $$
DECLARE
  supabase_url TEXT;
  inserted_count INT := 0;
BEGIN
  -- URL проекта для построения публичных ссылок на storage
  supabase_url := current_setting('app.settings.supabase_url', true);
  IF supabase_url IS NULL OR supabase_url = '' THEN
    supabase_url := 'https://lfkbgnbjxskspsownvjm.supabase.co';
  END IF;

  INSERT INTO public.reels (author_id, video_url, moderation_status, created_at)
  SELECT
    (split_part(so.name, '/', 1))::uuid,
    supabase_url || '/storage/v1/object/public/reels-media/' || so.name,
    'clean',
    so.created_at
  FROM storage.objects so
  WHERE so.bucket_id = 'reels-media'
    AND (so.metadata->>'mimetype') LIKE 'video/%'
    AND EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = (split_part(so.name, '/', 1))::uuid
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.video_url = supabase_url || '/storage/v1/object/public/reels-media/' || so.name
    );

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RAISE NOTICE 'reels synced from storage: % rows inserted', inserted_count;
END $$;
