-- =============================================================================
-- ECOMANSONI Navigation Platform — Основные таблицы навигации
-- Миграция: 20260307000002_navigation_core_tables.sql
-- Зависимости: 20260307000001_navigation_extensions.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. nav_zones — зоны/регионы для навигации (города, районы, сервисные зоны)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_zones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    city_id         TEXT NOT NULL,
    boundary        GEOMETRY(Polygon, 4326),
    h3_resolution   INTEGER NOT NULL DEFAULT 7 CHECK (h3_resolution BETWEEN 0 AND 15),
    timezone        TEXT NOT NULL DEFAULT 'Europe/Moscow',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nav_zones IS 'Сервисные зоны и регионы навигационной платформы';
COMMENT ON COLUMN public.nav_zones.boundary IS 'PostGIS полигон зоны в WGS84 (SRID 4326)';
COMMENT ON COLUMN public.nav_zones.h3_resolution IS 'Базовое разрешение H3 ячеек для этой зоны (0-15)';

CREATE INDEX IF NOT EXISTS idx_nav_zones_boundary   ON public.nav_zones USING GIST(boundary);
CREATE INDEX IF NOT EXISTS idx_nav_zones_city_id    ON public.nav_zones(city_id);
CREATE INDEX IF NOT EXISTS idx_nav_zones_is_active  ON public.nav_zones(is_active) WHERE is_active = true;

ALTER TABLE public.nav_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nav_zones_select_authenticated"
    ON public.nav_zones FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "nav_zones_all_service_role"
    ON public.nav_zones FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 2. nav_road_segments — дорожный граф (импортируется из OSM)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_road_segments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    osm_way_id      BIGINT,
    geometry        GEOMETRY(LineString, 4326) NOT NULL,
    road_class      TEXT NOT NULL CHECK (road_class IN (
                        'motorway','trunk','primary','secondary',
                        'tertiary','residential','service','path'
                    )),
    name            TEXT,
    speed_limit_kmh INTEGER CHECK (speed_limit_kmh > 0 AND speed_limit_kmh <= 300),
    lanes           INTEGER CHECK (lanes > 0 AND lanes <= 20),
    is_oneway       BOOLEAN NOT NULL DEFAULT false,
    surface         TEXT,                       -- asphalt, cobblestone, dirt, gravel, …
    h3_cells        TEXT[],                     -- H3 ячейки, которые пересекает сегмент
    properties      JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nav_road_segments IS 'Дорожный граф — импорт из OpenStreetMap';
COMMENT ON COLUMN public.nav_road_segments.h3_cells IS 'Массив H3 ячеек (res 7), которые пересекает сегмент, для пространственного поиска без ST_Distance';

CREATE INDEX IF NOT EXISTS idx_nav_road_segments_geometry
    ON public.nav_road_segments USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_nav_road_segments_h3_cells
    ON public.nav_road_segments USING GIN(h3_cells);
CREATE INDEX IF NOT EXISTS idx_nav_road_segments_osm_way_id
    ON public.nav_road_segments(osm_way_id) WHERE osm_way_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nav_road_segments_road_class
    ON public.nav_road_segments(road_class);
CREATE INDEX IF NOT EXISTS idx_nav_road_segments_properties
    ON public.nav_road_segments USING GIN(properties);

