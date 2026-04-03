-- История просмотров объектов недвижимости
CREATE TABLE IF NOT EXISTS property_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  viewed_at timestamptz DEFAULT now() NOT NULL,
  duration_seconds int DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_property_views_user ON property_views(user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_views_property ON property_views(property_id, viewed_at DESC);

ALTER TABLE property_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_history" ON property_views
  FOR ALL USING (auth.uid() = user_id);

-- Рейтинги и отзывы агентств
CREATE TABLE IF NOT EXISTS agency_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text text,
  pros text,
  cons text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(agency_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_agency_reviews_agency ON agency_reviews(agency_id, created_at DESC);

ALTER TABLE agency_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_reviews" ON agency_reviews
  FOR SELECT USING (true);

CREATE POLICY "write_own_review" ON agency_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_review" ON agency_reviews
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "delete_own_review" ON agency_reviews
  FOR DELETE USING (auth.uid() = user_id);

-- Подписки на фильтры (уведомления о новых объявлениях)
CREATE TABLE IF NOT EXISTS property_saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  notify_email boolean DEFAULT true,
  notify_push boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  last_notified_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_property_saved_searches_user ON property_saved_searches(user_id, created_at DESC);

ALTER TABLE property_saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_searches" ON property_saved_searches
  FOR ALL USING (auth.uid() = user_id);
