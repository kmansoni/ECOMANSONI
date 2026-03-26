-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- =============================================================================
-- ECOMANSONI Livestream Platform — Live Shopping (Витрина в эфире)
-- Миграция: 20260308000009_livestream_shopping.sql
-- Назначение: Продукты/товары, демонстрируемые стримером во время эфира
--
-- Архитектурные решения:
--   - display_order: явный порядок отображения (не SERIAL чтобы поддерживать
--     drag-n-drop переупорядочивание без пересчёта всей последовательности).
--   - clicks_count: атомарно инкрементируется через RPC (не через UPDATE от клиента).
--     Клиент вызывает increment_product_click(p_product_id), сервер обновляет.
--   - is_featured: один "featured" товар отображается поверх плеера в большом формате.
--     Контроль на app-level (не более 1 featured — бизнес-правило).
--   - product_url: external URL (партнёрские ссылки). Должен валидироваться
--     на Edge Function уровне (allowed domains list).
--   - RLS: хост управляет, зрители только читают (SELECT).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.live_shopping_products (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        BIGINT      NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  product_name      TEXT        NOT NULL CHECK (char_length(product_name) BETWEEN 1 AND 200),
  product_url       TEXT        NOT NULL,
  product_image_url TEXT,
  price             NUMERIC(12,2),
  currency          TEXT        NOT NULL DEFAULT 'RUB',
  is_featured       BOOLEAN     NOT NULL DEFAULT false,
  display_order     INTEGER     NOT NULL DEFAULT 0,
  clicks_count      INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Документирование колонок
-- ---------------------------------------------------------------------------
COMMENT ON TABLE  public.live_shopping_products                   IS 'Товары витрины в прямом эфире (Live Shopping)';
COMMENT ON COLUMN public.live_shopping_products.id                IS 'UUID PK';
COMMENT ON COLUMN public.live_shopping_products.session_id        IS 'FK → live_sessions.id (BIGINT)';
COMMENT ON COLUMN public.live_shopping_products.product_name      IS 'Название товара (1–200 символов)';
COMMENT ON COLUMN public.live_shopping_products.product_url       IS 'URL товара (партнёрская ссылка / магазин)';
COMMENT ON COLUMN public.live_shopping_products.product_image_url IS 'URL изображения товара';
COMMENT ON COLUMN public.live_shopping_products.price             IS 'Цена товара (NULL = цена по запросу)';
COMMENT ON COLUMN public.live_shopping_products.currency          IS 'Код валюты ISO 4217 (RUB, USD, …)';
COMMENT ON COLUMN public.live_shopping_products.is_featured       IS 'true = товар показан крупно поверх плеера';
COMMENT ON COLUMN public.live_shopping_products.display_order     IS 'Порядок отображения в списке (0-based, drag-n-drop)';
COMMENT ON COLUMN public.live_shopping_products.clicks_count      IS 'Счётчик кликов по ссылке (инкрементируется RPC)';
COMMENT ON COLUMN public.live_shopping_products.created_at        IS 'Время добавления товара';

-- ---------------------------------------------------------------------------
-- Индексы
-- ---------------------------------------------------------------------------

-- Список товаров сессии, сортированных по порядку отображения
CREATE INDEX IF NOT EXISTS idx_live_shopping_products_session_order
  ON public.live_shopping_products (session_id, display_order);

-- Быстрый поиск featured-товара
CREATE INDEX IF NOT EXISTS idx_live_shopping_products_featured
  ON public.live_shopping_products (session_id)
  WHERE is_featured = true;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.live_shopping_products ENABLE ROW LEVEL SECURITY;

-- Все пользователи видят товары публичных сессий
CREATE POLICY "live_shopping_products_select_all"
  ON public.live_shopping_products
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.is_public = true
    )
  );

-- Хост управляет товарами своей сессии
CREATE POLICY "live_shopping_products_insert_host"
  ON public.live_shopping_products
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  );

CREATE POLICY "live_shopping_products_update_host"
  ON public.live_shopping_products
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  );

CREATE POLICY "live_shopping_products_delete_host"
  ON public.live_shopping_products
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  );
