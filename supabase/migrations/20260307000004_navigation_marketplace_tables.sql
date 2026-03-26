-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- =============================================================================
-- ECOMANSONI Navigation Platform — Marketplace: surge pricing, forecasting, anti-fraud
-- Миграция: 20260307000004_navigation_marketplace_tables.sql
-- Зависимости: 20260307000003_navigation_dispatch_tables.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. nav_zone_market_state — снимок состояния рынка по H3 ячейкам
--    Записывается каждые N секунд балансировщиком (supply/demand engine)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_zone_market_state (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id                 UUID REFERENCES public.nav_zones(id) ON DELETE CASCADE,
    h3_cell                 TEXT NOT NULL,
    h3_resolution           INTEGER NOT NULL DEFAULT 7 CHECK (h3_resolution BETWEEN 0 AND 15),
    open_requests           INTEGER NOT NULL DEFAULT 0 CHECK (open_requests >= 0),
    active_drivers          INTEGER NOT NULL DEFAULT 0 CHECK (active_drivers >= 0),
    trusted_supply          INTEGER NOT NULL DEFAULT 0 CHECK (trusted_supply >= 0),
    median_pickup_eta_s     INTEGER CHECK (median_pickup_eta_s >= 0),
    avg_acceptance_rate     NUMERIC(5,2) CHECK (avg_acceptance_rate BETWEEN 0 AND 100),
    avg_cancellation_rate   NUMERIC(5,2) CHECK (avg_cancellation_rate BETWEEN 0 AND 100),
    shortage_probability    NUMERIC(5,4) CHECK (shortage_probability BETWEEN 0 AND 1),
    measured_at             TIMESTAMPTZ NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nav_zone_market_state IS 'Снимок баланса спроса/предложения по H3 ячейкам. Основа для surge pricing.';
COMMENT ON COLUMN public.nav_zone_market_state.trusted_supply IS 'Активные водители с низким risk_score (исключены антифрод)';
COMMENT ON COLUMN public.nav_zone_market_state.shortage_probability IS 'P(shortage) за следующие 15 минут [0,1]';

CREATE INDEX IF NOT EXISTS idx_nav_zone_market_state_h3_time
    ON public.nav_zone_market_state(h3_cell, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_zone_market_state_zone
    ON public.nav_zone_market_state(zone_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_zone_market_state_shortage
    ON public.nav_zone_market_state(shortage_probability DESC, measured_at DESC)
    WHERE shortage_probability > 0.5;

ALTER TABLE public.nav_zone_market_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nav_zone_market_state_select_authenticated"
    ON public.nav_zone_market_state FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "nav_zone_market_state_all_service_role"
    ON public.nav_zone_market_state FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 2. nav_surge_pricing — действующие surge multipliers по H3 ячейкам
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_surge_pricing (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id          UUID REFERENCES public.nav_zones(id) ON DELETE CASCADE,
    h3_cell          TEXT NOT NULL,
    multiplier       NUMERIC(4,2) NOT NULL DEFAULT 1.00 CHECK (multiplier >= 1.00 AND multiplier <= 10.00),
    raw_multiplier   NUMERIC(4,2) CHECK (raw_multiplier >= 1.00),
    imbalance_score  NUMERIC(6,4) CHECK (imbalance_score >= 0),
    reason_codes     TEXT[],                    -- ['high_demand','low_supply','rain']
    confidence       NUMERIC(3,2) CHECK (confidence BETWEEN 0 AND 1),
    effective_from   TIMESTAMPTZ NOT NULL,
    effective_until  TIMESTAMPTZ NOT NULL,
    policy_version   TEXT NOT NULL DEFAULT '1.0',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Нет пересекающихся активных surge для одной ячейки
    CONSTRAINT nav_surge_pricing_effective_order CHECK (effective_from < effective_until)
);

COMMENT ON TABLE  public.nav_surge_pricing IS 'Активные surge multipliers. multiplier = min(raw_multiplier, policy_cap).';
COMMENT ON COLUMN public.nav_surge_pricing.raw_multiplier IS 'Сырой multiplier из модели до применения policy caps';
COMMENT ON COLUMN public.nav_surge_pricing.reason_codes IS 'Машиночитаемые причины: high_demand, low_supply, weather_event, special_event';

CREATE INDEX IF NOT EXISTS idx_nav_surge_pricing_h3_active
    ON public.nav_surge_pricing(h3_cell, effective_from, effective_until);
CREATE INDEX IF NOT EXISTS idx_nav_surge_pricing_zone
    ON public.nav_surge_pricing(zone_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_nav_surge_pricing_current
    ON public.nav_surge_pricing(h3_cell, effective_until);

ALTER TABLE public.nav_surge_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nav_surge_pricing_select_authenticated"
    ON public.nav_surge_pricing FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "nav_surge_pricing_all_service_role"
    ON public.nav_surge_pricing FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 3. nav_demand_forecast — прогнозы спроса и предложения
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_demand_forecast (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id              TEXT,
    h3_cell              TEXT,
    h3_resolution        INTEGER CHECK (h3_resolution BETWEEN 0 AND 15),
    bucket_start         TIMESTAMPTZ NOT NULL,
    bucket_duration_m    INTEGER NOT NULL DEFAULT 15 CHECK (bucket_duration_m IN (5,10,15,30,60)),
    demand_p50           NUMERIC(8,2) CHECK (demand_p50 >= 0),
    demand_p90           NUMERIC(8,2) CHECK (demand_p90 >= 0),
    supply_p50           NUMERIC(8,2) CHECK (supply_p50 >= 0),
    shortage_probability NUMERIC(5,4) CHECK (shortage_probability BETWEEN 0 AND 1),
    expected_eta_p50     NUMERIC(6,1) CHECK (expected_eta_p50 >= 0),
    model_version        TEXT NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nav_demand_forecast IS 'ML-прогнозы спроса/предложения по H3 ячейкам на 15-минутные бакеты.';

CREATE INDEX IF NOT EXISTS idx_nav_demand_forecast_cell_bucket
    ON public.nav_demand_forecast(h3_cell, bucket_start);
CREATE INDEX IF NOT EXISTS idx_nav_demand_forecast_city_bucket
    ON public.nav_demand_forecast(city_id, bucket_start);
CREATE INDEX IF NOT EXISTS idx_nav_demand_forecast_future
    ON public.nav_demand_forecast(bucket_start);

ALTER TABLE public.nav_demand_forecast ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nav_demand_forecast_select_authenticated"
    ON public.nav_demand_forecast FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "nav_demand_forecast_all_service_role"
    ON public.nav_demand_forecast FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 4. nav_risk_scores — агрегированные risk scores по акторам (anti-fraud)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_risk_scores (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    actor_type               TEXT NOT NULL CHECK (actor_type IN ('driver','courier','user')),
    risk_score               NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 1),
    risk_types               TEXT[],                -- ['gps_spoofing','surge_manipulation']
    confidence               NUMERIC(3,2) CHECK (confidence BETWEEN 0 AND 1),
    last_signals             JSONB NOT NULL DEFAULT '{}',
    enforcement_level        TEXT NOT NULL DEFAULT 'observe' CHECK (enforcement_level IN (
                                 'observe','soft_throttle','hard_throttle','suspended','banned'
                             )),
    enforcement_expires_at   TIMESTAMPTZ,
    evaluated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Один активный risk score на актора
    UNIQUE (actor_id)
);

COMMENT ON TABLE  public.nav_risk_scores IS 'Агрегированный anti-fraud скор на актора. Обновляется ML моделью real-time.';
COMMENT ON COLUMN public.nav_risk_scores.enforcement_level IS 'observe — только мониторинг; banned — полная блокировка';
COMMENT ON COLUMN public.nav_risk_scores.last_signals IS 'JSON последних сигналов детектора: {signal_name: {score, ts, details}}';

CREATE INDEX IF NOT EXISTS idx_nav_risk_scores_actor
    ON public.nav_risk_scores(actor_id);
CREATE INDEX IF NOT EXISTS idx_nav_risk_scores_enforcement
    ON public.nav_risk_scores(enforcement_level)
    WHERE enforcement_level != 'observe';
CREATE INDEX IF NOT EXISTS idx_nav_risk_scores_high_risk
    ON public.nav_risk_scores(risk_score DESC)
    WHERE risk_score > 0.7;
CREATE INDEX IF NOT EXISTS idx_nav_risk_scores_risk_types
    ON public.nav_risk_scores USING GIN(risk_types);

ALTER TABLE public.nav_risk_scores ENABLE ROW LEVEL SECURITY;

-- Только service_role управляет risk scores
CREATE POLICY "nav_risk_scores_all_service_role"
    ON public.nav_risk_scores FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 5. nav_risk_events — события детектора аномалий
--    Партиционирование по created_at (monthly) — события накапливаются быстро
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_risk_events (
    id          UUID NOT NULL DEFAULT gen_random_uuid(),
    actor_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL CHECK (event_type IN (
                    'gps_spoofing','impossible_speed','coordinated_logoff',
                    'selective_acceptance','cancellation_abuse','surge_manipulation'
                )),
    severity    TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
    details     JSONB NOT NULL DEFAULT '{}',
    location    GEOMETRY(Point, 4326),
    h3_cell     TEXT,
    resolved    BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE  public.nav_risk_events IS 'События anti-fraud детектора. Партиционирована по месяцам.';
COMMENT ON COLUMN public.nav_risk_events.details IS 'Полный payload события: координаты, скорости, delta times, device fingerprint';

CREATE INDEX IF NOT EXISTS idx_nav_risk_events_actor
    ON public.nav_risk_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_risk_events_type_severity
    ON public.nav_risk_events(event_type, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_risk_events_location
    ON public.nav_risk_events USING GIST(location) WHERE location IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nav_risk_events_unresolved
    ON public.nav_risk_events(severity, created_at DESC)
    WHERE resolved = false;

-- Месячные партиции
CREATE TABLE IF NOT EXISTS public.nav_risk_events_2026_03
    PARTITION OF public.nav_risk_events
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE IF NOT EXISTS public.nav_risk_events_2026_04
    PARTITION OF public.nav_risk_events
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE IF NOT EXISTS public.nav_risk_events_default
    PARTITION OF public.nav_risk_events DEFAULT;

ALTER TABLE public.nav_risk_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nav_risk_events_all_service_role"
    ON public.nav_risk_events FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 6. nav_enforcement_actions — аудит-лог enforcement решений
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_enforcement_actions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action_type     TEXT NOT NULL,              -- ban, throttle, warn, unban, suspend
    reason          TEXT NOT NULL,
    previous_level  TEXT CHECK (previous_level IN (
                        'observe','soft_throttle','hard_throttle','suspended','banned'
                    )),
    new_level       TEXT NOT NULL CHECK (new_level IN (
                        'observe','soft_throttle','hard_throttle','suspended','banned'
                    )),
    expires_at      TIMESTAMPTZ,
    performed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nav_enforcement_actions IS 'Неизменяемый аудит-лог всех enforcement действий. Не обновляется после создания.';

CREATE INDEX IF NOT EXISTS idx_nav_enforcement_actions_actor
    ON public.nav_enforcement_actions(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_enforcement_actions_action_type
    ON public.nav_enforcement_actions(action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_enforcement_actions_performed_by
    ON public.nav_enforcement_actions(performed_by) WHERE performed_by IS NOT NULL;

ALTER TABLE public.nav_enforcement_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nav_enforcement_actions_all_service_role"
    ON public.nav_enforcement_actions FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
