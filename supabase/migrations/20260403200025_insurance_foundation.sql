-- Расширение существующих insurance-таблиц из 20260118165346
-- insurance_companies уже существует, добавляем недостающие колонки
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS license_number text;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS founded_year int;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS reviews_count int DEFAULT 0;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS avg_claim_days int DEFAULT 14;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS claim_approval_rate numeric(4,1) DEFAULT 90;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS has_mobile_app boolean DEFAULT false;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS has_online_service boolean DEFAULT true;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Уникальный индекс на slug (nullable-safe)
CREATE UNIQUE INDEX IF NOT EXISTS idx_insurance_companies_slug ON public.insurance_companies(slug) WHERE slug IS NOT NULL;

ALTER TABLE public.insurance_companies ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "read_companies" ON public.insurance_companies FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- insurance_products уже существует с category (enum), добавляем type (text alias)
ALTER TABLE public.insurance_products ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.insurance_products ADD COLUMN IF NOT EXISTS min_premium numeric(10,2);
ALTER TABLE public.insurance_products ADD COLUMN IF NOT EXISTS max_premium numeric(10,2);
ALTER TABLE public.insurance_products ADD COLUMN IF NOT EXISTS coverage_details jsonb DEFAULT '{}';
ALTER TABLE public.insurance_products ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Синхронизируем type из category для существующих строк
UPDATE public.insurance_products SET type = category::text WHERE type IS NULL AND category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_insurance_products_type ON public.insurance_products(type, is_active);
ALTER TABLE public.insurance_products ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "read_products" ON public.insurance_products FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- insurance_policies уже существует, добавляем недостающие колонки
ALTER TABLE public.insurance_policies ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.insurance_policies ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.insurance_policies ADD COLUMN IF NOT EXISTS coverage_amount numeric(12,2);
ALTER TABLE public.insurance_policies ADD COLUMN IF NOT EXISTS insured_object jsonb DEFAULT '{}';
ALTER TABLE public.insurance_policies ADD COLUMN IF NOT EXISTS documents jsonb DEFAULT '[]';

-- Разрешаем NULL policy_number (в старой схеме NOT NULL UNIQUE)
DO $$ BEGIN
  ALTER TABLE public.insurance_policies ALTER COLUMN policy_number DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

-- Расширяем status constraint
DO $$ BEGIN
  ALTER TABLE public.insurance_policies DROP CONSTRAINT IF EXISTS insurance_policies_status_check;
  ALTER TABLE public.insurance_policies ADD CONSTRAINT insurance_policies_status_check
    CHECK (status::text IN ('draft','pending','active','expired','cancelled'));
EXCEPTION WHEN others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_insurance_policies_user ON public.insurance_policies(user_id);
ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "own_policies" ON public.insurance_policies FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- insurance_claims уже может существовать
ALTER TABLE public.insurance_claims ADD COLUMN IF NOT EXISTS approved_amount numeric(10,2);
ALTER TABLE public.insurance_claims ADD COLUMN IF NOT EXISTS documents jsonb DEFAULT '[]';
ALTER TABLE public.insurance_claims ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "own_claims" ON public.insurance_claims FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- insurance_payments — новая таблица
CREATE TABLE IF NOT EXISTS public.insurance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid REFERENCES public.insurance_policies(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount numeric(10,2) NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','refunded')),
  payment_method text,
  external_id text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.insurance_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "own_payments" ON public.insurance_payments FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
