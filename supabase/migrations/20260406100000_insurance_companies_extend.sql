-- Расширение insurance_companies: недостающие колонки для страницы компании
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS slug text UNIQUE;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS license_number text;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS founded_year integer;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS avg_claim_days integer DEFAULT 14;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS claim_approval_rate integer DEFAULT 85;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS is_partner boolean DEFAULT false;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS products_count integer DEFAULT 0;
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS pros text[] DEFAULT '{}';
ALTER TABLE public.insurance_companies ADD COLUMN IF NOT EXISTS cons text[] DEFAULT '{}';

-- Таблица отзывов о страховых компаниях
CREATE TABLE IF NOT EXISTS public.insurance_company_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.insurance_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  pros_text text,
  cons_text text,
  helpful_count integer DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_reviews_company
  ON public.insurance_company_reviews(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_reviews_user
  ON public.insurance_company_reviews(user_id);

ALTER TABLE public.insurance_company_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "anyone_read_approved_reviews" ON public.insurance_company_reviews
    FOR SELECT USING (status = 'approved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "users_insert_own_reviews" ON public.insurance_company_reviews
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed: базовые компании
INSERT INTO public.insurance_companies (name, slug, description, rating, is_verified, license_number, founded_year, website, phone, email, address, avg_claim_days, claim_approval_rate, is_partner, products_count, pros, cons)
VALUES
  ('Ингосстрах', 'ingosstrakh',
   'Один из крупнейших и надёжных страховщиков России с 1947 года. Широкий спектр страховых продуктов для физических и юридических лиц.',
   4.5, true, 'СИ №0928', 1947,
   'https://ingos.ru', '+7 (495) 956-55-55', 'info@ingos.ru', 'Москва, ул. Пятницкая, 12',
   12, 91, true, 24,
   ARRAY['Высокий рейтинг надёжности', 'Широкая филиальная сеть', 'Онлайн-сервисы', 'Быстрая выплата возмещения'],
   ARRAY['Высокие тарифы по КАСКО', 'Долгое ожидание в офисах', 'Сложная документация']),
  ('Тинькофф Страхование', 'tinkoff',
   'Полностью цифровая страховая компания группы Тинькофф. Оформление за 5 минут без визита в офис.',
   4.7, true, 'СЛ №4184', 2014,
   'https://tinkoff.ru/insurance', '+7 (888) 888-88-88', 'insurance@tinkoff.ru', 'Москва, ул. 2-я Хуторская, 38А',
   7, 96, true, 18,
   ARRAY['Полностью онлайн', 'Быстрые выплаты (до 7 дней)', 'Удобное приложение', 'Кэшбэк баллами Тинькофф'],
   ARRAY['Нет физических офисов', 'Ограниченное покрытие в отдалённых регионах'])
ON CONFLICT DO NOTHING;
