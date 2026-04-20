-- =============================================================================
-- Restore media URLs from media.mansoni.ru back to Supabase public storage.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_old_prefix TEXT := 'https://media.mansoni.ru/';
  v_new_prefix TEXT := 'https://lfkbgnbjxskspsownvjm.supabase.co/storage/v1/object/public/';
  v_count BIGINT;
BEGIN
  UPDATE profiles
  SET avatar_url = replace(avatar_url, v_old_prefix, v_new_prefix)
  WHERE avatar_url LIKE 'https://media.mansoni.ru/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[restore_media_urls] profiles.avatar_url: %', v_count;

  UPDATE post_media
  SET media_url = replace(media_url, v_old_prefix, v_new_prefix)
  WHERE media_url LIKE 'https://media.mansoni.ru/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[restore_media_urls] post_media.media_url: %', v_count;

  UPDATE stories
  SET media_url = replace(media_url, v_old_prefix, v_new_prefix)
  WHERE media_url LIKE 'https://media.mansoni.ru/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[restore_media_urls] stories.media_url: %', v_count;

  UPDATE messages
  SET media_url = replace(media_url, v_old_prefix, v_new_prefix)
  WHERE media_url LIKE 'https://media.mansoni.ru/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[restore_media_urls] messages.media_url: %', v_count;

  UPDATE reels
  SET video_url = replace(video_url, v_old_prefix, v_new_prefix)
  WHERE video_url LIKE 'https://media.mansoni.ru/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[restore_media_urls] reels.video_url: %', v_count;

  UPDATE reels
  SET thumbnail_url = replace(thumbnail_url, v_old_prefix, v_new_prefix)
  WHERE thumbnail_url LIKE 'https://media.mansoni.ru/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[restore_media_urls] reels.thumbnail_url: %', v_count;

  UPDATE channels
  SET avatar_url = replace(avatar_url, v_old_prefix, v_new_prefix)
  WHERE avatar_url LIKE 'https://media.mansoni.ru/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[restore_media_urls] channels.avatar_url: %', v_count;

  UPDATE group_chats
  SET avatar_url = replace(avatar_url, v_old_prefix, v_new_prefix)
  WHERE avatar_url LIKE 'https://media.mansoni.ru/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[restore_media_urls] group_chats.avatar_url: %', v_count;

  UPDATE story_highlights
  SET cover_url = replace(cover_url, v_old_prefix, v_new_prefix)
  WHERE cover_url LIKE 'https://media.mansoni.ru/%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[restore_media_urls] story_highlights.cover_url: %', v_count;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'properties'
      AND column_name = 'image_url'
  ) THEN
    UPDATE properties
    SET image_url = replace(image_url, v_old_prefix, v_new_prefix)
    WHERE image_url LIKE 'https://media.mansoni.ru/%';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '[restore_media_urls] properties.image_url: %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'live_sessions'
      AND column_name = 'thumbnail_url'
  ) THEN
    UPDATE live_sessions
    SET thumbnail_url = replace(thumbnail_url, v_old_prefix, v_new_prefix)
    WHERE thumbnail_url LIKE 'https://media.mansoni.ru/%';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '[restore_media_urls] live_sessions.thumbnail_url: %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'voice_messages'
      AND column_name = 'audio_url'
  ) THEN
    UPDATE voice_messages
    SET audio_url = replace(audio_url, v_old_prefix, v_new_prefix)
    WHERE audio_url LIKE 'https://media.mansoni.ru/%';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '[restore_media_urls] voice_messages.audio_url: %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sticker_packs'
      AND column_name = 'thumbnail_url'
  ) THEN
    UPDATE sticker_packs
    SET thumbnail_url = replace(thumbnail_url, v_old_prefix, v_new_prefix)
    WHERE thumbnail_url LIKE 'https://media.mansoni.ru/%';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '[restore_media_urls] sticker_packs.thumbnail_url: %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bots'
      AND column_name = 'avatar_url'
  ) THEN
    UPDATE bots
    SET avatar_url = replace(avatar_url, v_old_prefix, v_new_prefix)
    WHERE avatar_url LIKE 'https://media.mansoni.ru/%';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '[restore_media_urls] bots.avatar_url: %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'playlists'
      AND column_name = 'cover_url'
  ) THEN
    UPDATE playlists
    SET cover_url = replace(cover_url, v_old_prefix, v_new_prefix)
    WHERE cover_url LIKE 'https://media.mansoni.ru/%';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '[restore_media_urls] playlists.cover_url: %', v_count;
  END IF;

  RAISE NOTICE '[restore_media_urls] done';
END $$;

COMMIT;