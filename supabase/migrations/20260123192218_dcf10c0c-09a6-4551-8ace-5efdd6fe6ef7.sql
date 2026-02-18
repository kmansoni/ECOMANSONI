-- =============================================
-- ЭТАП 1: Расширение схемы страхования
-- =============================================

-- 1. Создаём enum для ролей агентов
CREATE TYPE public.agent_status AS ENUM ('pending', 'active', 'suspended', 'blocked');
CREATE TYPE public.calculation_status AS ENUM ('draft', 'sent', 'expired', 'converted');
CREATE TYPE public.payout_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE public.commission_status AS ENUM ('pending', 'confirmed', 'paid', 'cancelled');

-- 2. Таблица профилей агентов
CREATE TABLE public.agent_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    status agent_status NOT NULL DEFAULT 'pending',
    referral_code TEXT UNIQUE,
    referred_by UUID REFERENCES public.agent_profiles(id),
    commission_rate NUMERIC(5,2) DEFAULT 10.00,
    total_earned NUMERIC(12,2) DEFAULT 0,
    available_balance NUMERIC(12,2) DEFAULT 0,
    region TEXT,
    inn TEXT,
    is_legal_entity BOOLEAN DEFAULT false,
    company_name TEXT,
    bank_details JSONB,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Таблица клиентов агента
