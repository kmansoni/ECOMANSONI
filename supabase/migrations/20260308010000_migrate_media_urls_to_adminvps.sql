-- =============================================================================
-- Миграция: Замена URL Supabase Storage → media.mansoni.ru (AdminVPS/MinIO)
-- =============================================================================
-- Версия: 20260308010000
-- Описание: Заменяет все URL формата
--   https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
--   на:
--   https://media.mansoni.ru/<bucket>/<path>
--
-- Паттерн замены (regexp_replace):
--   Pattern : https://[^/]+\.supabase\.co/storage/v1/object/public/
--   Replace : https://media.mansoni.ru/
--
-- Идемпотентность: WHERE LIKE '%supabase.co/storage/%' гарантирует,
--   что повторный запуск не затронет уже мигрированные строки.
--
-- ROLLBACK: см. блок в конце файла (закомментирован)
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_count BIGINT;
BEGIN

  -- -----------------------------------------------------------------------
  -- 1. profiles.avatar_url
  -- -----------------------------------------------------------------------
  UPDATE profiles
  SET    avatar_url = regexp_replace(
           avatar_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  avatar_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] profiles.avatar_url: обновлено % строк', v_count;

  -- -----------------------------------------------------------------------
  -- 2. post_media.media_url
  -- -----------------------------------------------------------------------
  UPDATE post_media
  SET    media_url = regexp_replace(
           media_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  media_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] post_media.media_url: обновлено % строк', v_count;

  -- -----------------------------------------------------------------------
  -- 3. stories.media_url
  -- -----------------------------------------------------------------------
  UPDATE stories
  SET    media_url = regexp_replace(
           media_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  media_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] stories.media_url: обновлено % строк', v_count;

  -- -----------------------------------------------------------------------
  -- 4. messages.media_url
  -- -----------------------------------------------------------------------
  UPDATE messages
  SET    media_url = regexp_replace(
           media_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  media_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] messages.media_url: обновлено % строк', v_count;

  -- -----------------------------------------------------------------------
  -- 5. reels.video_url
  -- -----------------------------------------------------------------------
  UPDATE reels
  SET    video_url = regexp_replace(
           video_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  video_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] reels.video_url: обновлено % строк', v_count;

  -- -----------------------------------------------------------------------
  -- 6. reels.thumbnail_url
  -- -----------------------------------------------------------------------
  UPDATE reels
  SET    thumbnail_url = regexp_replace(
           thumbnail_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  thumbnail_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] reels.thumbnail_url: обновлено % строк', v_count;

  -- -----------------------------------------------------------------------
  -- 7. channels.avatar_url
  -- -----------------------------------------------------------------------
  UPDATE channels
  SET    avatar_url = regexp_replace(
           avatar_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  avatar_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] channels.avatar_url: обновлено % строк', v_count;

  -- -----------------------------------------------------------------------
  -- 8. group_chats.avatar_url
  -- -----------------------------------------------------------------------
  UPDATE group_chats
  SET    avatar_url = regexp_replace(
           avatar_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  avatar_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] group_chats.avatar_url: обновлено % строк', v_count;

  -- -----------------------------------------------------------------------
  -- 9. story_highlights.cover_url
  -- -----------------------------------------------------------------------
  UPDATE story_highlights
  SET    cover_url = regexp_replace(
           cover_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  cover_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] story_highlights.cover_url: обновлено % строк', v_count;

  -- -----------------------------------------------------------------------
  -- 10. properties.image_url
  -- -----------------------------------------------------------------------
  UPDATE properties
  SET    image_url = regexp_replace(
           image_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  image_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] properties.image_url: обновлено % строк', v_count;

  -- -----------------------------------------------------------------------
  -- 11. live_sessions.thumbnail_url
  -- -----------------------------------------------------------------------
  UPDATE live_sessions
  SET    thumbnail_url = regexp_replace(
           thumbnail_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  thumbnail_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] live_sessions.thumbnail_url: обновлено % строк', v_count;

  -- -----------------------------------------------------------------------
  -- 12. voice_messages.audio_url
  -- -----------------------------------------------------------------------
  UPDATE voice_messages
  SET    audio_url = regexp_replace(
           audio_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  audio_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] voice_messages.audio_url: обновлено % строк', v_count;

  -- -----------------------------------------------------------------------
  -- 13. sticker_packs.thumbnail_url
  -- -----------------------------------------------------------------------
  UPDATE sticker_packs
  SET    thumbnail_url = regexp_replace(
           thumbnail_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  thumbnail_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] sticker_packs.thumbnail_url: обновлено % строк', v_count;

  -- -----------------------------------------------------------------------
  -- 14. bots.avatar_url
  -- -----------------------------------------------------------------------
  UPDATE bots
  SET    avatar_url = regexp_replace(
           avatar_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  avatar_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] bots.avatar_url: обновлено % строк', v_count;

  -- -----------------------------------------------------------------------
  -- 15. playlists.cover_url
  -- -----------------------------------------------------------------------
  UPDATE playlists
  SET    cover_url = regexp_replace(
           cover_url,
           'https://[^/]+\.supabase\.co/storage/v1/object/public/',
           'https://media.mansoni.ru/',
           'g'
         )
  WHERE  cover_url LIKE '%supabase.co/storage/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[migrate_media_urls] playlists.cover_url: обновлено % строк', v_count;

  RAISE NOTICE '[migrate_media_urls] ✅ Миграция URL завершена успешно.';

