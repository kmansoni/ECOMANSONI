-- =============================================================================
-- Mansoni Navigation Platform — Survey Scans (Crowdsourced Mapping)
-- Migration: 20260421050000_nav_survey_scans.sql
-- Description: Таблица для хранения сканов карты (фото/LiDAR) + обработка
-- Dependencies: 20260307000005_navigation_crowdsource_tables.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. nav_survey_scans — основная таблица сканирований
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_survey_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Тип сканирования
  scan_type TEXT NOT NULL CHECK (scan_type IN (
    'building',      -- здание (фасады, footprint)
    'road',          -- дорога (полоса, разметка)
    'bridge',        -- мост/эстакада
    'intersection',  -- перекрёсток
    'street_furniture', -- уличная мебель (столбы, знаки, скамейки)
    'area'           -- территория (парки, площадки)
  )),

  -- Массив URL фотографий (с media-server) или LiDAR-файлов
  images TEXT[] NOT NULL DEFAULT '{}',

  -- Метаданные съёмки (клиентские)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    metadata = {
      "capture_mode": "auto" | "manual" | "background",
      "device_model": "iPhone15,2",
      "os_version": "17.4",
      "camera_facing": "back",
      "photo_count": 120,
      "avg_gps_accuracy_m": 3.2,
      "track_length_m": 450,
      "duration_sec": 85,
      "capture_settings": {
        "keyframe_interval_m": 2.5,
        "min_overlap_pct": 70,
        "compression_quality": 85
      },
      "processing": {
        "method": "openmvg" | "lidar" | "arcoreslam",
        "point_count": 15420,
        "reprojection_error_px": 1.2,
        "compute_time_sec": 45
      }
    }
  */

  -- GPS-трек съёмки (LINESTRING of GPS points)
  track_linestring GEOMETRY(Linestring,4326),

  -- Вычисленные геометрии (после обработки)
  computed_dimensions JSONB,
  /*
    computed_dimensions = {
      "length_m": 14.23,
      "width_m": 3.47,
      "height_m": 2.81,
      "area_m2": 49.37,
      "volume_m3": 138.6,  // если есть высота
      "confidence": 0.87,  // [0-1]
      "method": "photogrammetry" | "lidar" | "ar_planes",
      "accuracy_estimate_m": 0.12
    }
  */
  footprint_geometry GEOMETRY(Polygon,4326),  -- RGB-геометрия объекта (2D)
  elevated_geometry GEOMETRY(Polygon,3857),   -- 3D экструзия (в метрах, для 3D-визуализации)

  -- Quality metrics
  quality_score NUMERIC(3,2) CHECK (quality_score BETWEEN 0 AND 1),  -- общий балл [0-1]
  completeness_pct INTEGER CHECK (completeness_pct BETWEEN 0 AND 100), -- % покрытия объекта
  validation_score NUMERIC(3,2),  -- score from community validation (0-1)

  -- Статус обработки
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN (
    'processing',     -- идёт обработка (Python worker)
    'ready',          -- обработан, ожидает валидации
    'proposed',       -- auto-created nav_map_edit (ожидает review)
    'approved',       -- edit approved (will be merged to OSM)
    'rejected',       -- low quality, rejected
    'failed'          -- ошибка обработки
  )),

  -- Привязка к nav_map_edits (если создан edit)
  source_edit_id UUID REFERENCES public.nav_map_edits(id) ON DELETE SET NULL,

  -- Вега-метки (для post-processing)
  h3_cell TEXT,  -- H3 hex (resolution 9 ~ 0.1 km²) для быстрого поиска
  tags JSONB DEFAULT '{}'::jsonb,  -- например: {"building":"yes","levels":5}

  -- Аудит
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  merged_at TIMESTAMPTZ
);

COMMENT ON TABLE public.nav_survey_scans IS 'Сканы карты от пользователей: фото/LiDAR → геометрия. Проходят обработку и валидацию перед merge в OSM.';
COMMENT ON COLUMN public.nav_survey_scans.metadata IS 'Метаданные съёмки: устройство, настройки, вычислительные параметры.';
COMMENT ON COLUMN public.nav_survey_scans.computed_dimensions IS 'Размеры объекта (length, width, height) + confidence от SfM/LiDAR пайплайна.';
COMMENT ON COLUMN public.nav_survey_scans.footprint_geometry IS '2D-контур объекта (выпуклый оболочка или traced polygon). WGS84.';
COMMENT ON COLUMN public.nav_survey_scans.elevated_geometry IS '3D экструзия (высотная часть) в проекции EPSG:3857 (метры). Используется для 3D-визуализации.';
COMMENT ON COLUMN public.nav_survey_scans.quality_score IS 'Общая оценка качества скана [0-1]: combine completeness, photo quality, GPS accuracy.';
COMMENT ON COLUMN public.nav_survey_scans.completeness_pct IS 'Процент покрытия объекта (сколько сторон снято: 0-100).';
COMMENT ON COLUMN public.nav_survey_scans.status IS 'Lifecycle: processing → ready → proposed → approved → merged.';
COMMENT ON COLUMN public.nav_survey_scans.h3_cell IS 'H3 cell index (resolution 9) для быстрого агрегирования покрытия.';

