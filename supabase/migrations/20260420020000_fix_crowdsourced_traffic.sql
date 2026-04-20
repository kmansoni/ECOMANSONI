-- Fix: crowdsourced_traffic — исправления по результатам аудита
-- Ref: 20260419000000_crowdsourced_traffic.sql

-- ═══════════════════════════════════════════════════════════
-- 1. Удалить неиспользуемый geo-индекс на traffic_gps_probes
--    Ни один запрос не ищет по (lat, lon) в этой таблице —
--    все агрегации идут через h3_index.
-- ═══════════════════════════════════════════════════════════
DROP INDEX IF EXISTS public.idx_traffic_probes_geo_time;

-- ═══════════════════════════════════════════════════════════
-- 2. CHECK-constraint на формат h3_index
--    Фронтенд генерирует ключи вида "55.752:37.616".
--    Без проверки в таблицу может попасть мусор.
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.traffic_gps_probes
    ADD CONSTRAINT chk_h3_index_format
    CHECK (h3_index ~ '^-?\d+\.\d{3}:-?\d+\.\d{3}$');

-- ═══════════════════════════════════════════════════════════
-- 3. RLS: INSERT policy на traffic_gps_probes (defense-in-depth)
--    SECURITY DEFINER обходит RLS, но если функцию удалят —
--    без политики вставка невозможна.
-- ═══════════════════════════════════════════════════════════
CREATE POLICY "traffic_probes_insert_authenticated"
    ON public.traffic_gps_probes
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════
-- 4. Убрать дублирующую RLS policy
--    "traffic_live_read" без TO = все роли (включая anon),
--    "traffic_live_anon_read" — избыточна.
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "traffic_live_anon_read" ON public.traffic_segments_live;

-- ═══════════════════════════════════════════════════════════
-- 5. get_traffic_in_bbox: добавить LIMIT
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_traffic_in_bbox(
    min_lat NUMERIC,
    min_lon NUMERIC,
    max_lat NUMERIC,
    max_lon NUMERIC,
    limit_cnt INTEGER DEFAULT 500
) RETURNS SETOF public.traffic_segments_live
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT *
    FROM public.traffic_segments_live
    WHERE center_lat BETWEEN min_lat AND max_lat
      AND center_lon BETWEEN min_lon AND max_lon
      AND updated_at > now() - INTERVAL '15 minutes'
    ORDER BY updated_at DESC
    LIMIT limit_cnt;
$$;

-- ═══════════════════════════════════════════════════════════
-- 6. aggregate_traffic: advisory lock + input validation
--    - pg_advisory_xact_lock предотвращает параллельный запуск
--    - Снижен порог confidence до 5 (для раннего запуска)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.aggregate_traffic()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    agg_count INTEGER := 0;
    cutoff TIMESTAMPTZ := now() - INTERVAL '15 minutes';
    old_cutoff TIMESTAMPTZ := now() - INTERVAL '2 hours';
