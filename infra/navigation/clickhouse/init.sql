-- =============================================================================
-- ECOMANSONI Navigation Platform — ClickHouse Analytics Schema
-- Engine: MergeTree family (columnar, append-only, TTL-managed)
-- Partitioning: by month for efficient pruning and tiered storage
-- Ordering keys: chosen for temporal + spatial query patterns
-- =============================================================================

-- =============================================================================
-- DATABASE
-- =============================================================================
CREATE DATABASE IF NOT EXISTS nav;

-- =============================================================================
-- 1. RAW GPS LOCATION EVENTS
-- Write rate: ~10M events/min at peak (10M drivers × 1 Hz)
-- Retention: 7 days raw, then summarized by materialized views
-- Partition: toYYYYMM(event_time) — monthly; prunes old data efficiently
-- Order key: (driver_id, event_time) — covers driver track replay queries
-- =============================================================================
CREATE TABLE IF NOT EXISTS nav.nav_location_events
(
    event_id        UUID            DEFAULT generateUUIDv4(),
    driver_id       UUID            NOT NULL,
    trip_id         Nullable(UUID),
    lat             Float64         NOT NULL,
    lon             Float64         NOT NULL,
    accuracy_m      Float32         DEFAULT 0,
    speed_kmh       Float32         DEFAULT 0,
    bearing_deg     Float32         DEFAULT 0,
    altitude_m      Nullable(Float32),
    provider        LowCardinality(String) DEFAULT 'gps', -- gps | network | fused
    h3_r7           String          NOT NULL,  -- H3 resolution 7 cell (~1.2 km²)
    h3_r9           String          NOT NULL,  -- H3 resolution 9 cell (~0.1 km²)
    event_time      DateTime64(3)   NOT NULL,  -- millisecond precision
    server_time     DateTime64(3)   DEFAULT now64(3),
    app_version     LowCardinality(String) DEFAULT '',
    os_platform     LowCardinality(String) DEFAULT '', -- ios | android
    battery_pct     Nullable(UInt8),
    is_foreground   UInt8           DEFAULT 1,
    _ingested_at    DateTime        DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (driver_id, event_time)
TTL event_time + INTERVAL 7 DAY DELETE
SETTINGS index_granularity = 8192,
         min_bytes_for_wide_part = 10485760;

-- Bloom filter on h3 for geo-bucket queries
ALTER TABLE nav.nav_location_events
    ADD INDEX idx_h3r7 (h3_r7) TYPE bloom_filter(0.01) GRANULARITY 4;

-- =============================================================================
-- 2. TRIP EVENTS
-- One row per trip state transition: created → dispatched → started → completed
-- Retention: 2 years (regulatory + ML training requirement)
-- Order key: (city_id, started_at) — supports city-level funnel analysis
-- =============================================================================
CREATE TABLE IF NOT EXISTS nav.nav_trip_events
(
    event_id        UUID            DEFAULT generateUUIDv4(),
    trip_id         UUID            NOT NULL,
    driver_id       Nullable(UUID),
    rider_id        UUID            NOT NULL,
    city_id         LowCardinality(String) NOT NULL,
    event_type      LowCardinality(String) NOT NULL,
    -- created | driver_assigned | driver_arrived | started | completed | cancelled
    previous_state  LowCardinality(String) DEFAULT '',
    origin_lat      Nullable(Float64),
    origin_lon      Nullable(Float64),
    origin_h3_r7    Nullable(String),
    dest_lat        Nullable(Float64),
    dest_lon        Nullable(Float64),
    dest_h3_r7      Nullable(String),
    distance_km     Nullable(Float32),
    duration_s      Nullable(UInt32),
    fare_amount     Nullable(Decimal(10,2)),
    fare_currency   LowCardinality(String) DEFAULT 'RUB',
    surge_multiplier Nullable(Float32),
    cancel_reason   LowCardinality(String) DEFAULT '',
    cancel_actor    LowCardinality(String) DEFAULT '', -- rider | driver | system
    vehicle_class   LowCardinality(String) DEFAULT '',
    payment_method  LowCardinality(String) DEFAULT '',
    rating_driver   Nullable(UInt8),   -- 1–5
    rating_rider    Nullable(UInt8),
    started_at      DateTime64(3)   NOT NULL,
    ended_at        Nullable(DateTime64(3)),
    event_time      DateTime64(3)   NOT NULL,
    _ingested_at    DateTime        DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (city_id, started_at, trip_id)
TTL event_time + INTERVAL 730 DAY DELETE
SETTINGS index_granularity = 8192;

-- =============================================================================
-- 3. TRAFFIC HISTORY
-- Aggregated per-segment speed snapshots every 5 minutes
-- Source: nav.location pipeline → traffic inference worker
-- Retention: 365 days (seasonality modeling requires full year)
-- Order key: (segment_id, captured_at) — time-series per segment
-- =============================================================================
CREATE TABLE IF NOT EXISTS nav.nav_traffic_history
(
    segment_id      String          NOT NULL,
    captured_at     DateTime        NOT NULL,
    avg_speed_kmh   Float32         NOT NULL,
    median_speed    Float32         NOT NULL,
    p85_speed       Float32         NOT NULL,
    sample_count    UInt32          NOT NULL,
    congestion_lvl  UInt8           NOT NULL, -- 0=free 1=slow 2=heavy 3=standstill
    h3_r8           String          NOT NULL,
    day_of_week     UInt8           NOT NULL, -- 0=Mon..6=Sun
    hour_of_day     UInt8           NOT NULL,
    _ingested_at    DateTime        DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(captured_at)
ORDER BY (segment_id, captured_at)
TTL captured_at + INTERVAL 365 DAY DELETE
SETTINGS index_granularity = 8192;

-- =============================================================================
-- 4. DISPATCH ANALYTICS
-- One row per dispatch decision (match attempt)
-- Critical for ETA accuracy, acceptance rate, and ML feature engineering
-- Retention: 2 years
-- =============================================================================
CREATE TABLE IF NOT EXISTS nav.nav_dispatch_analytics
(
    event_id            UUID            DEFAULT generateUUIDv4(),
    trip_id             UUID            NOT NULL,
    driver_id           Nullable(UUID),
    city_id             LowCardinality(String) NOT NULL,
    dispatch_algo       LowCardinality(String) NOT NULL, -- hungarian | greedy | ml_v2
    outcome             LowCardinality(String) NOT NULL, -- accepted | declined | timeout | no_drivers
    attempt_number      UInt8           NOT NULL,
    drivers_considered  UInt16          NOT NULL,
    winner_distance_m   Nullable(Float32),    -- crow-fly distance to winning driver
    winner_eta_s        Nullable(UInt32),
    actual_pickup_s     Nullable(UInt32),     -- ground truth for ETA accuracy
    eta_error_s         Nullable(Int32),      -- actual - predicted
    surge_multiplier    Float32         DEFAULT 1.0,
    open_requests       UInt16          NOT NULL,
    available_drivers   UInt16          NOT NULL,
    supply_demand_ratio Float32         NOT NULL,
    dispatched_at       DateTime64(3)   NOT NULL,
    _ingested_at        DateTime        DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(dispatched_at)
ORDER BY (city_id, dispatched_at, trip_id)
TTL dispatched_at + INTERVAL 730 DAY DELETE
SETTINGS index_granularity = 8192;

-- =============================================================================
-- 5. SURGE PRICING HISTORY
-- Zone-level surge snapshots every 1 minute
-- Used for: backtesting surge models, regulatory audit, rider transparency
-- Retention: 2 years
-- =============================================================================
CREATE TABLE IF NOT EXISTS nav.nav_surge_history
(
    snapshot_id         UUID            DEFAULT generateUUIDv4(),
    zone_id             String          NOT NULL,
    h3_r7               String          NOT NULL,
    city_id             LowCardinality(String) NOT NULL,
    multiplier          Float32         NOT NULL,
    multiplier_prev     Float32         NOT NULL,
    open_requests       UInt16          NOT NULL,
    available_drivers   UInt16          NOT NULL,
    shortage_prob       Float32         NOT NULL,
    model_version       LowCardinality(String) NOT NULL,
    captured_at         DateTime        NOT NULL,
    _ingested_at        DateTime        DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(captured_at)
ORDER BY (city_id, h3_r7, captured_at)
TTL captured_at + INTERVAL 730 DAY DELETE
SETTINGS index_granularity = 8192;

-- =============================================================================
-- 6. SEARCH & GEOCODING ANALYTICS
-- Every search query (autocomplete + geocode) for relevance tuning
-- Retention: 1 year
-- =============================================================================
CREATE TABLE IF NOT EXISTS nav.nav_search_analytics
(
    event_id        UUID            DEFAULT generateUUIDv4(),
    session_id      UUID            NOT NULL,
    user_id         Nullable(UUID),
    query_text      String          NOT NULL,
    query_lang      LowCardinality(String) DEFAULT 'ru',
    query_type      LowCardinality(String) NOT NULL, -- autocomplete | geocode | reverse
    results_count   UInt8           NOT NULL,
    selected_rank   Nullable(UInt8),  -- position of the result user picked (1-based)
    selected_place_id Nullable(String),
    selected_lat    Nullable(Float64),
    selected_lon    Nullable(Float64),
    latency_ms      UInt32          NOT NULL,
    provider        LowCardinality(String) NOT NULL, -- photon | google | nominatim
    user_lat        Nullable(Float64),
    user_lon        Nullable(Float64),
    user_h3_r7      Nullable(String),
    app_version     LowCardinality(String) DEFAULT '',
    event_time      DateTime64(3)   NOT NULL,
    _ingested_at    DateTime        DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (query_type, event_time, session_id)
TTL event_time + INTERVAL 365 DAY DELETE
SETTINGS index_granularity = 8192;

-- =============================================================================
-- MATERIALIZED VIEWS — Pre-aggregated analytics (zero query latency)
-- =============================================================================

-- -------------------------------------------------------------------------
-- MV 1: Hourly driver location density per H3 cell (r7)
-- Target: nav.nav_location_hourly_agg
-- Used by: surge model, supply forecasting, heatmap tiles
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nav.nav_location_hourly_agg
(
    h3_r7           String          NOT NULL,
    hour            DateTime        NOT NULL,  -- truncated to hour
    driver_count    AggregateFunction(uniqCombined, UUID),
    event_count     AggregateFunction(sum, UInt64),
    avg_speed       AggregateFunction(avg, Float32)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (h3_r7, hour)
TTL hour + INTERVAL 90 DAY DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS nav.mv_location_hourly
TO nav.nav_location_hourly_agg
AS
SELECT
    h3_r7,
    toStartOfHour(event_time)   AS hour,
    uniqCombinedState(driver_id) AS driver_count,
    sumState(toUInt64(1))        AS event_count,
    avgState(speed_kmh)          AS avg_speed
FROM nav.nav_location_events
GROUP BY h3_r7, hour;

-- -------------------------------------------------------------------------
-- MV 2: Daily trip funnel per city
-- Target: nav.nav_trip_daily_funnel
-- Used by: business dashboards, city ops, driver supply models
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nav.nav_trip_daily_funnel
(
    city_id         LowCardinality(String) NOT NULL,
    day             Date            NOT NULL,
    event_type      LowCardinality(String) NOT NULL,
    trip_count      AggregateFunction(count, UInt64),
    unique_riders   AggregateFunction(uniqCombined, UUID),
    unique_drivers  AggregateFunction(uniqCombined, UUID),
    avg_fare        AggregateFunction(avg, Decimal(10,2)),
    avg_duration_s  AggregateFunction(avg, UInt32)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (city_id, day, event_type)
TTL day + INTERVAL 730 DAY DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS nav.mv_trip_daily_funnel
TO nav.nav_trip_daily_funnel
AS
SELECT
    city_id,
    toDate(event_time)          AS day,
    event_type,
    countState()                AS trip_count,
    uniqCombinedState(rider_id) AS unique_riders,
    uniqCombinedStateIf(driver_id, driver_id IS NOT NULL) AS unique_drivers,
    avgStateIf(fare_amount, fare_amount IS NOT NULL)      AS avg_fare,
    avgStateIf(duration_s, duration_s IS NOT NULL)        AS avg_duration_s
FROM nav.nav_trip_events
GROUP BY city_id, day, event_type;

-- -------------------------------------------------------------------------
-- MV 3: Hourly surge multiplier summary per city
-- Target: nav.nav_surge_hourly_agg
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nav.nav_surge_hourly_agg
(
    city_id         LowCardinality(String) NOT NULL,
    hour            DateTime        NOT NULL,
    avg_multiplier  AggregateFunction(avg, Float32),
    max_multiplier  AggregateFunction(max, Float32),
    zones_surged    AggregateFunction(uniqCombined, String)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (city_id, hour)
TTL hour + INTERVAL 730 DAY DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS nav.mv_surge_hourly
TO nav.nav_surge_hourly_agg
AS
SELECT
    city_id,
    toStartOfHour(captured_at)  AS hour,
    avgState(multiplier)        AS avg_multiplier,
    maxState(multiplier)        AS max_multiplier,
    uniqCombinedState(zone_id)  AS zones_surged
FROM nav.nav_surge_history
WHERE multiplier > 1.0
GROUP BY city_id, hour;

-- -------------------------------------------------------------------------
-- MV 4: Daily search query frequency (top queries)
-- Target: nav.nav_search_daily_queries
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nav.nav_search_daily_queries
(
    day             Date            NOT NULL,
    query_type      LowCardinality(String) NOT NULL,
    provider        LowCardinality(String) NOT NULL,
    search_count    AggregateFunction(count, UInt64),
    ctr             AggregateFunction(avg, UInt8),   -- click-through rate
    avg_latency_ms  AggregateFunction(avg, UInt32)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (day, query_type, provider)
TTL day + INTERVAL 365 DAY DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS nav.mv_search_daily
TO nav.nav_search_daily_queries
AS
SELECT
    toDate(event_time)                          AS day,
    query_type,
    provider,
    countState()                                AS search_count,
    avgState(if(selected_rank IS NOT NULL, toUInt8(1), toUInt8(0))) AS ctr,
    avgState(latency_ms)                        AS avg_latency_ms
FROM nav.nav_search_analytics
GROUP BY day, query_type, provider;
