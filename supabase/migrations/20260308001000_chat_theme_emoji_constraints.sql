-- Harden conversations.theme and conversations.emoji domain constraints.
-- This migration is idempotent and safe for existing datasets.

BEGIN;

UPDATE public.conversations
SET theme = 'default'
WHERE theme IS NULL
  OR theme NOT IN (
    'default',
    'midnight',
    'rose',
    'ocean',
    'forest',
    'sunset',
    'purple',
    'gold',
    'pink',
    'teal',
    'red',
    'blue'
  );

UPDATE public.conversations
SET emoji = '❤️'
WHERE emoji IS NULL
  OR btrim(emoji) = ''
  OR char_length(emoji) > 16;

ALTER TABLE public.conversations
  ALTER COLUMN theme SET DEFAULT 'default',
  ALTER COLUMN emoji SET DEFAULT '❤️';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_theme_allowed'
      AND conrelid = 'public.conversations'::regclass
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_theme_allowed
      CHECK (
        theme IN (
          'default',
          'midnight',
          'rose',
          'ocean',
          'forest',
          'sunset',
          'purple',
          'gold',
          'pink',
          'teal',
          'red',
          'blue'
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_emoji_format'
      AND conrelid = 'public.conversations'::regclass
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_emoji_format
      CHECK (
        char_length(btrim(emoji)) BETWEEN 1 AND 16
      );
  END IF;
END
$$;

COMMIT;
