-- Миграция: Crowdsourced GPS трафик от пользователей
-- Собираем анонимизированные GPS-пробы (скорость на сегментах дорог)
-- и агрегируем в реальном времени для отображения пробок.

-- ═══════════════════════════════════════════════════════════
-- 1. Таблица GPS-проб (основное хранилище)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.traffic_gps_probes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Геопозиция (анонимизирована: округлена до ~11м)
    lat            NUMERIC(8,5) NOT NULL,
    lon            NUMERIC(8,5) NOT NULL,
    -- Скорость и направление
    speed_kmh      NUMERIC(5,1) NOT NULL CHECK (speed_kmh >= 0 AND speed_kmh <= 300),
    heading        NUMERIC(5,1),
    accuracy_m     NUMERIC(6,1),
    -- H3 ячейка (resolution 9 ≈ 175м) для быстрой агрегации
    h3_index       TEXT NOT NULL,
    -- Анонимный идентификатор сессии (НЕ user_id)
    session_hash   TEXT NOT NULL,
    -- Время
    measured_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Партиционирование по дате для быстрой очистки старых данных
-- (в production нужно создать партиции, для MVP используем индексы)

-- Индексы для агрегации
CREATE INDEX IF NOT EXISTS idx_traffic_probes_h3_time 
    ON public.traffic_gps_probes (h3_index, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_probes_geo_time 
    ON public.traffic_gps_probes (lat, lon, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_probes_measured 
    ON public.traffic_gps_probes (measured_at DESC);

-- TTL: автоматическая очистка проб старше 2 часов
-- (cron job или pg_cron extension)

-- ═══════════════════════════════════════════════════════════
-- 2. Агрегированный трафик (обновляется каждые 2 минуты)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.traffic_segments_live (
    h3_index           TEXT PRIMARY KEY,
    -- Средняя скорость
    avg_speed_kmh      NUMERIC(5,1) NOT NULL,
    -- Медианная скорость (ближе к реальности)
    median_speed_kmh   NUMERIC(5,1),
    -- Свободная скорость (ночная/без пробок)
    free_flow_kmh      NUMERIC(5,1) DEFAULT 60,
    -- Уровень загрузки
    congestion_level   TEXT NOT NULL DEFAULT 'free' 
        CHECK (congestion_level IN ('free', 'moderate', 'slow', 'congested')),
    -- Сколько проб использовано
    sample_count       INTEGER NOT NULL DEFAULT 0,
    -- Достоверность (0.0 - 1.0)
    confidence         NUMERIC(3,2) NOT NULL DEFAULT 0,
    -- Центроид ячейки для отображения
    center_lat         NUMERIC(8,5),
    center_lon         NUMERIC(8,5),
    -- Время
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_traffic_live_congestion 
    ON public.traffic_segments_live (congestion_level) 
    WHERE congestion_level != 'free';
CREATE INDEX IF NOT EXISTS idx_traffic_live_geo 
    ON public.traffic_segments_live (center_lat, center_lon);

-- ═══════════════════════════════════════════════════════════
-- 3. RPC: Отправка батча GPS-проб
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
BEGIN
    FOR probe IN SELECT * FROM jsonb_array_elements(probes)
    LOOP
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
    END LOOP;

    RETURN jsonb_build_object('inserted', inserted_count);
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 4. RPC: Агрегация трафика (вызывается cron каждые 2 мин)
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
    -- Агрегируем пробы за последние 15 минут по H3 ячейкам
    INSERT INTO public.traffic_segments_live (
        h3_index, avg_speed_kmh, median_speed_kmh, sample_count, 
        confidence, congestion_level, center_lat, center_lon, updated_at
    )
    SELECT 
        h3_index,
        ROUND(AVG(speed_kmh), 1) AS avg_speed,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY speed_kmh), 1) AS median_speed,
        COUNT(*) AS samples,
        -- Достоверность: больше проб = выше доверие (макс при 10+)
        LEAST(1.0, COUNT(*)::NUMERIC / 10.0) AS conf,
        -- Уровень загрузки по соотношению к свободному потоку
        CASE
            WHEN AVG(speed_kmh) >= COALESCE(tsl.free_flow_kmh, 60) * 0.75 THEN 'free'
            WHEN AVG(speed_kmh) >= COALESCE(tsl.free_flow_kmh, 60) * 0.5  THEN 'moderate'
            WHEN AVG(speed_kmh) >= COALESCE(tsl.free_flow_kmh, 60) * 0.25 THEN 'slow'
            ELSE 'congested'
        END AS congestion,
        ROUND(AVG(lat), 5),
        ROUND(AVG(lon), 5),
        now()
    FROM public.traffic_gps_probes p
    LEFT JOIN public.traffic_segments_live tsl ON tsl.h3_index = p.h3_index
    WHERE p.measured_at > cutoff
      AND p.speed_kmh > 0  -- Исключаем стоящие автомобили (парковка)
    GROUP BY p.h3_index, tsl.free_flow_kmh
    HAVING COUNT(*) >= 2  -- Минимум 2 пробы для достоверности
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
              AND speed_kmh > 20  -- Отсеиваем медленный трафик
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
-- 5. RPC: Получить трафик в области (bbox)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_traffic_in_bbox(
    min_lat NUMERIC,
    min_lon NUMERIC, 
    max_lat NUMERIC,
    max_lon NUMERIC
) RETURNS SETOF public.traffic_segments_live
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT *
    FROM public.traffic_segments_live
    WHERE center_lat BETWEEN min_lat AND max_lat
      AND center_lon BETWEEN min_lon AND max_lon
      AND updated_at > now() - INTERVAL '15 minutes';
$$;

-- ═══════════════════════════════════════════════════════════
-- 6. RLS (Row Level Security)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.traffic_gps_probes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_segments_live ENABLE ROW LEVEL SECURITY;

-- GPS пробы: только вставка через RPC (SECURITY DEFINER)
-- Чтение трафика: все пользователи
CREATE POLICY "traffic_live_read" ON public.traffic_segments_live
    FOR SELECT USING (true);

-- Анонимные пользователи тоже могут читать трафик
CREATE POLICY "traffic_live_anon_read" ON public.traffic_segments_live
    FOR SELECT TO anon USING (true);
