-- Страховые компании
CREATE TABLE IF NOT EXISTS insurance_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  logo_url text,
  description text,
  license_number text,
  founded_year int,
  rating numeric(2,1) DEFAULT 0,
  reviews_count int DEFAULT 0,
  avg_claim_days int DEFAULT 14,
  claim_approval_rate numeric(4,1) DEFAULT 90,
  has_mobile_app boolean DEFAULT false,
  has_online_service boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE insurance_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_companies" ON insurance_companies FOR SELECT USING (true);

-- Страховые продукты
CREATE TABLE IF NOT EXISTS insurance_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES insurance_companies(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('osago','kasko','dms','travel','property','mortgage','life')),
  name text NOT NULL,
  description text,
  min_premium numeric(10,2),
  max_premium numeric(10,2),
  coverage_details jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_insurance_products_type ON insurance_products(type, is_active);
ALTER TABLE insurance_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_products" ON insurance_products FOR SELECT USING (true);

-- Полисы пользователей
CREATE TABLE IF NOT EXISTS insurance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES insurance_companies(id) NOT NULL,
  product_id uuid REFERENCES insurance_products(id),
  policy_number text,
  type text NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft','pending','active','expired','cancelled')),
  start_date date,
  end_date date,
  premium_amount numeric(10,2) NOT NULL,
  coverage_amount numeric(12,2),
  insured_object jsonb DEFAULT '{}',
  documents jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX idx_insurance_policies_user ON insurance_policies(user_id, status);
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_policies" ON insurance_policies FOR ALL USING (auth.uid() = user_id);

-- Страховые случаи (claims)
CREATE TABLE IF NOT EXISTS insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid REFERENCES insurance_policies(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','approved','rejected','paid')),
  description text NOT NULL,
  amount numeric(10,2),
  approved_amount numeric(10,2),
  documents jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE insurance_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_claims" ON insurance_claims FOR ALL USING (auth.uid() = user_id);

-- Платежи за полисы
CREATE TABLE IF NOT EXISTS insurance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid REFERENCES insurance_policies(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount numeric(10,2) NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','refunded')),
  payment_method text,
  external_id text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE insurance_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_payments" ON insurance_payments FOR ALL USING (auth.uid() = user_id);
