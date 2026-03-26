-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- =============================================================================
-- ECOMANSONI Navigation Platform — Dispatch / Matching таблицы
-- Миграция: 20260307000003_navigation_dispatch_tables.sql
-- Зависимости: 20260307000002_navigation_core_tables.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. nav_driver_profiles — профили водителей и курьеров
--    id = auth.users.id (one-to-one)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_driver_profiles (
    id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    vehicle_type         TEXT NOT NULL CHECK (vehicle_type IN ('car','motorcycle','bicycle','foot')),
    vehicle_class        TEXT NOT NULL CHECK (vehicle_class IN (
                             'economy','comfort','business','cargo_small','cargo_large'
                         )),
    license_plate        TEXT,
    vehicle_model        TEXT,
    is_active            BOOLEAN NOT NULL DEFAULT true,
    is_verified          BOOLEAN NOT NULL DEFAULT false,
    rating               NUMERIC(3,2) NOT NULL DEFAULT 5.00 CHECK (rating BETWEEN 1 AND 5),
    total_trips          INTEGER NOT NULL DEFAULT 0 CHECK (total_trips >= 0),
    acceptance_rate      NUMERIC(5,2) NOT NULL DEFAULT 100.00 CHECK (acceptance_rate BETWEEN 0 AND 100),
    cancellation_rate    NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (cancellation_rate BETWEEN 0 AND 100),
    current_zone_id      UUID REFERENCES public.nav_zones(id) ON DELETE SET NULL,
    max_concurrent_orders INTEGER NOT NULL DEFAULT 1 CHECK (max_concurrent_orders BETWEEN 1 AND 10),
    properties           JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nav_driver_profiles IS 'Профиль водителя/курьера. Один к одному с auth.users.';
COMMENT ON COLUMN public.nav_driver_profiles.acceptance_rate IS 'Процент принятых offers за последние 30 дней [0..100]';
COMMENT ON COLUMN public.nav_driver_profiles.cancellation_rate IS 'Процент отменённых поездок за последние 30 дней [0..100]';

CREATE INDEX IF NOT EXISTS idx_nav_driver_profiles_is_active
    ON public.nav_driver_profiles(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_nav_driver_profiles_vehicle_class
    ON public.nav_driver_profiles(vehicle_class);
CREATE INDEX IF NOT EXISTS idx_nav_driver_profiles_current_zone
    ON public.nav_driver_profiles(current_zone_id) WHERE current_zone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nav_driver_profiles_verified_active
    ON public.nav_driver_profiles(is_verified, is_active) WHERE is_verified = true AND is_active = true;

ALTER TABLE public.nav_driver_profiles ENABLE ROW LEVEL SECURITY;

-- Водитель видит и редактирует только свой профиль
CREATE POLICY "nav_driver_profiles_select_own"
    ON public.nav_driver_profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

CREATE POLICY "nav_driver_profiles_update_own"
    ON public.nav_driver_profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "nav_driver_profiles_insert_own"
    ON public.nav_driver_profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

-- service_role — полный доступ (dispatch engine, admin)
CREATE POLICY "nav_driver_profiles_all_service_role"
    ON public.nav_driver_profiles FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 2. nav_trips — поездки и заказы
--    FSM статусов: requested → searching → driver_assigned → driver_enroute
--                 → driver_arrived → in_progress → completed | cancelled
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_trips (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    driver_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    service_type         TEXT NOT NULL CHECK (service_type IN (
                             'standard','premium','delivery','cargo'
                         )),
    status               TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
                             'requested','searching','driver_assigned','driver_enroute',
                             'driver_arrived','in_progress','completed','cancelled'
                         )),
    -- Точки маршрута
    pickup_location      GEOMETRY(Point, 4326) NOT NULL,
    pickup_address       TEXT,
    dropoff_location     GEOMETRY(Point, 4326) NOT NULL,
    dropoff_address      TEXT,
    waypoints            JSONB,                 -- [{lat, lng, address}, …]
    route_geometry       GEOMETRY(LineString, 4326),
    -- Метрики маршрута
    estimated_distance_m INTEGER CHECK (estimated_distance_m > 0),
    estimated_duration_s INTEGER CHECK (estimated_duration_s > 0),
    actual_distance_m    INTEGER CHECK (actual_distance_m > 0),
    actual_duration_s    INTEGER CHECK (actual_duration_s > 0),
    -- Цена
    estimated_price      NUMERIC(10,2) CHECK (estimated_price >= 0),
    actual_price         NUMERIC(10,2) CHECK (actual_price >= 0),
    currency             TEXT NOT NULL DEFAULT 'RUB' CHECK (length(currency) = 3),
    surge_multiplier     NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (surge_multiplier >= 1),
    payment_method       TEXT,                  -- cash, card, wallet
    -- Оценки
    rating_by_rider      SMALLINT CHECK (rating_by_rider BETWEEN 1 AND 5),
    rating_by_driver     SMALLINT CHECK (rating_by_driver BETWEEN 1 AND 5),
    -- Отмена
    cancel_reason        TEXT,
    cancelled_by         TEXT CHECK (cancelled_by IN ('rider','driver','system')),
    -- Произвольные метаданные (промокоды, бонусы, …)
    metadata             JSONB NOT NULL DEFAULT '{}',
    -- Временная шкала FSM
    requested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_at          TIMESTAMPTZ,
    pickup_arrived_at    TIMESTAMPTZ,
    started_at           TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ,
    cancelled_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Инвариант: поездка не может быть одновременно завершена и отменена
    CONSTRAINT nav_trips_no_completed_and_cancelled CHECK (
        NOT (completed_at IS NOT NULL AND cancelled_at IS NOT NULL)
    )
);

