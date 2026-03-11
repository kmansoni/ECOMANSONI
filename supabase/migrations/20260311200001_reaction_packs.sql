-- ============================================================
-- Batch 3: Custom Reaction Packs
-- ============================================================

-- ÐÐ°Ð±Ð¾ÑÑ ÑÐµÐ°ÐºÑÐ¸Ð¹ (Ð¿Ð°ÐºÐ¸)
CREATE TABLE public.reaction_packs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cover_url TEXT, -- URL Ð¾Ð±Ð»Ð¾Ð¶ÐºÐ¸
  is_official BOOLEAN DEFAULT FALSE,
  is_public BOOLEAN DEFAULT TRUE,
  install_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ÐÑÐ´ÐµÐ»ÑÐ½ÑÐµ ÑÐµÐ°ÐºÑÐ¸Ð¸ Ð²Ð½ÑÑÑÐ¸ Ð¿Ð°ÐºÐ°
CREATE TABLE public.reaction_pack_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pack_id UUID NOT NULL REFERENCES public.reaction_packs(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL, -- unicode emoji Ð¸Ð»Ð¸ custom shortcode
  image_url TEXT, -- URL ÐºÐ°ÑÑÐ¾Ð¼Ð½Ð¾Ð³Ð¾ Ð¸Ð·Ð¾Ð±ÑÐ°Ð¶ÐµÐ½Ð¸Ñ (Ð´Ð»Ñ animated sticker-ÑÐµÐ°ÐºÑÐ¸Ð¹)
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ð£ÑÑÐ°Ð½Ð¾Ð²Ð»ÐµÐ½Ð½ÑÐµ Ð¿Ð°ÐºÐ¸ Ð¿Ð¾Ð»ÑÐ·Ð¾Ð²Ð°ÑÐµÐ»ÑÐ¼Ð¸
CREATE TABLE public.user_reaction_packs (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES public.reaction_packs(id) ON DELETE CASCADE,
  sort_order INT DEFAULT 0,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, pack_id)
);

CREATE INDEX idx_reaction_packs_public ON public.reaction_packs(is_public, install_count DESC);
CREATE INDEX idx_reaction_pack_items_pack ON public.reaction_pack_items(pack_id, sort_order);
CREATE INDEX idx_user_reaction_packs_user ON public.user_reaction_packs(user_id, sort_order);

-- RLS
ALTER TABLE public.reaction_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reaction_pack_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reaction_packs ENABLE ROW LEVEL SECURITY;

-- reaction_packs: Ð²ÑÐµ Ð°Ð²ÑÐ¾ÑÐ¸Ð·Ð¾Ð²Ð°Ð½Ð½ÑÐµ ÑÐ¸ÑÐ°ÑÑ Ð¿ÑÐ±Ð»Ð¸ÑÐ½ÑÐµ; Ð°Ð²ÑÐ¾Ñ CRUD
CREATE POLICY "rp_select" ON public.reaction_packs
  FOR SELECT USING (is_public = TRUE OR author_id = auth.uid());
CREATE POLICY "rp_insert" ON public.reaction_packs
  FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "rp_update" ON public.reaction_packs
  FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "rp_delete" ON public.reaction_packs
  FOR DELETE USING (auth.uid() = author_id);

-- reaction_pack_items: Ð²Ð¸Ð´Ð½Ñ ÐµÑÐ»Ð¸ Ð¿Ð°Ðº Ð¿ÑÐ±Ð»Ð¸ÑÐ½ÑÐ¹ Ð¸Ð»Ð¸ ÑÐ²Ð¾Ð¹
CREATE POLICY "rpi_select" ON public.reaction_pack_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reaction_packs rp
      WHERE rp.id = reaction_pack_items.pack_id
        AND (rp.is_public = TRUE OR rp.author_id = auth.uid())
    )
  );
CREATE POLICY "rpi_insert" ON public.reaction_pack_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reaction_packs rp
      WHERE rp.id = reaction_pack_items.pack_id AND rp.author_id = auth.uid()
    )
  );
CREATE POLICY "rpi_update" ON public.reaction_pack_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.reaction_packs rp
      WHERE rp.id = reaction_pack_items.pack_id AND rp.author_id = auth.uid()
    )
  );
CREATE POLICY "rpi_delete" ON public.reaction_pack_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.reaction_packs rp
      WHERE rp.id = reaction_pack_items.pack_id AND rp.author_id = auth.uid()
    )
  );

-- user_reaction_packs: Ð¿Ð¾Ð»ÑÐ·Ð¾Ð²Ð°ÑÐµÐ»Ñ ÑÐ¿ÑÐ°Ð²Ð»ÑÐµÑ ÑÐ²Ð¾Ð¸Ð¼Ð¸ ÑÑÑÐ°Ð½Ð¾Ð²ÐºÐ°Ð¼Ð¸
CREATE POLICY "urp_select" ON public.user_reaction_packs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "urp_insert" ON public.user_reaction_packs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "urp_delete" ON public.user_reaction_packs
  FOR DELETE USING (auth.uid() = user_id);
