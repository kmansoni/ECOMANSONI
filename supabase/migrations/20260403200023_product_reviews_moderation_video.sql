-- Модерация отзывов + видео-отзывы
-- Добавляем: статус модерации, видео, ответ продавца

ALTER TABLE product_reviews
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS seller_reply TEXT,
  ADD COLUMN IF NOT EXISTS seller_reply_at TIMESTAMPTZ;

COMMENT ON COLUMN product_reviews.moderation_status IS 'pending | approved | rejected';
COMMENT ON COLUMN product_reviews.video_url IS 'URL видео-отзыва (Supabase Storage)';
COMMENT ON COLUMN product_reviews.seller_reply IS 'Ответ продавца на отзыв';

-- Индекс для быстрой фильтрации по статусу модерации
CREATE INDEX IF NOT EXISTS idx_product_reviews_moderation
  ON product_reviews(moderation_status, created_at DESC);

-- Политика: продавец может обновлять отзывы на свои товары (только модерация + ответ)
CREATE POLICY "Sellers moderate reviews"
  ON product_reviews FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM shop_products sp
      JOIN shops s ON s.id = sp.shop_id
      WHERE sp.id = product_reviews.product_id
        AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shop_products sp
      JOIN shops s ON s.id = sp.shop_id
      WHERE sp.id = product_reviews.product_id
        AND s.owner_id = auth.uid()
    )
  );