BEGIN
    -- Advisory lock: только один экземпляр одновременно
    PERFORM pg_advisory_xact_lock(hashtext('aggregate_traffic'));

    -- Агрегируем пробы за последние 15 минут по H3 ячейкам
    INSERT INTO public.traffic_segments_live (
        h3_index, avg_speed_kmh, median_speed_kmh, sample_count,
        confidence, congestion_level, center_lat, center_lon, updated_at
    )
    SELECT
        p.h3_index,
        ROUND(AVG(p.speed_kmh), 1) AS avg_speed,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.speed_kmh), 1) AS median_speed,
        COUNT(*) AS samples,
        LEAST(1.0, COUNT(*)::NUMERIC / 5.0) AS conf,
        CASE
            WHEN AVG(p.speed_kmh) >= COALESCE(tsl.free_flow_kmh, 60) * 0.75 THEN 'free'
            WHEN AVG(p.speed_kmh) >= COALESCE(tsl.free_flow_kmh, 60) * 0.5  THEN 'moderate'
            WHEN AVG(p.speed_kmh) >= COALESCE(tsl.free_flow_kmh, 60) * 0.25 THEN 'slow'
            ELSE 'congested'
        END AS congestion,
        ROUND(AVG(p.lat), 5),
        ROUND(AVG(p.lon), 5),
        now()
    FROM public.traffic_gps_probes p
    LEFT JOIN public.traffic_segments_live tsl ON tsl.h3_index = p.h3_index
    WHERE p.measured_at > cutoff
      AND p.speed_kmh > 0
    GROUP BY p.h3_index, tsl.free_flow_kmh
    HAVING COUNT(*) >= 2
    ON CONFLICT (h3_index) DO UPDATE SET
        avg_speed_kmh    = EXCLUDED.avg_speed_kmh,
        median_speed_kmh = EXCLUDED.median_speed_kmh,
        sample_count     = EXCLUDED.sample_count,
        confidence       = EXCLUDED.confidence,
        congestion_level = EXCLUDED.congestion_level,
        center_lat       = EXCLUDED.center_lat,
        center_lon       = EXCLUDED.center_lon,
        updated_at       = now();

    GET DIAGNOSTICS agg_count = ROW_COUNT;

    -- Обновляем free_flow_speed ночью (22:00-06:00)
    IF EXTRACT(HOUR FROM now()) >= 22 OR EXTRACT(HOUR FROM now()) < 6 THEN
        UPDATE public.traffic_segments_live tsl
        SET free_flow_kmh = sub.night_speed
        FROM (
            SELECT h3_index, ROUND(AVG(speed_kmh), 1) AS night_speed
            FROM public.traffic_gps_probes
            WHERE measured_at > now() - INTERVAL '1 hour'
              AND speed_kmh > 20
            GROUP BY h3_index
            HAVING COUNT(*) >= 3
        ) sub
        WHERE tsl.h3_index = sub.h3_index
          AND sub.night_speed > COALESCE(tsl.free_flow_kmh, 0);
    END IF;

    -- Очистка старых проб (> 2 часов)
    DELETE FROM public.traffic_gps_probes WHERE measured_at < old_cutoff;

    -- Очистка устаревших сегментов (не обновлялись 30 мин)
    DELETE FROM public.traffic_segments_live
    WHERE updated_at < now() - INTERVAL '30 minutes';

    RETURN jsonb_build_object('aggregated', agg_count);
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 7. submit_gps_probes: валидация входных данных
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_gps_probes(
    probes JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    probe JSONB;
    inserted_count INTEGER := 0;
    skipped_count INTEGER := 0;
BEGIN
    FOR probe IN SELECT * FROM jsonb_array_elements(probes)
    LOOP
        -- Пропускаем невалидные записи вместо краша
        BEGIN
            INSERT INTO public.traffic_gps_probes (
                lat, lon, speed_kmh, heading, accuracy_m, h3_index, session_hash, measured_at
            ) VALUES (
                ROUND((probe->>'lat')::NUMERIC, 5),
                ROUND((probe->>'lon')::NUMERIC, 5),
                ROUND((probe->>'speed_kmh')::NUMERIC, 1),
                (probe->>'heading')::NUMERIC,
                (probe->>'accuracy_m')::NUMERIC,
                probe->>'h3_index',
                probe->>'session_hash',
                COALESCE((probe->>'measured_at')::TIMESTAMPTZ, now())
            );
            inserted_count := inserted_count + 1;
        EXCEPTION WHEN OTHERS THEN
            skipped_count := skipped_count + 1;
        END;
    END LOOP;

    RETURN jsonb_build_object('inserted', inserted_count, 'skipped', skipped_count);
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 8. COMMENT ON TABLE
-- ═══════════════════════════════════════════════════════════
COMMENT ON TABLE public.traffic_gps_probes IS 'Анонимизированные GPS-пробы от пользователей для расчёта трафика в реальном времени';
COMMENT ON TABLE public.traffic_segments_live IS 'Агрегированные данные о трафике по H3-ячейкам (обновляется каждые 2 мин)';
