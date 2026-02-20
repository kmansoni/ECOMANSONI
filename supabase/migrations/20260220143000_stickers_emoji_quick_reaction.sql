-- Stickers / Emoji / Quick reaction baseline.

-- =====================================================
-- 1) Catalog tables
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sticker_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'builtin' CHECK (source_type IN ('builtin', 'user', 'premium', 'business')),
  visibility_status TEXT NOT NULL DEFAULT 'active' CHECK (visibility_status IN ('active', 'hidden', 'blocked')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  is_business BOOLEAN NOT NULL DEFAULT false,
  is_animated BOOLEAN NOT NULL DEFAULT false,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cover_asset_path TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sticker_packs_is_active_idx
  ON public.sticker_packs (is_active, sort_order);
CREATE INDEX IF NOT EXISTS sticker_packs_owner_user_id_idx
  ON public.sticker_packs (owner_user_id);
CREATE INDEX IF NOT EXISTS sticker_packs_updated_at_idx
  ON public.sticker_packs (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.sticker_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.sticker_packs(id) ON DELETE CASCADE,
  asset_path TEXT NOT NULL,
  preview_path TEXT,
  emoji_alias TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'blocked')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sticker_items_pack_id_idx
  ON public.sticker_items (pack_id, sort_order);
CREATE INDEX IF NOT EXISTS sticker_items_status_idx
  ON public.sticker_items (status);
CREATE INDEX IF NOT EXISTS sticker_items_updated_at_idx
  ON public.sticker_items (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.emoji_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'builtin' CHECK (source_type IN ('builtin', 'user', 'premium', 'business')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS emoji_sets_is_active_idx
  ON public.emoji_sets (is_active, sort_order);
CREATE INDEX IF NOT EXISTS emoji_sets_updated_at_idx
  ON public.emoji_sets (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.quick_reaction_catalog (
  emoji TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quick_reaction_catalog_is_active_idx
  ON public.quick_reaction_catalog (is_active, sort_order);

-- =====================================================
-- 2) User state tables
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_sticker_library (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES public.sticker_packs(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pack_id)
);

CREATE INDEX IF NOT EXISTS user_sticker_library_user_id_idx
  ON public.user_sticker_library (user_id, sort_order);
CREATE INDEX IF NOT EXISTS user_sticker_library_updated_at_idx
  ON public.user_sticker_library (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.user_sticker_archive (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES public.sticker_packs(id) ON DELETE CASCADE,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pack_id)
);

CREATE INDEX IF NOT EXISTS user_sticker_archive_user_id_idx
  ON public.user_sticker_archive (user_id, archived_at DESC);
CREATE INDEX IF NOT EXISTS user_sticker_archive_updated_at_idx
  ON public.user_sticker_archive (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.user_emoji_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji_suggestions_mode TEXT NOT NULL DEFAULT 'all' CHECK (emoji_suggestions_mode IN ('all', 'frequent', 'never')),
  large_emoji_mode TEXT NOT NULL DEFAULT 'up_to_three' CHECK (large_emoji_mode IN ('one', 'up_to_three', 'off')),
  recents_first BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_emoji_preferences_updated_at_idx
  ON public.user_emoji_preferences (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.user_quick_reaction (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL DEFAULT '❤️',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_quick_reaction_updated_at_idx
  ON public.user_quick_reaction (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.user_quick_reaction_overrides (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chat_id)
);

CREATE INDEX IF NOT EXISTS user_quick_reaction_overrides_user_id_idx
  ON public.user_quick_reaction_overrides (user_id, updated_at DESC);

-- =====================================================
-- 3) RLS
-- =====================================================

ALTER TABLE public.sticker_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sticker_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emoji_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_reaction_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sticker_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sticker_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_emoji_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quick_reaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quick_reaction_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sticker_packs' AND policyname='Public can read active sticker packs'
  ) THEN
    CREATE POLICY "Public can read active sticker packs"
      ON public.sticker_packs FOR SELECT
      USING (is_active = true AND visibility_status = 'active');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sticker_items' AND policyname='Public can read active sticker items'
  ) THEN
    CREATE POLICY "Public can read active sticker items"
      ON public.sticker_items FOR SELECT
      USING (
        status = 'active'
        AND EXISTS (
          SELECT 1
          FROM public.sticker_packs sp
          WHERE sp.id = sticker_items.pack_id
            AND sp.is_active = true
            AND sp.visibility_status = 'active'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='emoji_sets' AND policyname='Public can read active emoji sets'
  ) THEN
    CREATE POLICY "Public can read active emoji sets"
      ON public.emoji_sets FOR SELECT
      USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quick_reaction_catalog' AND policyname='Public can read active quick reactions'
  ) THEN
    CREATE POLICY "Public can read active quick reactions"
      ON public.quick_reaction_catalog FOR SELECT
      USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_sticker_library' AND policyname='Users can view own sticker library'
  ) THEN
    CREATE POLICY "Users can view own sticker library"
      ON public.user_sticker_library FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_sticker_library' AND policyname='Users can insert own sticker library'
  ) THEN
    CREATE POLICY "Users can insert own sticker library"
      ON public.user_sticker_library FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_sticker_library' AND policyname='Users can update own sticker library'
  ) THEN
    CREATE POLICY "Users can update own sticker library"
      ON public.user_sticker_library FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_sticker_library' AND policyname='Users can delete own sticker library'
  ) THEN
    CREATE POLICY "Users can delete own sticker library"
      ON public.user_sticker_library FOR DELETE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_sticker_archive' AND policyname='Users can view own sticker archive'
  ) THEN
    CREATE POLICY "Users can view own sticker archive"
      ON public.user_sticker_archive FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_sticker_archive' AND policyname='Users can insert own sticker archive'
  ) THEN
    CREATE POLICY "Users can insert own sticker archive"
      ON public.user_sticker_archive FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_sticker_archive' AND policyname='Users can delete own sticker archive'
  ) THEN
    CREATE POLICY "Users can delete own sticker archive"
      ON public.user_sticker_archive FOR DELETE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_emoji_preferences' AND policyname='Users can view own emoji preferences'
  ) THEN
    CREATE POLICY "Users can view own emoji preferences"
      ON public.user_emoji_preferences FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_emoji_preferences' AND policyname='Users can insert own emoji preferences'
  ) THEN
    CREATE POLICY "Users can insert own emoji preferences"
      ON public.user_emoji_preferences FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_emoji_preferences' AND policyname='Users can update own emoji preferences'
  ) THEN
    CREATE POLICY "Users can update own emoji preferences"
      ON public.user_emoji_preferences FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_quick_reaction' AND policyname='Users can view own quick reaction'
  ) THEN
    CREATE POLICY "Users can view own quick reaction"
      ON public.user_quick_reaction FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_quick_reaction' AND policyname='Users can insert own quick reaction'
  ) THEN
    CREATE POLICY "Users can insert own quick reaction"
      ON public.user_quick_reaction FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_quick_reaction' AND policyname='Users can update own quick reaction'
  ) THEN
    CREATE POLICY "Users can update own quick reaction"
      ON public.user_quick_reaction FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_quick_reaction_overrides' AND policyname='Users can view own quick reaction overrides'
  ) THEN
    CREATE POLICY "Users can view own quick reaction overrides"
      ON public.user_quick_reaction_overrides FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_quick_reaction_overrides' AND policyname='Users can insert own quick reaction overrides'
  ) THEN
    CREATE POLICY "Users can insert own quick reaction overrides"
      ON public.user_quick_reaction_overrides FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_quick_reaction_overrides' AND policyname='Users can update own quick reaction overrides'
  ) THEN
    CREATE POLICY "Users can update own quick reaction overrides"
      ON public.user_quick_reaction_overrides FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_quick_reaction_overrides' AND policyname='Users can delete own quick reaction overrides'
  ) THEN
    CREATE POLICY "Users can delete own quick reaction overrides"
      ON public.user_quick_reaction_overrides FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- =====================================================
