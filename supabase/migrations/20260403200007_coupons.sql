-- Купоны и промокоды для маркетплейса
-- Additive migration: создаёт таблицы coupons, coupon_usages

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
  min_order_amount NUMERIC DEFAULT 0,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  valid_from TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupon_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID,
  used_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(coupon_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active, valid_until);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_user ON coupon_usages(user_id);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_usages ENABLE ROW LEVEL SECURITY;

-- Активные купоны видны всем авторизованным
CREATE POLICY "coupons_select_active"
  ON coupons FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Создатели управляют своими купонами
CREATE POLICY "coupons_all_owner"
  ON coupons FOR ALL
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Пользователи видят свои использования
CREATE POLICY "coupon_usages_select_own"
  ON coupon_usages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Пользователи могут использовать купоны
CREATE POLICY "coupon_usages_insert_own"
  ON coupon_usages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
