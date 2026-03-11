-- ============================================================
-- Batch 3: Custom Reaction Packs
-- ============================================================

-- Наборы реакций (паки)
CREATE TABLE public.reaction_packs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cover_url TEXT, -- URL обложки
  is_official BOOLEAN DEFAULT FALSE,
  is_public BOOLEAN DEFAULT TRUE,
  install_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Отдельные реакции внутри пака
CREATE TABLE public.reaction_pack_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pack_id UUID NOT NULL REFERENCES public.reaction_packs(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL, -- unicode emoji или custom shortcode
  image_url TEXT, -- URL кастомного изображения (для animated sticker-реакций)
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Установленные паки пользователями
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

-- reaction_packs: все авторизованные читают публичные; автор CRUD
CREATE POLICY "rp_select" ON public.reaction_packs
  FOR SELECT USING (is_public = TRUE OR author_id = auth.uid());
CREATE POLICY "rp_insert" ON public.reaction_packs
  FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "rp_update" ON public.reaction_packs
  FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "rp_delete" ON public.reaction_packs
  FOR DELETE USING (auth.uid() = author_id);

-- reaction_pack_items: видны если пак публичный или свой
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

-- user_reaction_packs: пользователь управляет своими установками
CREATE POLICY "urp_select" ON public.user_reaction_packs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "urp_insert" ON public.user_reaction_packs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "urp_delete" ON public.user_reaction_packs
  FOR DELETE USING (auth.uid() = user_id);
