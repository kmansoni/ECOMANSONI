-- =============================================================================
-- ECOMANSONI Navigation Platform — PostgreSQL функции
-- Миграция: 20260307000007_navigation_functions.sql
-- Зависимости: 20260307000006_navigation_search_tables.sql
-- =============================================================================

-- =============================================================================
-- 1. nav_nearby_pois — поиск POI в радиусе с опциональной фильтрацией по категории
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nav_nearby_pois(
    p_lat       FLOAT8,
    p_lng       FLOAT8,
    p_radius_m  INTEGER DEFAULT 1000,
    p_category  TEXT    DEFAULT NULL,
    p_limit     INTEGER DEFAULT 20
)
RETURNS TABLE (
    id          UUID,
    name        TEXT,
    category    TEXT,
    subcategory TEXT,
    lat         FLOAT8,
    lng         FLOAT8,
    distance_m  FLOAT8,
    rating      NUMERIC,
    review_count INTEGER,
    address     TEXT,
    h3_index_r9 TEXT,
    is_verified BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        p.id,
        p.name,
        p.category,
        p.subcategory,
        ST_Y(p.location::geometry)                          AS lat,
        ST_X(p.location::geometry)                          AS lng,
        ST_Distance(
            p.location::geography,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        )                                                    AS distance_m,
        p.rating,
        p.review_count,
        p.address,
        p.h3_index_r9,
        p.is_verified
    FROM public.nav_pois p
    WHERE
        ST_DWithin(
            p.location::geography,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
            p_radius_m
        )
        AND (p_category IS NULL OR p.category = p_category)
    ORDER BY distance_m ASC
    LIMIT LEAST(p_limit, 200);  -- защита от DoS: не более 200 результатов
$$;

COMMENT ON FUNCTION public.nav_nearby_pois IS
    'Поиск POI в радиусе p_radius_m метров от (p_lat, p_lng). '
    'p_category — опциональный фильтр. Лимит результатов не более 200.';

-- Права: authenticated вызывают через API
GRANT EXECUTE ON FUNCTION public.nav_nearby_pois TO authenticated;

-- =============================================================================
-- 2. nav_nearby_drivers — поиск активных верифицированных водителей в радиусе
--    SECURITY: только service_role (dispatch engine); клиент не должен видеть позиции
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nav_nearby_drivers(
    p_lat           FLOAT8,
    p_lng           FLOAT8,
    p_radius_m      INTEGER DEFAULT 5000,
    p_vehicle_class TEXT    DEFAULT NULL,
    p_limit         INTEGER DEFAULT 50
)
RETURNS TABLE (
    driver_id     UUID,
    vehicle_type  TEXT,
    vehicle_class TEXT,
    rating        NUMERIC,
    total_trips   INTEGER,
    acceptance_rate NUMERIC,
    lat           FLOAT8,
    lng           FLOAT8,
    distance_m    FLOAT8,
    last_seen_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        lh.actor_id                                     AS driver_id,
        dp.vehicle_type,
        dp.vehicle_class,
        dp.rating,
        dp.total_trips,
        dp.acceptance_rate,
        ST_Y(lh.location::geometry)                    AS lat,
        ST_X(lh.location::geometry)                    AS lng,
        ST_Distance(
            lh.location::geography,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        )                                               AS distance_m,
        lh.recorded_at                                  AS last_seen_at
    FROM (
        -- Последняя известная позиция каждого водителя за последние 5 минут
        SELECT DISTINCT ON (actor_id)
            actor_id, location, recorded_at
        FROM public.nav_location_history
        WHERE
            actor_type = 'driver'
            AND recorded_at > now() - INTERVAL '5 minutes'
        ORDER BY actor_id, recorded_at DESC
    ) lh
    JOIN public.nav_driver_profiles dp ON dp.id = lh.actor_id
    WHERE
        dp.is_active   = true
        AND dp.is_verified = true
        AND ST_DWithin(
            lh.location::geography,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
            p_radius_m
        )
        AND (p_vehicle_class IS NULL OR dp.vehicle_class = p_vehicle_class)
    ORDER BY distance_m ASC
    LIMIT LEAST(p_limit, 500);
$$;

COMMENT ON FUNCTION public.nav_nearby_drivers IS
    'Поиск активных верифицированных водителей. '
    'Только для service_role — данные позиций конфиденциальны.';

-- Только service_role вызывает эту функцию
REVOKE EXECUTE ON FUNCTION public.nav_nearby_drivers FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.nav_nearby_drivers FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.nav_nearby_drivers TO service_role;

-- =============================================================================
-- 3. nav_update_reporter_reputation — пересчёт репутации контрибьютора
--    Вызывается триггером или планировщиком после изменения голосов/статусов
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nav_update_reporter_reputation(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total     INTEGER;
    v_verified  INTEGER;
    v_rejected  INTEGER;
    v_upvotes   BIGINT;
    v_downvotes BIGINT;
    v_trust     NUMERIC(5,4);
    v_xp        INTEGER;
    v_level     INTEGER;
BEGIN
    -- Подсчёт статистики репортов
    SELECT
        COUNT(*)                                               AS total,
        COUNT(*) FILTER (WHERE status IN ('verified','active')) AS verified,
        COUNT(*) FILTER (WHERE status = 'rejected')            AS rejected,
        COALESCE(SUM(upvotes), 0)                              AS upvotes,
        COALESCE(SUM(downvotes), 0)                            AS downvotes
    INTO v_total, v_verified, v_rejected, v_upvotes, v_downvotes
    FROM public.nav_crowdsource_reports
    WHERE reporter_id = p_user_id;

    -- Trust score: взвешенная формула
    -- Базис: доля верифицированных репортов
    -- Штраф: за rejected и downvotes
    v_trust := CASE
        WHEN v_total = 0 THEN 0.5   -- новый пользователь
        ELSE GREATEST(0, LEAST(1,
            (v_verified::NUMERIC / v_total) * 0.7
            + (v_upvotes::NUMERIC / GREATEST(v_upvotes + v_downvotes, 1)) * 0.2
            + 0.1   -- базовые 10% для нового пользователя
            - (v_rejected::NUMERIC / v_total) * 0.3
        ))
    END;

    -- XP: 10 за репорт, 25 бонус за верифицированный, -5 за отклонённый
    v_xp := GREATEST(0,
        v_total    * 10
        + v_verified  * 25
        - v_rejected  * 5
        + v_upvotes   * 2
    );

    -- Уровень: логарифмическая шкала (каждый уровень требует больше XP)
    -- level = floor(1 + log2(xp/100 + 1)), cap = 100
    v_level := LEAST(100, GREATEST(1,
        FLOOR(1 + LOG(2, v_xp::NUMERIC / 100.0 + 1))::INTEGER
    ));

    -- Upsert репутации
    INSERT INTO public.nav_reporter_reputation (
        user_id, total_reports, verified_reports, rejected_reports,
        trust_score, xp, level, updated_at
    )
    VALUES (
        p_user_id, v_total, v_verified, v_rejected,
        v_trust, v_xp, v_level, now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        total_reports    = EXCLUDED.total_reports,
        verified_reports = EXCLUDED.verified_reports,
        rejected_reports = EXCLUDED.rejected_reports,
        trust_score      = EXCLUDED.trust_score,
        xp               = EXCLUDED.xp,
        level            = EXCLUDED.level,
        updated_at       = EXCLUDED.updated_at;
END;
$$;

COMMENT ON FUNCTION public.nav_update_reporter_reputation IS
    'Атомарный пересчёт trust_score, XP и level по всей истории репортов пользователя. '
    'Идемпотентна — безопасно вызывать повторно.';

REVOKE EXECUTE ON FUNCTION public.nav_update_reporter_reputation FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.nav_update_reporter_reputation TO service_role;

-- =============================================================================
-- 4. nav_expire_reports — деактивация просроченных репортов
--    Вызывается планировщиком (pg_cron) каждые 5 минут
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nav_expire_reports()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expired_count INTEGER;
BEGIN
    WITH expired AS (
        UPDATE public.nav_crowdsource_reports
        SET
            status     = 'expired',
            updated_at = now()
        WHERE
            status     IN ('submitted','verified','active')
            AND expires_at IS NOT NULL
            AND expires_at < now()
        RETURNING id
    )
    SELECT COUNT(*) INTO v_expired_count FROM expired;

    RETURN v_expired_count;
END;
$$;

COMMENT ON FUNCTION public.nav_expire_reports IS
    'Batch-деактивация просроченных репортов. Возвращает количество обновлённых записей. '
    'Вызывать через pg_cron каждые 5 минут.';

REVOKE EXECUTE ON FUNCTION public.nav_expire_reports FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.nav_expire_reports TO service_role;

-- =============================================================================
-- 5. nav_calculate_h3_index — вычисление H3 индекса (интеграционная заглушка)
--    РЕАЛЬНАЯ реализация: H3 не имеет native PostgreSQL extension в Supabase.
--    Вычисление происходит в application layer (TypeScript/Python через h3-js/h3-py).
--    Эта функция принимает заранее вычисленное приложением значение и валидирует формат.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nav_calculate_h3_index(
    p_lat        FLOAT8,
    p_lng        FLOAT8,
    p_resolution INTEGER DEFAULT 9
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Валидация входных параметров
    IF p_lat < -90 OR p_lat > 90 THEN
        RAISE EXCEPTION 'Широта вне диапазона [-90, 90]: %', p_lat;
    END IF;
    IF p_lng < -180 OR p_lng > 180 THEN
        RAISE EXCEPTION 'Долгота вне диапазона [-180, 180]: %', p_lng;
    END IF;
    IF p_resolution < 0 OR p_resolution > 15 THEN
        RAISE EXCEPTION 'H3 resolution вне диапазона [0, 15]: %', p_resolution;
    END IF;

    -- ПРИМЕЧАНИЕ: Реальное вычисление H3 индекса должно выполняться в application layer.
    -- Здесь возвращаем NULL как сигнал для приложения вычислить индекс самостоятельно.
    -- При наличии h3-pg расширения (не доступно в Supabase cloud) реализация:
    -- RETURN h3_lat_lng_to_cell(POINT(p_lng, p_lat), p_resolution)::TEXT;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.nav_calculate_h3_index IS
    'Заглушка-валидатор координат. РЕАЛЬНЫЙ H3 индекс вычисляется в application layer '
    '(TypeScript: h3-js, Python: h3-py) и передаётся в БД через h3_index_r9 колонки.';

GRANT EXECUTE ON FUNCTION public.nav_calculate_h3_index TO authenticated;
GRANT EXECUTE ON FUNCTION public.nav_calculate_h3_index TO service_role;

-- =============================================================================
-- 6. nav_trip_state_transition — FSM для смены статуса поездки с проверками
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nav_trip_state_transition(
    p_trip_id   UUID,
    p_new_status TEXT,
    p_actor_id  UUID DEFAULT NULL   -- NULL = system/service_role
)
RETURNS TABLE (
    success     BOOLEAN,
    old_status  TEXT,
    new_status  TEXT,
    error_code  TEXT,
    error_msg   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_trip         public.nav_trips%ROWTYPE;
    v_allowed      TEXT[];
    v_ts_column    TEXT;
BEGIN
    -- Блокировка строки для предотвращения race condition (NOWAIT = немедленный fail)
    BEGIN
        SELECT * INTO v_trip
        FROM public.nav_trips
        WHERE id = p_trip_id
        FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
        RETURN QUERY SELECT false, NULL::TEXT, p_new_status, 'LOCK_TIMEOUT', 'Поездка заблокирована другим процессом';
        RETURN;
    END;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::TEXT, p_new_status, 'NOT_FOUND', 'Поездка не найдена';
        RETURN;
    END IF;

    -- Определение допустимых переходов (FSM transition table)
    v_allowed := CASE v_trip.status
        WHEN 'requested'        THEN ARRAY['searching', 'cancelled']
        WHEN 'searching'        THEN ARRAY['driver_assigned', 'cancelled']
        WHEN 'driver_assigned'  THEN ARRAY['driver_enroute', 'searching', 'cancelled']
        WHEN 'driver_enroute'   THEN ARRAY['driver_arrived', 'cancelled']
        WHEN 'driver_arrived'   THEN ARRAY['in_progress', 'cancelled']
        WHEN 'in_progress'      THEN ARRAY['completed', 'cancelled']
        WHEN 'completed'        THEN ARRAY[]::TEXT[]   -- терминальный статус
        WHEN 'cancelled'        THEN ARRAY[]::TEXT[]   -- терминальный статус
        ELSE ARRAY[]::TEXT[]
    END;

    -- Проверка допустимости перехода
    IF NOT (p_new_status = ANY(v_allowed)) THEN
        RETURN QUERY SELECT
            false,
            v_trip.status,
            p_new_status,
            'INVALID_TRANSITION'::TEXT,
            format('Переход %s → %s недопустим', v_trip.status, p_new_status);
        RETURN;
    END IF;

    -- Обновление временной метки FSM
    UPDATE public.nav_trips
    SET
        status            = p_new_status,
        assigned_at       = CASE WHEN p_new_status = 'driver_assigned' THEN now() ELSE assigned_at END,
        pickup_arrived_at = CASE WHEN p_new_status = 'driver_arrived'  THEN now() ELSE pickup_arrived_at END,
        started_at        = CASE WHEN p_new_status = 'in_progress'     THEN now() ELSE started_at END,
        completed_at      = CASE WHEN p_new_status = 'completed'       THEN now() ELSE completed_at END,
        cancelled_at      = CASE WHEN p_new_status = 'cancelled'       THEN now() ELSE cancelled_at END,
        updated_at        = now()
    WHERE id = p_trip_id;

    RETURN QUERY SELECT
        true,
        v_trip.status,
        p_new_status,
        NULL::TEXT,
        NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION public.nav_trip_state_transition IS
    'Атомарный FSM переход статуса поездки с FOR UPDATE NOWAIT (защита от race condition). '
    'Возвращает success=false при конкурентном изменении или недопустимом переходе.';

REVOKE EXECUTE ON FUNCTION public.nav_trip_state_transition FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.nav_trip_state_transition TO service_role;