ALTER TABLE public.nav_road_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nav_road_segments_select_authenticated"
    ON public.nav_road_segments FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "nav_road_segments_all_service_role"
    ON public.nav_road_segments FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 3. nav_pois — Points of Interest (кафе, заправки, аптеки, …)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_pois (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    category        TEXT NOT NULL,              -- food, fuel, pharmacy, hotel, …
    subcategory     TEXT,
    location        GEOMETRY(Point, 4326) NOT NULL,
    h3_index_r9     TEXT,                       -- H3 ячейка уровня 9 (~174м²)
    address         TEXT,
    phone           TEXT,
    website         TEXT,
    opening_hours   JSONB,                      -- { "mo": "09:00-21:00", … }
    rating          NUMERIC(3,2) CHECK (rating BETWEEN 0 AND 5),
    review_count    INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
    photos          TEXT[],
    source          TEXT NOT NULL DEFAULT 'osm',   -- osm, google, yandex, manual
    source_id       TEXT,
    is_verified     BOOLEAN NOT NULL DEFAULT false,
    properties      JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nav_pois IS 'Точки интереса — POI для навигации';
COMMENT ON COLUMN public.nav_pois.h3_index_r9 IS 'H3 ячейка разрешения 9 (~174м²) для быстрого proximity-поиска';
COMMENT ON COLUMN public.nav_pois.opening_hours IS 'JSON расписание: {"mo":"09:00-21:00","tu":"09:00-21:00","ph":"closed"}';

CREATE INDEX IF NOT EXISTS idx_nav_pois_location
    ON public.nav_pois USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_nav_pois_h3_index_r9
    ON public.nav_pois(h3_index_r9);
CREATE INDEX IF NOT EXISTS idx_nav_pois_category
    ON public.nav_pois(category);
CREATE INDEX IF NOT EXISTS idx_nav_pois_category_subcategory
    ON public.nav_pois(category, subcategory);
CREATE INDEX IF NOT EXISTS idx_nav_pois_name_trgm
    ON public.nav_pois USING GIN(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nav_pois_source_id
    ON public.nav_pois(source, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nav_pois_verified
    ON public.nav_pois(is_verified) WHERE is_verified = true;
CREATE INDEX IF NOT EXISTS idx_nav_pois_properties
    ON public.nav_pois USING GIN(properties);

ALTER TABLE public.nav_pois ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nav_pois_select_authenticated"
    ON public.nav_pois FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "nav_pois_insert_service_role"
    ON public.nav_pois FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "nav_pois_update_service_role"
    ON public.nav_pois FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "nav_pois_delete_service_role"
    ON public.nav_pois FOR DELETE
    TO service_role
    USING (true);

-- -----------------------------------------------------------------------------
-- 4. nav_addresses — адресный реестр (геокодинг)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_addresses (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    street           TEXT NOT NULL,
    house_number     TEXT,
    city             TEXT NOT NULL,
    postal_code      TEXT,
    country_code     TEXT NOT NULL DEFAULT 'RU' CHECK (length(country_code) = 2),
    location         GEOMETRY(Point, 4326) NOT NULL,
    h3_index_r9      TEXT,
    source           TEXT,                      -- osm, fias, kladr, manual
    confidence_score NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence_score BETWEEN 0 AND 1),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nav_addresses IS 'Адресный реестр — для геокодинга/обратного геокодинга';
COMMENT ON COLUMN public.nav_addresses.confidence_score IS 'Уверенность геокодера [0,1]: 1.0 — точное совпадение';

CREATE INDEX IF NOT EXISTS idx_nav_addresses_location
    ON public.nav_addresses USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_nav_addresses_h3_index_r9
    ON public.nav_addresses(h3_index_r9);
CREATE INDEX IF NOT EXISTS idx_nav_addresses_city
    ON public.nav_addresses(city);
CREATE INDEX IF NOT EXISTS idx_nav_addresses_street_trgm
    ON public.nav_addresses USING GIN(street gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nav_addresses_postal_code
    ON public.nav_addresses(postal_code) WHERE postal_code IS NOT NULL;

ALTER TABLE public.nav_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nav_addresses_select_authenticated"
    ON public.nav_addresses FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "nav_addresses_all_service_role"
    ON public.nav_addresses FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 5. nav_traffic_segments — трафик на дорожных сегментах
--    Партиционирование по measured_at (daily) — снижает объём горячих данных
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_traffic_segments (
    id                    UUID NOT NULL DEFAULT gen_random_uuid(),
    road_segment_id       UUID REFERENCES public.nav_road_segments(id) ON DELETE CASCADE,
    speed_kmh             NUMERIC(5,1) CHECK (speed_kmh >= 0 AND speed_kmh <= 300),
    free_flow_speed_kmh   NUMERIC(5,1) CHECK (free_flow_speed_kmh >= 0 AND free_flow_speed_kmh <= 300),
    congestion_level      TEXT NOT NULL CHECK (congestion_level IN (
                              'free_flow','light','moderate','heavy','standstill'
                          )),
    confidence            NUMERIC(3,2) CHECK (confidence BETWEEN 0 AND 1),
    sample_count          INTEGER NOT NULL DEFAULT 1 CHECK (sample_count > 0),
    measured_at           TIMESTAMPTZ NOT NULL,
    h3_cell               TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (measured_at);

COMMENT ON TABLE public.nav_traffic_segments IS 'Данные о трафике на сегментах дорог. Партиционирована по дням.';

-- Индексы создаются на партиционированной таблице — применяются к каждой партиции
CREATE INDEX IF NOT EXISTS idx_nav_traffic_segments_road_segment
    ON public.nav_traffic_segments(road_segment_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_traffic_segments_h3_cell
    ON public.nav_traffic_segments(h3_cell, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_traffic_segments_congestion
    ON public.nav_traffic_segments(congestion_level, measured_at DESC);

-- Автоматическое создание partitions через pg_cron или приложение.
-- Создаём стартовые партиции на ближайшие дни.
CREATE TABLE IF NOT EXISTS public.nav_traffic_segments_2026_03_07
    PARTITION OF public.nav_traffic_segments
    FOR VALUES FROM ('2026-03-07') TO ('2026-03-08');

CREATE TABLE IF NOT EXISTS public.nav_traffic_segments_2026_03_08
    PARTITION OF public.nav_traffic_segments
    FOR VALUES FROM ('2026-03-08') TO ('2026-03-09');

CREATE TABLE IF NOT EXISTS public.nav_traffic_segments_default
    PARTITION OF public.nav_traffic_segments DEFAULT;

ALTER TABLE public.nav_traffic_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nav_traffic_segments_select_authenticated"
    ON public.nav_traffic_segments FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "nav_traffic_segments_insert_service_role"
    ON public.nav_traffic_segments FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "nav_traffic_segments_update_service_role"
    ON public.nav_traffic_segments FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 6. nav_location_history — история GPS координат пользователей/водителей
--    КРИТИЧНО: только service_role читает все записи; пользователь пишет только свои
--    Партиционирование по recorded_at (daily)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_location_history (
    id           UUID NOT NULL DEFAULT gen_random_uuid(),
    actor_type   TEXT NOT NULL CHECK (actor_type IN ('driver','courier','user')),
    actor_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id    TEXT,                          -- идентификатор устройства
    location     GEOMETRY(Point, 4326) NOT NULL,
    accuracy_m   NUMERIC(6,1) CHECK (accuracy_m >= 0),
    heading_deg  NUMERIC(5,1) CHECK (heading_deg >= 0 AND heading_deg < 360),
    speed_mps    NUMERIC(6,2) CHECK (speed_mps >= 0),
    altitude_m   NUMERIC(7,1),
    session_id   UUID,                          -- группировка по сессии
    trip_id      UUID,                          -- привязка к поездке
    h3_index_r9  TEXT,
    recorded_at  TIMESTAMPTZ NOT NULL,          -- время на устройстве
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (recorded_at);

COMMENT ON TABLE  public.nav_location_history IS 'История GPS-треков. Партиционирована по дням. GDPR: хранить не более 90 дней.';
COMMENT ON COLUMN public.nav_location_history.actor_id IS 'FK auth.users — только авторизованные акторы';
COMMENT ON COLUMN public.nav_location_history.recorded_at IS 'Время записи на устройстве (может быть < created_at из-за буферизации)';

CREATE INDEX IF NOT EXISTS idx_nav_location_history_actor
    ON public.nav_location_history(actor_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_location_history_trip
    ON public.nav_location_history(trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nav_location_history_session
    ON public.nav_location_history(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nav_location_history_location
    ON public.nav_location_history USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_nav_location_history_h3
    ON public.nav_location_history(h3_index_r9, recorded_at DESC);

-- Стартовые партиции
CREATE TABLE IF NOT EXISTS public.nav_location_history_2026_03_07
    PARTITION OF public.nav_location_history
    FOR VALUES FROM ('2026-03-07') TO ('2026-03-08');

CREATE TABLE IF NOT EXISTS public.nav_location_history_2026_03_08
    PARTITION OF public.nav_location_history
    FOR VALUES FROM ('2026-03-08') TO ('2026-03-09');

CREATE TABLE IF NOT EXISTS public.nav_location_history_default
    PARTITION OF public.nav_location_history DEFAULT;

ALTER TABLE public.nav_location_history ENABLE ROW LEVEL SECURITY;

-- Пользователь может записывать ТОЛЬКО свои координаты
CREATE POLICY "nav_location_history_insert_own"
    ON public.nav_location_history FOR INSERT
    TO authenticated
    WITH CHECK (actor_id = auth.uid());

-- SELECT — только service_role (аналитика, dispatch, anti-fraud)
CREATE POLICY "nav_location_history_select_service_role"
    ON public.nav_location_history FOR SELECT
    TO service_role
    USING (true);

CREATE POLICY "nav_location_history_all_service_role"
    ON public.nav_location_history FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
