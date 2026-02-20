-- Telegram-like: Data & Storage settings + Chat Folders

-- =====================================================
-- 1) Extend user_settings for Data & Storage
-- =====================================================

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS media_auto_download_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS media_auto_download_photos BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS media_auto_download_videos BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS media_auto_download_files BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS media_auto_download_files_max_mb INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS cache_auto_delete_days INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS cache_max_size_mb INTEGER;

-- =====================================================
-- 2) Chat folders (server-side, sync across devices)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.chat_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_folder_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES public.chat_folders(id) ON DELETE CASCADE,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('dm','group','channel')),
  item_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(folder_id, item_kind, item_id)
);

ALTER TABLE public.chat_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_folder_items ENABLE ROW LEVEL SECURITY;

-- RLS: folders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='chat_folders' AND policyname='Users can view own chat folders'
  ) THEN
    CREATE POLICY "Users can view own chat folders" ON public.chat_folders
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='chat_folders' AND policyname='Users can insert own chat folders'
  ) THEN
    CREATE POLICY "Users can insert own chat folders" ON public.chat_folders
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='chat_folders' AND policyname='Users can update own chat folders'
  ) THEN
    CREATE POLICY "Users can update own chat folders" ON public.chat_folders
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='chat_folders' AND policyname='Users can delete own chat folders'
  ) THEN
    CREATE POLICY "Users can delete own chat folders" ON public.chat_folders
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- RLS: items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='chat_folder_items' AND policyname='Users can view own folder items'
  ) THEN
    CREATE POLICY "Users can view own folder items" ON public.chat_folder_items
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.chat_folders f
          WHERE f.id = folder_id AND f.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='chat_folder_items' AND policyname='Users can insert own folder items'
  ) THEN
    CREATE POLICY "Users can insert own folder items" ON public.chat_folder_items
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.chat_folders f
          WHERE f.id = folder_id AND f.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='chat_folder_items' AND policyname='Users can delete own folder items'
  ) THEN
    CREATE POLICY "Users can delete own folder items" ON public.chat_folder_items
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM public.chat_folders f
          WHERE f.id = folder_id AND f.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- updated_at trigger
DROP TRIGGER IF EXISTS update_chat_folders_updated_at ON public.chat_folders;
CREATE TRIGGER update_chat_folders_updated_at
BEFORE UPDATE ON public.chat_folders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_folders;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_folder_items;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;
