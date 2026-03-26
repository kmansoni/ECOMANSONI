-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- Not Interested / Dismissed suggestions
CREATE TABLE IF NOT EXISTS public.not_interested (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL, -- post, reel, user, hashtag
  content_id UUID NOT NULL,
  reason TEXT, -- not_interested, dont_suggest, irrelevant
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_not_interested_user ON not_interested(user_id, content_type);

-- Content preferences
CREATE TABLE IF NOT EXISTS public.content_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  topics JSONB DEFAULT '{}', -- {food: true, travel: true, tech: false, ...}
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Wishlist
CREATE TABLE IF NOT EXISTS public.wishlists (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, product_id)
);

-- Product variants
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  name TEXT NOT NULL, -- "Размер M, Красный"
  sku TEXT,
  price FLOAT NOT NULL,
  stock INT DEFAULT 0,
  attributes JSONB DEFAULT '{}', -- {size: "M", color: "red"}
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

-- Product reviews
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text TEXT,
  photos JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON product_reviews(product_id, created_at DESC);

-- Shop collections
CREATE TABLE IF NOT EXISTS public.shop_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.shop_collection_items (
  collection_id UUID NOT NULL REFERENCES shop_collections(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  position INT DEFAULT 0,
  PRIMARY KEY(collection_id, product_id)
);

-- Return requests
CREATE TABLE IF NOT EXISTS public.return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending, approved, rejected, completed
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AR filters gallery
CREATE TABLE IF NOT EXISTS public.ar_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  preview_url TEXT,
  filter_data JSONB NOT NULL DEFAULT '{}',
  category TEXT DEFAULT 'fun', -- beauty, color, fun, world
  uses_count INT DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ar_filters_popular ON ar_filters(uses_count DESC);
CREATE INDEX IF NOT EXISTS idx_ar_filters_category ON ar_filters(category, uses_count DESC);

-- RLS
ALTER TABLE not_interested ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage not interested" ON not_interested FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage preferences" ON content_preferences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage wishlists" ON wishlists FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone reads variants" ON product_variants FOR SELECT USING (true);
CREATE POLICY "Anyone reads reviews" ON product_reviews FOR SELECT USING (true);
CREATE POLICY "Users write reviews" ON product_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone reads collections" ON shop_collections FOR SELECT USING (true);
CREATE POLICY "Anyone reads collection items" ON shop_collection_items FOR SELECT USING (true);
CREATE POLICY "Users manage returns" ON return_requests FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone reads ar filters" ON ar_filters FOR SELECT USING (true);
CREATE POLICY "Creators manage ar filters" ON ar_filters FOR ALL USING (auth.uid() = creator_id);
