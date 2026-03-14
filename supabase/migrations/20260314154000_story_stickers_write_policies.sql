-- Enable story authors to manage their own stickers.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'story_stickers'
      AND policyname = 'story_stickers_insert_author'
  ) THEN
    CREATE POLICY story_stickers_insert_author
      ON public.story_stickers
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.stories s
          WHERE s.id = story_id
            AND s.author_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'story_stickers'
      AND policyname = 'story_stickers_update_author'
  ) THEN
    CREATE POLICY story_stickers_update_author
      ON public.story_stickers
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1
          FROM public.stories s
          WHERE s.id = story_id
            AND s.author_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.stories s
          WHERE s.id = story_id
            AND s.author_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'story_stickers'
      AND policyname = 'story_stickers_delete_author'
  ) THEN
    CREATE POLICY story_stickers_delete_author
      ON public.story_stickers
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1
          FROM public.stories s
          WHERE s.id = story_id
            AND s.author_id = auth.uid()
        )
      );
  END IF;
END $$;