COMMENT ON TABLE  public.nav_trips IS 'Поездки/заказы. FSM статусов контролируется функцией nav_trip_state_transition().';
COMMENT ON COLUMN public.nav_trips.surge_multiplier IS 'Коэффициент surge pricing >= 1.00 на момент создания заказа';

CREATE INDEX IF NOT EXISTS idx_nav_trips_requester
    ON public.nav_trips(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_trips_driver
    ON public.nav_trips(driver_id, created_at DESC) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nav_trips_status
    ON public.nav_trips(status);
CREATE INDEX IF NOT EXISTS idx_nav_trips_active
    ON public.nav_trips(status, created_at DESC)
    WHERE status NOT IN ('completed','cancelled');
CREATE INDEX IF NOT EXISTS idx_nav_trips_pickup_location
    ON public.nav_trips USING GIST(pickup_location);
CREATE INDEX IF NOT EXISTS idx_nav_trips_dropoff_location
    ON public.nav_trips USING GIST(dropoff_location);
CREATE INDEX IF NOT EXISTS idx_nav_trips_requested_at
    ON public.nav_trips(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_trips_metadata
    ON public.nav_trips USING GIN(metadata);

ALTER TABLE public.nav_trips ENABLE ROW LEVEL SECURITY;

-- Rider видит свои поездки
CREATE POLICY "nav_trips_select_requester"
    ON public.nav_trips FOR SELECT
    TO authenticated
    USING (requester_id = auth.uid());

-- Driver видит назначенные ему (или активные — для dispatch UI)
CREATE POLICY "nav_trips_select_driver"
    ON public.nav_trips FOR SELECT
    TO authenticated
    USING (driver_id = auth.uid());

-- Rider создаёт поездку от своего имени
CREATE POLICY "nav_trips_insert_requester"
    ON public.nav_trips FOR INSERT
    TO authenticated
    WITH CHECK (requester_id = auth.uid());

-- service_role — полный доступ
CREATE POLICY "nav_trips_all_service_role"
    ON public.nav_trips FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 3. nav_dispatch_offers — офферы водителям от dispatch engine
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_dispatch_offers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id          UUID NOT NULL REFERENCES public.nav_trips(id) ON DELETE CASCADE,
    driver_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                         'pending','accepted','rejected','expired','cancelled'
                     )),
    score            NUMERIC(8,4),              -- scoring функция dispatch engine
    pickup_eta_s     INTEGER CHECK (pickup_eta_s >= 0),
    offered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at     TIMESTAMPTZ,
    expires_at       TIMESTAMPTZ NOT NULL,
    rejection_reason TEXT,
    metadata         JSONB NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE  public.nav_dispatch_offers IS 'Офферы водителям от системы dispatch. TTL контролируется через expires_at.';
COMMENT ON COLUMN public.nav_dispatch_offers.score IS 'Скор dispatch алгоритма: выше = приоритетнее для этого водителя';

CREATE INDEX IF NOT EXISTS idx_nav_dispatch_offers_trip
    ON public.nav_dispatch_offers(trip_id, status);
CREATE INDEX IF NOT EXISTS idx_nav_dispatch_offers_driver
    ON public.nav_dispatch_offers(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_nav_dispatch_offers_pending
    ON public.nav_dispatch_offers(status, expires_at)
    WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_nav_dispatch_offers_unique_pending
    ON public.nav_dispatch_offers(trip_id, driver_id)
    WHERE status = 'pending';

ALTER TABLE public.nav_dispatch_offers ENABLE ROW LEVEL SECURITY;

-- Driver видит только свои офферы
CREATE POLICY "nav_dispatch_offers_select_driver"
    ON public.nav_dispatch_offers FOR SELECT
    TO authenticated
    USING (driver_id = auth.uid());

-- Driver может обновить (принять/отклонить) только свой оффер
CREATE POLICY "nav_dispatch_offers_update_driver"
    ON public.nav_dispatch_offers FOR UPDATE
    TO authenticated
    USING (driver_id = auth.uid())
    WITH CHECK (driver_id = auth.uid());

CREATE POLICY "nav_dispatch_offers_all_service_role"
    ON public.nav_dispatch_offers FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 4. nav_dispatch_log — аудит-лог решений dispatch engine
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_dispatch_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id             UUID NOT NULL REFERENCES public.nav_trips(id) ON DELETE CASCADE,
    candidates_count    INTEGER NOT NULL DEFAULT 0 CHECK (candidates_count >= 0),
    search_radius_m     INTEGER CHECK (search_radius_m > 0),
    h3_cells_searched   TEXT[],
    scoring_algorithm   TEXT NOT NULL,
    decision            JSONB NOT NULL DEFAULT '{}',   -- полное решение с обоснованием
    latency_ms          INTEGER CHECK (latency_ms >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nav_dispatch_log IS 'Аудит-лог dispatch: каждое решение по назначению водителя записывается для отладки и аудита.';

CREATE INDEX IF NOT EXISTS idx_nav_dispatch_log_trip
    ON public.nav_dispatch_log(trip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_dispatch_log_created_at
    ON public.nav_dispatch_log(created_at DESC);

ALTER TABLE public.nav_dispatch_log ENABLE ROW LEVEL SECURITY;

-- Только service_role читает/пишет логи
CREATE POLICY "nav_dispatch_log_all_service_role"
    ON public.nav_dispatch_log FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
