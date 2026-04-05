-- Phase 1: Агрегатор — лояльность, черновики, ТС, рефералы

-- 1. ALTER agent_profiles — лояльность
ALTER TABLE public.agent_profiles
  ADD COLUMN IF NOT EXISTS loyalty_level text DEFAULT 'novice'
    CHECK (loyalty_level IN ('novice','agent','agent2','authorized','authorized_plus')),
  ADD COLUMN IF NOT EXISTS quarterly_premiums numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_type text DEFAULT 'mentorship'
    CHECK (referral_type IN ('mentorship','partnership')),
  ADD COLUMN IF NOT EXISTS referral_l1_percent numeric(5,2) DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS referral_l2_percent numeric(5,2) DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS is_self_employed boolean DEFAULT false;

-- 2. CREATE insurance_drafts — автосохранение wizard
CREATE TABLE IF NOT EXISTS public.insurance_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_type text NOT NULL,
  step int DEFAULT 1,
  form_data jsonb NOT NULL DEFAULT '{}',
  title text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.insurance_drafts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "drafts_own" ON public.insurance_drafts
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_drafts_user ON public.insurance_drafts(user_id, updated_at DESC);

-- 3. CREATE insurance_vehicles — ТС клиента
CREATE TABLE IF NOT EXISTS public.insurance_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.insurance_clients(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  gos_number text,
  brand text,
  model text,
  year int,
  power int,
  vin text,
  doc_type text CHECK (doc_type IS NULL OR doc_type IN ('pts','sts','epts')),
  doc_series text,
  doc_number text,
  doc_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.insurance_vehicles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "vehicles_own" ON public.insurance_vehicles
    FOR ALL USING (
      user_id = auth.uid()
      OR client_id IN (SELECT id FROM public.insurance_clients WHERE agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid()))
    )
    WITH CHECK (
      user_id = auth.uid()
      OR client_id IN (SELECT id FROM public.insurance_clients WHERE agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid()))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_vehicles_user ON public.insurance_vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_client ON public.insurance_vehicles(client_id);

-- 4. CREATE insurance_referral_links — 6 типов ссылок
CREATE TABLE IF NOT EXISTS public.insurance_referral_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('mentorship','partnership','osago','mortgage','travel','kasko')),
  name text,
  code text UNIQUE NOT NULL DEFAULT upper(substring(md5(random()::text) from 1 for 10)),
  quota_percent numeric(5,2) DEFAULT 0,
  activations int DEFAULT 0,
  calculations int DEFAULT 0,
  policies int DEFAULT 0,
  revenue numeric(12,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.insurance_referral_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "referral_links_own" ON public.insurance_referral_links
    FOR ALL USING (agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid()))
    WITH CHECK (agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_referral_links_agent ON public.insurance_referral_links(agent_id);
CREATE INDEX IF NOT EXISTS idx_referral_links_code ON public.insurance_referral_links(code);

-- 5. CREATE insurance_loyalty_history — аудит уровней
CREATE TABLE IF NOT EXISTS public.insurance_loyalty_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
  quarter text NOT NULL,
  premiums_total numeric(12,2) NOT NULL,
  level_before text NOT NULL,
  level_after text NOT NULL,
  bonus_percent numeric(5,2) NOT NULL,
  calculated_at timestamptz DEFAULT now()
);

ALTER TABLE public.insurance_loyalty_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "loyalty_history_own" ON public.insurance_loyalty_history
    FOR ALL USING (agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid()))
    WITH CHECK (agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. ALTER insurance_calculations — связка с draft
ALTER TABLE public.insurance_calculations
  ADD COLUMN IF NOT EXISTS draft_id uuid REFERENCES public.insurance_drafts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_session_id uuid REFERENCES public.insurance_quote_sessions(id) ON DELETE SET NULL;

-- 7. Функция пересчёта лояльности
CREATE OR REPLACE FUNCTION public.recalculate_agent_loyalty(p_agent_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total numeric;
  v_level text;
  v_bonus numeric;
  v_quarter text;
  v_old_level text;
BEGIN
  v_quarter := extract(year from now()) || '-Q' || extract(quarter from now());

  SELECT COALESCE(SUM(ip.premium), 0) INTO v_total
  FROM insurance_policies ip
  WHERE ip.agent_id = p_agent_id
    AND ip.status IN ('active', 'expired')
    AND ip.created_at >= date_trunc('quarter', now());

  SELECT loyalty_level INTO v_old_level FROM agent_profiles WHERE id = p_agent_id;

  IF v_total >= 300000 THEN v_level := 'authorized_plus'; v_bonus := 15;
  ELSIF v_total >= 150000 THEN v_level := 'authorized'; v_bonus := 12;
  ELSIF v_total >= 75000 THEN v_level := 'agent2'; v_bonus := 8;
  ELSIF v_total >= 30000 THEN v_level := 'agent'; v_bonus := 5;
  ELSE v_level := 'novice'; v_bonus := 0;
  END IF;

  UPDATE agent_profiles
  SET loyalty_level = v_level, quarterly_premiums = v_total, loyalty_updated_at = now()
  WHERE id = p_agent_id;

  INSERT INTO insurance_loyalty_history (agent_id, quarter, premiums_total, level_before, level_after, bonus_percent)
  VALUES (p_agent_id, v_quarter, v_total, COALESCE(v_old_level, 'novice'), v_level, v_bonus);
END;
$$;
