-- Заказы в магазине
CREATE TABLE IF NOT EXISTS public.shop_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending', -- pending, confirmed, shipped, delivered, cancelled
  total_amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'RUB',
  shipping_address JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_shop_orders_shop ON shop_orders(shop_id, created_at DESC);
CREATE INDEX idx_shop_orders_buyer ON shop_orders(buyer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.shop_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES shop_products(id),
  quantity INT DEFAULT 1,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Корзина
CREATE TABLE IF NOT EXISTS public.shop_cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  quantity INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id)
);
CREATE INDEX idx_shop_cart_user ON shop_cart_items(user_id);

-- Отзывы на товары
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text TEXT,
  images JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, user_id)
);
CREATE INDEX idx_product_reviews_product ON product_reviews(product_id, rating DESC);

-- Плейлисты музыки
CREATE TABLE IF NOT EXISTS public.music_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  is_public BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.music_playlist_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES music_playlists(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES music_tracks(id) ON DELETE CASCADE,
  position INT DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT now()
);

-- Избранные треки пользователя
CREATE TABLE IF NOT EXISTS public.user_saved_tracks (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES music_tracks(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, track_id)
);

-- Creator Fund: разбивка заработка по дням
CREATE TABLE IF NOT EXISTS public.creator_fund_daily_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  earning_date DATE NOT NULL,
  views_count INT DEFAULT 0,
  engagement_count INT DEFAULT 0,
  amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, earning_date)
);
CREATE INDEX idx_creator_earnings_user ON creator_fund_daily_earnings(user_id, earning_date DESC);

-- Audio Rooms (как Clubhouse)
CREATE TABLE IF NOT EXISTS public.audio_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'scheduled', -- scheduled, live, ended
  max_speakers INT DEFAULT 10,
  is_recording BOOLEAN DEFAULT false,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audio_rooms_status ON audio_rooms(status, scheduled_at);

CREATE TABLE IF NOT EXISTS public.audio_room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES audio_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'listener', -- host, speaker, listener
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ,
  UNIQUE(room_id, user_id)
);
CREATE INDEX idx_audio_room_participants ON audio_room_participants(room_id, role);

-- RLS
ALTER TABLE shop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_saved_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_fund_daily_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_room_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read orders of own shop" ON shop_orders FOR SELECT USING (buyer_id = auth.uid());
CREATE POLICY "Buyers create orders" ON shop_orders FOR INSERT WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "Anyone can read own cart" ON shop_cart_items FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Anyone can read reviews" ON product_reviews FOR SELECT USING (true);
CREATE POLICY "Users write reviews" ON product_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone can read playlists" ON music_playlists FOR SELECT USING (true);
CREATE POLICY "Anyone can read playlist tracks" ON music_playlist_tracks FOR SELECT USING (true);
CREATE POLICY "Users manage saved tracks" ON user_saved_tracks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users read own earnings" ON creator_fund_daily_earnings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can read audio rooms" ON audio_rooms FOR SELECT USING (true);
CREATE POLICY "Hosts manage rooms" ON audio_rooms FOR ALL USING (auth.uid() = host_id);
CREATE POLICY "Anyone can read participants" ON audio_room_participants FOR SELECT USING (true);
CREATE POLICY "Users join rooms" ON audio_room_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users leave rooms" ON audio_room_participants FOR UPDATE USING (auth.uid() = user_id);