-- -----------------------------------------------------------------------------
-- 2. Индексы для быстрых запросов
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_nav_survey_scans_user_status
  ON public.nav_survey_scans(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nav_survey_scans_h3_cell
  ON public.nav_survey_scans(h3_cell) WHERE h3_cell IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nav_survey_scans_geom_footprint
  ON public.nav_survey_scans USING GIST(footprint_geometry) WHERE footprint_geometry IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nav_survey_scans_geom_elevated
  ON public.nav_survey_scans USING GIST(elevated_geometry) WHERE elevated_geometry IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nav_survey_scans_type_quality
  ON public.nav_survey_scans(scan_type, quality_score DESC) WHERE status = 'ready';

CREATE INDEX IF NOT EXISTS idx_nav_survey_scans_edit_source
  ON public.nav_survey_scans(source_edit_id) WHERE source_edit_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. RLS (Row Level Security)
-- -----------------------------------------------------------------------------
ALTER TABLE public.nav_survey_scans ENABLE ROW LEVEL SECURITY;

-- Политика 1: Пользователь видит свои сканы (все статусы)
CREATE POLICY "nav_survey_scans_select_own"
  ON public.nav_survey_scans FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Политика 2: Публичный доступ к готовым/принятым сканам (ready/approved)
CREATE POLICY "nav_survey_scans_select_public_ready"
  ON public.nav_survey_scans FOR SELECT
  TO authenticated
  USING (status IN ('ready', 'approved', 'merged'));

-- Политика 3: Пользователь может создавать свои сканы
CREATE POLICY "nav_survey_scans_insert_own"
  ON public.nav_survey_scans FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Политика 4: Пользователь может обновлять свои draft/processing сканы
CREATE POLICY "nav_survey_scans_update_own"
  ON public.nav_survey_scans FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status IN ('processing', 'ready'))
  WITH CHECK (user_id = auth.uid() AND status IN ('processing', 'ready'));

-- Политика 5: service_role — полный доступ (для workers и админов)
CREATE POLICY "nav_survey_scans_all_service_role"
  ON public.nav_survey_scans FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 4. Функция: Автоматическое создание nav_map_edits из готового scan
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_map_edit_from_scan(
  scan_id UUID,
  editor_id UUID DEFAULT auth.uid()
) RETURNS UUID AS $$
DECLARE
  scan RECORD;
  edit_type TEXT;
  new_edit_id UUID;
BEGIN
  -- Получаем scan
  SELECT * INTO scan FROM public.nav_survey_scans WHERE id = scan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scan % not found', scan_id;
  END IF;

  -- Проверяем статус и наличие геометрии
  IF scan.status != 'ready' OR scan.footprint_geometry IS NULL THEN
    RAISE EXCEPTION 'Scan % is not ready or missing geometry', scan_id;
  END IF;

  -- Определяем тип edit на основе scan_type
  edit_type := CASE scan.scan_type
    WHEN 'building' THEN 'building_add'
    WHEN 'road' THEN 'road_add'
    WHEN 'bridge' THEN 'bridge_add'
    WHEN 'intersection' THEN 'intersection_modify'
    WHEN 'street_furniture' THEN 'poi_add'
    WHEN 'area' THEN 'area_add'
    ELSE 'road_modify'
  END;

  -- Создаём edit
  INSERT INTO public.nav_map_edits (
    editor_id,
    edit_type,
    status,
    geometry_after,
    quality_score,
    tags_after,
    source_scan_id
  ) VALUES (
    editor_id,
    edit_type,
    'proposed',  -- await review
    scan.footprint_geometry,
    scan.quality_score,
    jsonb_build_object(
      'source', 'survey_scan',
      'scan_id', scan.id,
      'dimensions', scan.computed_dimensions,
      'completeness', scan.completeness_pct
    ),
    scan.id
  ) RETURNING id INTO new_edit_id;

  -- Обновляем scan: ссылка на edit + статус
  UPDATE public.nav_survey_scans
  SET source_edit_id = new_edit_id,
      status = 'proposed'
  WHERE id = scan_id;

  -- Начисляем временный XP (будет подтверждён после approve)
  PERFORM add_reputation_xp(editor_id, 'scan_proposed', 5);

  RETURN new_edit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_map_edit_from_scan(UUID, UUID) IS 'Автоматически создаёт nav_map_edits из обработанного scan. Вызывается worker-ом после successful processing.';

-- -----------------------------------------------------------------------------
-- 5. Триггер: Автоматический晋升 статуса при высоком качестве + нескольких сканах
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_approve_high_quality_scan()
RETURNS TRIGGER AS $$
DECLARE
  overlapping_count INTEGER;
