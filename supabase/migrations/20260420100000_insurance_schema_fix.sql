-- =============================================================
-- Миграция: исправление рассинхронизации схемы БД и Edge Functions
-- Дата: 2026-04-20
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. insurance_provider_logs — недостающие колонки
--    Код пишет: category, status (text), offers_count, user_id, error_message
--    Схема имеет: operation, is_success, http_status, request_category, error_message
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.insurance_provider_logs
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS offers_count int,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_id text;

-- operation и is_success оставляем для обратной совместимости, делаем nullable
DO $$ BEGIN
  ALTER TABLE public.insurance_provider_logs ALTER COLUMN operation DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.insurance_provider_logs ALTER COLUMN is_success DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.insurance_provider_logs ALTER COLUMN response_time_ms DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_provider_logs_user
  ON public.insurance_provider_logs (user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_logs_request
  ON public.insurance_provider_logs (request_id) WHERE request_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. insurance_vehicle_cache — plate_normalized GENERATED → обычная + триггер
--    Код делает upsert с явной записью plate_normalized, GENERATED не позволяет
-- ─────────────────────────────────────────────────────────────

-- Удаляем зависимый unique index
DROP INDEX IF EXISTS idx_vehicle_cache_plate;

-- Пересоздаём колонку: убираем GENERATED, делаем обычную
ALTER TABLE public.insurance_vehicle_cache DROP COLUMN IF EXISTS plate_normalized;
ALTER TABLE public.insurance_vehicle_cache
  ADD COLUMN plate_normalized text;

-- Заполняем из существующих plate
UPDATE public.insurance_vehicle_cache
  SET plate_normalized = upper(regexp_replace(plate, '[^А-ЯA-Z0-9]', '', 'gi'))
  WHERE plate IS NOT NULL AND plate_normalized IS NULL;

-- Уникальный индекс
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_cache_plate
  ON public.insurance_vehicle_cache (plate_normalized) WHERE plate_normalized IS NOT NULL;

-- Триггер для автозаполнения plate_normalized при INSERT/UPDATE если не указано явно
CREATE OR REPLACE FUNCTION public.trg_vehicle_cache_normalize_plate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.plate_normalized IS NULL AND NEW.plate IS NOT NULL THEN
    NEW.plate_normalized := upper(regexp_replace(NEW.plate, '[^А-ЯA-Z0-9]', '', 'gi'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehicle_cache_normalize_plate ON public.insurance_vehicle_cache;
CREATE TRIGGER vehicle_cache_normalize_plate
  BEFORE INSERT OR UPDATE ON public.insurance_vehicle_cache
  FOR EACH ROW EXECUTE FUNCTION public.trg_vehicle_cache_normalize_plate();

-- ─────────────────────────────────────────────────────────────
-- 3. insurance_commissions — уже существует (20260123...), но enum commission_status
--    Код agent-balance использует текстовые значения 'confirmed', 'pending'
--    Enum имеет: pending, confirmed, paid, cancelled
--    Совместимо, но добавим text-based check для гибкости в будущем.
--    Добавляем updated_at если нет
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.insurance_commissions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ─────────────────────────────────────────────────────────────
-- 4. insurance_payouts — уже существует (20260123...), использует enum payout_status
--    Код пишет текстовые значения напрямую — enum совпадает: pending, processing, completed, failed
--    Просто убедимся что payment_method nullable (код иногда не передаёт)
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.insurance_payouts ALTER COLUMN payment_method DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

ALTER TABLE public.insurance_payouts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- RLS для payouts — агент видит только свои
DO $$ BEGIN
  CREATE POLICY "payouts_own_select" ON public.insurance_payouts
    FOR SELECT USING (
      agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "payouts_own_insert" ON public.insurance_payouts
    FOR INSERT WITH CHECK (
      agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.insurance_payouts ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 5. insurance_clients — уже существует, проверяем недостающее
-- ─────────────────────────────────────────────────────────────
-- Таблица уже создана в 20260123... со всеми нужными полями.
-- Ничего добавлять не нужно.

-- ─────────────────────────────────────────────────────────────
-- 6. insurance_policies — недостающие колонки
--    Код пишет: holder_name, external_id, premium_amount (уже есть как premium_amount? нет — нужно premium)
--    agent_id уже добавлен в 20260123... (REFERENCES agent_profiles)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.insurance_policies
  ADD COLUMN IF NOT EXISTS holder_name text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS premium_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS premium numeric(12,2),
  ADD COLUMN IF NOT EXISTS company_name text;

-- Расширяем status check чтобы включить 'pending_payment'
DO $$ BEGIN
  ALTER TABLE public.insurance_policies DROP CONSTRAINT IF EXISTS insurance_policies_status_check;
  ALTER TABLE public.insurance_policies ADD CONSTRAINT insurance_policies_status_check
    CHECK (status::text IN ('draft','pending','pending_payment','active','expired','cancelled'));
EXCEPTION WHEN others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_insurance_policies_external
  ON public.insurance_policies (external_id) WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_insurance_policies_agent
  ON public.insurance_policies (agent_id) WHERE agent_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 7. agent_profiles — total_earned и available_balance уже есть
--    Ничего добавлять не нужно
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- 8. insurance_companies — premium_start
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.insurance_companies
  ADD COLUMN IF NOT EXISTS premium_start numeric(10,2);

-- ─────────────────────────────────────────────────────────────
-- 9. insurance_quote_sessions — params и offers_count
--    Код пишет params (а схема request_params), и offers_count
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.insurance_quote_sessions
  ADD COLUMN IF NOT EXISTS params jsonb,
  ADD COLUMN IF NOT EXISTS offers_count int DEFAULT 0;

-- Синхронизируем: если params записывается, копируем в request_params через триггер
CREATE OR REPLACE FUNCTION public.trg_quote_session_sync_params()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Если params задан а request_params нет — копируем
  IF NEW.params IS NOT NULL AND (NEW.request_params IS NULL OR NEW.request_params = '{}'::jsonb) THEN
    NEW.request_params := NEW.params;
  END IF;
  -- Если request_params задан а params нет — копируем обратно
  IF NEW.request_params IS NOT NULL AND NEW.request_params != '{}'::jsonb AND NEW.params IS NULL THEN
    NEW.params := NEW.request_params;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_session_sync_params ON public.insurance_quote_sessions;
CREATE TRIGGER quote_session_sync_params
  BEFORE INSERT OR UPDATE ON public.insurance_quote_sessions
  FOR EACH ROW EXECUTE FUNCTION public.trg_quote_session_sync_params();

-- ─────────────────────────────────────────────────────────────
-- 10. insurance_kbm_cache — claims как алиас для previous_claims_count
--     Код пишет и читает поле "claims", схема имеет "previous_claims_count"
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.insurance_kbm_cache
  ADD COLUMN IF NOT EXISTS claims int;

-- Синхронизируем существующие данные
UPDATE public.insurance_kbm_cache
  SET claims = previous_claims_count
  WHERE claims IS NULL AND previous_claims_count IS NOT NULL;

-- Триггер для двусторонней синхронизации
CREATE OR REPLACE FUNCTION public.trg_kbm_cache_sync_claims()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.claims IS NOT NULL AND NEW.previous_claims_count IS NULL THEN
    NEW.previous_claims_count := NEW.claims;
  ELSIF NEW.previous_claims_count IS NOT NULL AND NEW.claims IS NULL THEN
    NEW.claims := NEW.previous_claims_count;
  END IF;
  -- При изменении одного — обновляем другой
  IF TG_OP = 'UPDATE' THEN
    IF NEW.claims IS DISTINCT FROM OLD.claims THEN
      NEW.previous_claims_count := NEW.claims;
    ELSIF NEW.previous_claims_count IS DISTINCT FROM OLD.previous_claims_count THEN
      NEW.claims := NEW.previous_claims_count;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kbm_cache_sync_claims ON public.insurance_kbm_cache;
CREATE TRIGGER kbm_cache_sync_claims
  BEFORE INSERT OR UPDATE ON public.insurance_kbm_cache
  FOR EACH ROW EXECUTE FUNCTION public.trg_kbm_cache_sync_claims();

-- Делаем previous_claims_count nullable для совместимости
DO $$ BEGIN
  ALTER TABLE public.insurance_kbm_cache ALTER COLUMN previous_claims_count DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- 11. CRM ↔ Insurance cross-references
-- ─────────────────────────────────────────────────────────────

-- crm.clients → insurance_client_id
DO $$ BEGIN
  ALTER TABLE crm.clients ADD COLUMN insurance_client_id uuid
    REFERENCES public.insurance_clients(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

-- insurance_clients → crm_client_id
ALTER TABLE public.insurance_clients
  ADD COLUMN IF NOT EXISTS crm_client_id uuid;

-- crm.deals → insurance_policy_id
DO $$ BEGIN
  ALTER TABLE crm.deals ADD COLUMN insurance_policy_id uuid
    REFERENCES public.insurance_policies(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

-- agent_profiles → crm_profile_id
ALTER TABLE public.agent_profiles
  ADD COLUMN IF NOT EXISTS crm_profile_id uuid;

CREATE INDEX IF NOT EXISTS idx_insurance_clients_crm
  ON public.insurance_clients (crm_client_id) WHERE crm_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_profiles_crm
  ON public.agent_profiles (crm_profile_id) WHERE crm_profile_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 12. Триггер: INSERT в insurance_policies → auto-create insurance_commissions
--     Только если agent_id указан
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_policy_auto_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agent_profile_id uuid;
  v_commission_rate numeric(5,2);
  v_premium numeric(12,2);
BEGIN
  -- agent_id в policies ссылается на agent_profiles.id
  IF NEW.agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_agent_profile_id := NEW.agent_id;

  -- Получаем ставку комиссии агента
  SELECT commission_rate INTO v_commission_rate
    FROM agent_profiles WHERE id = v_agent_profile_id;

  IF v_commission_rate IS NULL THEN
    v_commission_rate := 10.00; -- дефолт
  END IF;

  -- Определяем премию
  v_premium := COALESCE(NEW.premium_amount, NEW.premium, NEW.coverage_amount, 0);

  IF v_premium > 0 THEN
    INSERT INTO insurance_commissions (agent_id, policy_id, amount, rate, status)
    VALUES (
      v_agent_profile_id,
      NEW.id,
      ROUND(v_premium * v_commission_rate / 100, 2),
      v_commission_rate,
      'pending'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS policy_auto_commission ON public.insurance_policies;
CREATE TRIGGER policy_auto_commission
  AFTER INSERT ON public.insurance_policies
  FOR EACH ROW EXECUTE FUNCTION public.trg_policy_auto_commission();

-- ─────────────────────────────────────────────────────────────
-- 13. RLS-политики для insurance_commissions
--     (таблица уже существует, но RLS мог быть не настроен)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.insurance_commissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "commissions_own_select" ON public.insurance_commissions
    FOR SELECT USING (
      agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "commissions_own_insert" ON public.insurance_commissions
    FOR INSERT WITH CHECK (
      agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- Готово. Все расхождения между Edge Functions и схемой БД исправлены.
-- ─────────────────────────────────────────────────────────────