-- 4) Triggers
-- =====================================================

DROP TRIGGER IF EXISTS update_sticker_packs_updated_at ON public.sticker_packs;
CREATE TRIGGER update_sticker_packs_updated_at
BEFORE UPDATE ON public.sticker_packs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sticker_items_updated_at ON public.sticker_items;
CREATE TRIGGER update_sticker_items_updated_at
BEFORE UPDATE ON public.sticker_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_emoji_sets_updated_at ON public.emoji_sets;
CREATE TRIGGER update_emoji_sets_updated_at
BEFORE UPDATE ON public.emoji_sets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_quick_reaction_catalog_updated_at ON public.quick_reaction_catalog;
CREATE TRIGGER update_quick_reaction_catalog_updated_at
BEFORE UPDATE ON public.quick_reaction_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_sticker_library_updated_at ON public.user_sticker_library;
CREATE TRIGGER update_user_sticker_library_updated_at
BEFORE UPDATE ON public.user_sticker_library
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_sticker_archive_updated_at ON public.user_sticker_archive;
CREATE TRIGGER update_user_sticker_archive_updated_at
BEFORE UPDATE ON public.user_sticker_archive
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_emoji_preferences_updated_at ON public.user_emoji_preferences;
CREATE TRIGGER update_user_emoji_preferences_updated_at
BEFORE UPDATE ON public.user_emoji_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_quick_reaction_updated_at ON public.user_quick_reaction;
CREATE TRIGGER update_user_quick_reaction_updated_at
BEFORE UPDATE ON public.user_quick_reaction
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_quick_reaction_overrides_updated_at ON public.user_quick_reaction_overrides;
CREATE TRIGGER update_user_quick_reaction_overrides_updated_at
BEFORE UPDATE ON public.user_quick_reaction_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 5) Seed catalogs
-- =====================================================