BEGIN
  -- Только для ready scans с quality > 0.8
  IF NEW.status = 'ready' AND NEW.quality_score >= 0.8 THEN
    -- Ищем пересекающиеся сканы от других пользователей
    IF NEW.footprint_geometry IS NOT NULL THEN
      SELECT COUNT(*) INTO overlapping_count
      FROM public.nav_survey_scans s2
      WHERE s2.user_id != NEW.user_id
        AND s2.status IN ('ready', 'approved')
        AND s2.quality_score >= 0.7
        AND ST_Intersects(
          ST_Transform(NEW.footprint_geometry, 3857),
          ST_Transform(s2.footprint_geometry, 3857)
        ) AND ST_Area(ST_Intersection(
          ST_Transform(NEW.footprint_geometry, 3857),
          ST_Transform(s2.footprint_geometry, 3857)
        )) > (ST_Area(ST_Transform(NEW.footprint_geometry, 3857)) * 0.5); -- >50% overlap

      -- Если >=2 независимых скана подтверждают → auto-approve
      IF overlapping_count >= 2 THEN
        NEW.status = 'approved';
        NEW.merged_at = now();
        PERFORM add_reputation_xp(NEW.user_id, 'scan_auto_approved', 50);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер: после INSERT/UPDATE статуса
CREATE TRIGGER trg_auto_approve_scan
  BEFORE INSERT OR UPDATE OF status, quality_score, footprint_geometry
  ON public.nav_survey_scans
  FOR EACH ROW
  WHEN (NEW.status = 'ready')
  EXECUTE FUNCTION public.auto_approve_high_quality_scan();

-- -----------------------------------------------------------------------------
-- 6. Функция: Обновление H3-клетки (для быстрого агрегата покрытия)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_survey_h3_cell()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.footprint_geometry IS NOT NULL THEN
    -- Вычисляем центроид и H3 (resolution 9 ≈ 0.1 km²)
    NEW.h3_cell = h3_geo_to_h3(
      ST_X(ST_Centroid(NEW.footprint_geometry))::DOUBLE PRECISION,
      ST_Y(ST_Centroid(NEW.footprint_geometry))::DOUBLE PRECISION,
      9
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_h3_cell
  BEFORE INSERT OR UPDATE OF footprint_geometry
  ON public.nav_survey_scans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_survey_h3_cell();

-- -----------------------------------------------------------------------------
-- 7. Materialized View: Покрытие сканирований (для heatmap)
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS public.survey_coverage_heatmap AS
SELECT
  h3_cell,
  COUNT(*) as scan_count,
  AVG(quality_score) as avg_quality,
  MAX(completeness_pct) as max_completeness,
  ARRAY_AGG(DISTINCT user_id) as contributor_count,
  MAX(created_at) as last_scan_at
FROM public.nav_survey_scans
WHERE status IN ('ready', 'approved', 'merged')
  AND h3_cell IS NOT NULL
GROUP BY h3_cell;

CREATE INDEX IF NOT EXISTS idx_survey_coverage_heatmap_h3
  ON public.survey_coverage_heatmap USING HASH(h3_cell);

-- Refresh каждые 5 минут (для real-time-ish отображения)
-- Включается через pg_cron: SELECT cron.schedule('refresh-survey-heatmap', '*/5 * * * *', 'REFRESH MATERIALIZED VIEW survey_coverage_heatmap');

-- -----------------------------------------------------------------------------
-- 8. Функция: Получить соседние сканы для консенсуса (для auto-approve)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_neighboring_scans(
  p_scan_id UUID,
  p_radius_meters NUMERIC DEFAULT 50
) RETURNS TABLE (
  neighbor_id UUID,
  distance_m NUMERIC,
  overlap_area_m2 NUMERIC,
  quality_score NUMERIC
) AS $$
DECLARE
  v_geometry GEOMETRY;
BEGIN
  -- Получаем геометрию скана
  SELECT footprint_geometry INTO v_geometry
  FROM nav_survey_scans WHERE id = p_scan_id;

  IF v_geometry IS NULL THEN
    RETURN;
  END IF;

  -- Находим сканы в радиусе + с пересечением
  RETURN QUERY
  SELECT
    s.id AS neighbor_id,
    ST_Distance(
      ST_Transform(v_geometry, 3857),
      ST_Transform(s.footprint_geometry, 3857)
    )::NUMERIC as distance_m,
    ST_Area(
      ST_Intersection(
        ST_Transform(v_geometry, 3857),
        ST_Transform(s.footprint_geometry, 3857)
      )
    )::NUMERIC as overlap_area_m2,
    s.quality_score
  FROM public.nav_survey_scans s
  WHERE s.id != p_scan_id
    AND s.status IN ('ready', 'approved')
    AND s.footprint_geometry IS NOT NULL
    AND ST_DWithin(
      ST_Transform(v_geometry, 3857),
      ST_Transform(s.footprint_geometry, 3857),
      p_radius_meters
    )
  ORDER BY overlap_area_m2 DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_neighboring_scans(UUID, NUMERIC) IS 'Находит соседние сканы с пересекающейся геометрией для консенсуса и auto-merge.';

-- =============================================================================
-- КОНЕЦ МИГРАЦИИ
-- =============================================================================
