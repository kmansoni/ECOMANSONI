-- Реестр провайдеров (InsSmart, Cherehapa, mock)
CREATE TABLE IF NOT EXISTS insurance_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  base_url text,
  api_key_env text,
  supported_categories text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sandbox_mode boolean NOT NULL DEFAULT true,
  timeout_ms int NOT NULL DEFAULT 10000,
  priority int NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE insurance_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "providers_read_all" ON insurance_providers
  FOR SELECT USING (true);

CREATE POLICY "providers_manage_service" ON insurance_providers
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO insurance_providers (code, name, base_url, api_key_env, supported_categories, priority, timeout_ms, sandbox_mode)
VALUES
  ('inssmart', 'InsSmart B2B', 'https://b2b-api.inssmart.ru/api/v1', 'INSSMART_API_KEY',
   ARRAY['osago','kasko','dms','property','mortgage','life'], 10, 15000, true),
  ('cherehapa', 'Cherehapa Partners', 'https://api.cherehapa.ru/v2', 'CHEREHAPA_API_KEY',
   ARRAY['travel'], 10, 10000, true),
  ('mock', 'Mock Provider', NULL, NULL,
   ARRAY['osago','kasko','dms','travel','property','mortgage','life'], 1, 1000, false)
ON CONFLICT (code) DO NOTHING;


-- Сессии мультиоффера
CREATE TABLE IF NOT EXISTS insurance_quote_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  request_params jsonb NOT NULL DEFAULT '{}',
  providers_queried int NOT NULL DEFAULT 0,
  providers_succeeded int NOT NULL DEFAULT 0,
  calculation_time_ms int,
  has_real_quotes boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired', 'purchased')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE insurance_quote_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_sessions_own" ON insurance_quote_sessions
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_quote_sessions_user
  ON insurance_quote_sessions (user_id, created_at DESC);


-- Офферы в сессии
CREATE TABLE IF NOT EXISTS insurance_quote_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES insurance_quote_sessions(id) ON DELETE CASCADE,
  provider_code text NOT NULL,
  company_name text NOT NULL,
  company_id uuid REFERENCES insurance_companies(id),
  external_offer_id text,
  premium_amount numeric(12,2) NOT NULL,
  premium_monthly numeric(12,2),
  coverage_amount numeric(14,2) NOT NULL,
  deductible_amount numeric(12,2) DEFAULT 0,
  valid_until timestamptz NOT NULL,
  features text[] DEFAULT '{}',
  exclusions text[] DEFAULT '{}',
  documents_required text[] DEFAULT '{}',
  purchase_available boolean NOT NULL DEFAULT false,
  is_mock boolean NOT NULL DEFAULT false,
  details jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'selected', 'expired', 'purchased')),
  rank int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE insurance_quote_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_offers_own" ON insurance_quote_offers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM insurance_quote_sessions s
      WHERE s.id = insurance_quote_offers.session_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM insurance_quote_sessions s
      WHERE s.id = insurance_quote_offers.session_id
        AND s.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_quote_offers_session
  ON insurance_quote_offers (session_id);

CREATE INDEX IF NOT EXISTS idx_quote_offers_provider
  ON insurance_quote_offers (provider_code, created_at DESC);


-- Лог вызовов API провайдеров (только service_role)
CREATE TABLE IF NOT EXISTS insurance_provider_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL,
  operation text NOT NULL,
  request_category text,
  http_status int,
  response_time_ms int NOT NULL,
  is_success boolean NOT NULL,
  error_message text,
  request_meta jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE insurance_provider_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_logs_deny_all" ON insurance_provider_logs
  FOR ALL USING (false);

CREATE INDEX IF NOT EXISTS idx_provider_logs_code
  ON insurance_provider_logs (provider_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_logs_errors
  ON insurance_provider_logs (created_at DESC) WHERE NOT is_success;


-- Кэш поиска авто по номеру (DaData)
CREATE TABLE IF NOT EXISTS insurance_vehicle_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate text NOT NULL,
  plate_normalized text GENERATED ALWAYS AS (
    upper(regexp_replace(plate, '[^А-ЯA-Z0-9]', '', 'gi'))
  ) STORED,
  vin text,
  make text NOT NULL,
  model text NOT NULL,
  year int NOT NULL,
  engine_power int,
  body_type text,
  color text,
  vehicle_type text NOT NULL DEFAULT 'car',
  source text NOT NULL DEFAULT 'dadata',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

ALTER TABLE insurance_vehicle_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_cache_read_all" ON insurance_vehicle_cache
  FOR SELECT USING (true);

CREATE POLICY "vehicle_cache_manage_service" ON insurance_vehicle_cache
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_cache_plate
  ON insurance_vehicle_cache (plate_normalized);

CREATE INDEX IF NOT EXISTS idx_vehicle_cache_vin
  ON insurance_vehicle_cache (vin) WHERE vin IS NOT NULL;


-- Кэш КБМ (коэффициент бонус-малус)
CREATE TABLE IF NOT EXISTS insurance_kbm_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_license_hash text NOT NULL,
  birth_date_hash text NOT NULL,
  kbm_class int NOT NULL,
  kbm_coefficient numeric(4,2) NOT NULL,
  kbm_label text NOT NULL,
  previous_claims_count int NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'estimate',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

ALTER TABLE insurance_kbm_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kbm_cache_deny_all" ON insurance_kbm_cache
  FOR ALL USING (false);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kbm_cache_driver
  ON insurance_kbm_cache (driver_license_hash, birth_date_hash);


-- Очистка протухших данных
CREATE OR REPLACE FUNCTION cleanup_expired_insurance_data()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE insurance_quote_sessions SET status = 'expired'
    WHERE status = 'pending' AND expires_at < now();
  DELETE FROM insurance_vehicle_cache WHERE expires_at < now();
  DELETE FROM insurance_kbm_cache WHERE expires_at < now();
  DELETE FROM insurance_provider_logs WHERE created_at < now() - interval '90 days';
$$;