INSERT INTO public.sticker_packs (slug, title, source_type, is_active, visibility_status, is_animated, sort_order, item_count)
VALUES
  ('duck', 'Duck', 'builtin', true, 'active', false, 10, 40),
  ('hot-cherry', 'Hot Cherry', 'builtin', true, 'active', true, 20, 34),
  ('buddy-bear', 'Buddy Bear', 'builtin', true, 'active', true, 30, 28)
ON CONFLICT (slug) DO UPDATE
SET
  title = EXCLUDED.title,
  source_type = EXCLUDED.source_type,
  is_active = EXCLUDED.is_active,
  visibility_status = EXCLUDED.visibility_status,
  is_animated = EXCLUDED.is_animated,
  sort_order = EXCLUDED.sort_order,
  item_count = EXCLUDED.item_count;

INSERT INTO public.emoji_sets (slug, title, source_type, is_active, is_premium, sort_order)
VALUES
  ('default', 'Default Emoji', 'builtin', true, false, 10),
  ('premium-stars', 'Premium Stars', 'premium', true, true, 20)
ON CONFLICT (slug) DO UPDATE
SET
  title = EXCLUDED.title,
  source_type = EXCLUDED.source_type,
  is_active = EXCLUDED.is_active,
  is_premium = EXCLUDED.is_premium,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.quick_reaction_catalog (emoji, title, is_active, sort_order)
VALUES
  ('❤️', 'Heart', true, 10),
  ('🔥', 'Fire', true, 20),
  ('👍', 'Thumbs Up', true, 30),
  ('😂', 'Laugh', true, 40),
  ('😮', 'Wow', true, 50),
  ('🎉', 'Party', true, 60),
  ('👏', 'Clap', true, 70),
  ('🤝', 'Handshake', true, 80),
  ('😢', 'Sad', true, 90)
ON CONFLICT (emoji) DO UPDATE
SET
  title = EXCLUDED.title,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

-- =====================================================
-- 6) Realtime
-- =====================================================

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sticker_library;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sticker_archive;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_emoji_preferences;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_quick_reaction;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_quick_reaction_overrides;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