END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (выполнить вручную при необходимости отката):
-- Заменить https://media.mansoni.ru/ обратно на Supabase URL.
-- ВНИМАНИЕ: PROJECT_REF нужно подставить вручную!
-- =============================================================================
/*
BEGIN;
DO $$
DECLARE
  v_project_ref TEXT := 'YOUR_PROJECT_REF'; -- ← подставить реальный ref
  v_old_prefix  TEXT;
  v_new_prefix  TEXT := 'https://media.mansoni.ru/';
BEGIN
  v_old_prefix := format('https://%s.supabase.co/storage/v1/object/public/', v_project_ref);

  UPDATE profiles       SET avatar_url    = replace(avatar_url,    v_new_prefix, v_old_prefix) WHERE avatar_url    LIKE 'https://media.mansoni.ru/%';
  UPDATE post_media     SET media_url     = replace(media_url,     v_new_prefix, v_old_prefix) WHERE media_url     LIKE 'https://media.mansoni.ru/%';
  UPDATE stories        SET media_url     = replace(media_url,     v_new_prefix, v_old_prefix) WHERE media_url     LIKE 'https://media.mansoni.ru/%';
  UPDATE messages       SET media_url     = replace(media_url,     v_new_prefix, v_old_prefix) WHERE media_url     LIKE 'https://media.mansoni.ru/%';
  UPDATE reels          SET video_url     = replace(video_url,     v_new_prefix, v_old_prefix) WHERE video_url     LIKE 'https://media.mansoni.ru/%';
  UPDATE reels          SET thumbnail_url = replace(thumbnail_url, v_new_prefix, v_old_prefix) WHERE thumbnail_url LIKE 'https://media.mansoni.ru/%';
  UPDATE channels       SET avatar_url    = replace(avatar_url,    v_new_prefix, v_old_prefix) WHERE avatar_url    LIKE 'https://media.mansoni.ru/%';
  UPDATE group_chats    SET avatar_url    = replace(avatar_url,    v_new_prefix, v_old_prefix) WHERE avatar_url    LIKE 'https://media.mansoni.ru/%';
  UPDATE story_highlights SET cover_url   = replace(cover_url,     v_new_prefix, v_old_prefix) WHERE cover_url     LIKE 'https://media.mansoni.ru/%';
  UPDATE properties     SET image_url     = replace(image_url,     v_new_prefix, v_old_prefix) WHERE image_url     LIKE 'https://media.mansoni.ru/%';
  UPDATE live_sessions  SET thumbnail_url = replace(thumbnail_url, v_new_prefix, v_old_prefix) WHERE thumbnail_url LIKE 'https://media.mansoni.ru/%';
  UPDATE voice_messages SET audio_url     = replace(audio_url,     v_new_prefix, v_old_prefix) WHERE audio_url     LIKE 'https://media.mansoni.ru/%';
  UPDATE sticker_packs  SET thumbnail_url = replace(thumbnail_url, v_new_prefix, v_old_prefix) WHERE thumbnail_url LIKE 'https://media.mansoni.ru/%';
  UPDATE bots           SET avatar_url    = replace(avatar_url,    v_new_prefix, v_old_prefix) WHERE avatar_url    LIKE 'https://media.mansoni.ru/%';
  UPDATE playlists      SET cover_url     = replace(cover_url,     v_new_prefix, v_old_prefix) WHERE cover_url     LIKE 'https://media.mansoni.ru/%';

  RAISE NOTICE '[rollback] URL восстановлены на Supabase Storage.';
END $$;
COMMIT;
*/