CREATE TABLE public.insurance_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES public.agent_profiles(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    birth_date DATE,
    passport_series TEXT,
    passport_number TEXT,
    address TEXT,
    notes TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Таблица черновиков расчётов
CREATE TABLE public.insurance_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES public.agent_profiles(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    client_id UUID REFERENCES public.insurance_clients(id) ON DELETE SET NULL,
    product_type TEXT NOT NULL,
    status calculation_status NOT NULL DEFAULT 'draft',
    input_data JSONB NOT NULL,
    results JSONB,
    selected_company_id UUID REFERENCES public.insurance_companies(id),
    selected_price NUMERIC(12,2),
    commission_amount NUMERIC(12,2),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Таблица комиссий
CREATE TABLE public.insurance_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
    policy_id UUID REFERENCES public.insurance_policies(id) ON DELETE SET NULL,
    calculation_id UUID REFERENCES public.insurance_calculations(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL,
    rate NUMERIC(5,2) NOT NULL,
    status commission_status NOT NULL DEFAULT 'pending',
    confirmed_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Таблица выводов средств
CREATE TABLE public.insurance_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    status payout_status NOT NULL DEFAULT 'pending',
    payment_method TEXT NOT NULL,
    payment_details JSONB,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. Таблица напоминаний о пролонгации
CREATE TABLE public.policy_renewals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES public.insurance_policies(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.agent_profiles(id) ON DELETE SET NULL,
    reminder_date DATE NOT NULL,
    days_before INTEGER NOT NULL,
    is_sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMP WITH TIME ZONE,
    is_renewed BOOLEAN DEFAULT false,
    new_policy_id UUID REFERENCES public.insurance_policies(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 8. Расширяем таблицу insurance_companies
ALTER TABLE public.insurance_companies 
ADD COLUMN IF NOT EXISTS api_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 10.00,
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS supported_products TEXT[],
ADD COLUMN IF NOT EXISTS regions TEXT[],
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT;

-- 9. Расширяем таблицу insurance_products
ALTER TABLE public.insurance_products 
ADD COLUMN IF NOT EXISTS min_term_days INTEGER,
ADD COLUMN IF NOT EXISTS max_term_days INTEGER,
ADD COLUMN IF NOT EXISTS calculation_params JSONB,
ADD COLUMN IF NOT EXISTS documents_required TEXT[],
ADD COLUMN IF NOT EXISTS terms_url TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 10. Расширяем таблицу insurance_policies
ALTER TABLE public.insurance_policies 
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agent_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.insurance_clients(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS calculation_id UUID REFERENCES public.insurance_calculations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'direct',
ADD COLUMN IF NOT EXISTS vehicle_data JSONB,
ADD COLUMN IF NOT EXISTS property_data JSONB,
ADD COLUMN IF NOT EXISTS additional_data JSONB;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Agent Profiles
ALTER TABLE public.agent_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent profile"
ON public.agent_profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own agent profile"
ON public.agent_profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agent profile"
ON public.agent_profiles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all agent profiles"
ON public.agent_profiles FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Insurance Clients
ALTER TABLE public.insurance_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can view own clients"
ON public.insurance_clients FOR SELECT
USING (
    agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid())
    OR user_id = auth.uid()
);

CREATE POLICY "Agents can create clients"
ON public.insurance_clients FOR INSERT
WITH CHECK (
    agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid())
    OR user_id = auth.uid()
);

CREATE POLICY "Agents can update own clients"
ON public.insurance_clients FOR UPDATE
USING (
    agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid())
    OR user_id = auth.uid()
);

CREATE POLICY "Agents can delete own clients"
ON public.insurance_clients FOR DELETE
USING (agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid()));

-- Insurance Calculations
ALTER TABLE public.insurance_calculations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calculations"
ON public.insurance_calculations FOR SELECT
USING (
    user_id = auth.uid()
    OR agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can create calculations"
ON public.insurance_calculations FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    OR agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update own calculations"
ON public.insurance_calculations FOR UPDATE
USING (
    user_id = auth.uid()
    OR agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete own calculations"
ON public.insurance_calculations FOR DELETE
USING (
    user_id = auth.uid()
    OR agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid())
);

-- Insurance Commissions
ALTER TABLE public.insurance_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can view own commissions"
ON public.insurance_commissions FOR SELECT
USING (agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "System can create commissions"
ON public.insurance_commissions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can manage commissions"
ON public.insurance_commissions FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Insurance Payouts
ALTER TABLE public.insurance_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can view own payouts"
ON public.insurance_payouts FOR SELECT
USING (agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Agents can request payouts"
ON public.insurance_payouts FOR INSERT
WITH CHECK (agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage payouts"
ON public.insurance_payouts FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Policy Renewals
ALTER TABLE public.policy_renewals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own renewals"
ON public.policy_renewals FOR SELECT
USING (
    policy_id IN (SELECT id FROM public.insurance_policies WHERE user_id = auth.uid())
    OR agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid())
);

CREATE POLICY "System can manage renewals"
ON public.policy_renewals FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-generate referral code for agents
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.referral_code IS NULL THEN
        NEW.referral_code := upper(substring(md5(random()::text) from 1 for 8));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER set_agent_referral_code
BEFORE INSERT ON public.agent_profiles
FOR EACH ROW
EXECUTE FUNCTION public.generate_referral_code();

-- Update timestamps
CREATE TRIGGER update_agent_profiles_updated_at
BEFORE UPDATE ON public.agent_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_insurance_clients_updated_at
BEFORE UPDATE ON public.insurance_clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_insurance_calculations_updated_at
BEFORE UPDATE ON public.insurance_calculations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create renewal reminders when policy is created
CREATE OR REPLACE FUNCTION public.create_policy_renewals()
RETURNS TRIGGER AS $$
BEGIN
    -- Create reminders for 30, 14, 7, and 1 day before expiry
    INSERT INTO public.policy_renewals (policy_id, agent_id, reminder_date, days_before)
    VALUES 
        (NEW.id, NEW.agent_id, NEW.end_date - interval '30 days', 30),
        (NEW.id, NEW.agent_id, NEW.end_date - interval '14 days', 14),
        (NEW.id, NEW.agent_id, NEW.end_date - interval '7 days', 7),
        (NEW.id, NEW.agent_id, NEW.end_date - interval '1 day', 1);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER create_policy_renewal_reminders
AFTER INSERT ON public.insurance_policies
FOR EACH ROW
EXECUTE FUNCTION public.create_policy_renewals();