-- Расширение существующих таблиц маркетплейса:
-- product_variants, shop_collections, shop_collection_items
-- + FK constraints + RLS для владельцев магазинов

-- ============================================================
-- 1. product_variants — недостающие столбцы + FK
-- ============================================================

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS compare_at_price decimal(10, 2),
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Удалить осиротевшие записи перед добавлением FK
DELETE FROM public.product_variants pv
WHERE NOT EXISTS (
  SELECT 1 FROM public.shop_products sp WHERE sp.id = pv.product_id
);

DO $$ BEGIN
  ALTER TABLE public.product_variants
    ADD CONSTRAINT fk_product_variants_product
    FOREIGN KEY (product_id) REFERENCES public.shop_products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. shop_collections — недостающие столбцы + FK
-- ============================================================

ALTER TABLE public.shop_collections
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

DELETE FROM public.shop_collections sc
WHERE NOT EXISTS (
  SELECT 1 FROM public.shops s WHERE s.id = sc.shop_id
);

DO $$ BEGIN
  ALTER TABLE public.shop_collections
    ADD CONSTRAINT fk_shop_collections_shop
    FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. shop_collection_items — FK на shop_products
-- ============================================================

ALTER TABLE public.shop_collection_items
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

DELETE FROM public.shop_collection_items sci
WHERE NOT EXISTS (
  SELECT 1 FROM public.shop_products sp WHERE sp.id = sci.product_id
);

DO $$ BEGIN
  ALTER TABLE public.shop_collection_items
    ADD CONSTRAINT fk_collection_items_product
    FOREIGN KEY (product_id) REFERENCES public.shop_products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 4. RLS — INSERT/UPDATE/DELETE для владельца магазина
-- ============================================================

-- product_variants: владелец через shop_products → shops
DO $$ BEGIN
  CREATE POLICY "Owner manages variants" ON public.product_variants
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.shop_products sp
        JOIN public.shops s ON s.id = sp.shop_id
        WHERE sp.id = product_variants.product_id
          AND s.owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- shop_collections: владелец через shops
DO $$ BEGIN
  CREATE POLICY "Owner manages collections" ON public.shop_collections
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.shops s
        WHERE s.id = shop_collections.shop_id
          AND s.owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- shop_collection_items: владелец через shop_collections → shops
DO $$ BEGIN
  CREATE POLICY "Owner manages collection items" ON public.shop_collection_items
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.shop_collections sc
        JOIN public.shops s ON s.id = sc.shop_id
        WHERE sc.id = shop_collection_items.collection_id
          AND s.owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
