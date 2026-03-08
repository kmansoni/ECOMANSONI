-- =============================================================================
-- People Nearby — PostGIS-based geolocation discovery (opt-in)
-- =============================================================================
-- Приватность:
--  - is_visible = false по умолчанию — пользователь должен явно включить
--  - expires_at позволяет автоматически скрыть локацию через N часов
--  - RLS: пользователь видит только visible пользователей в радиусе (через функцию)
--    и только свою запись для UPDATE/DELETE
--  - find_people_nearby — SECURITY DEFINER для обхода прямого доступа к таблице
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. PostGIS extension
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- 2. user_locations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_locations (
  user_id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  location        geography(Point, 4326) NOT NULL,
  accuracy_meters real        NOT NULL DEFAULT 0,
  is_visible      boolean     NOT NULL DEFAULT false,
  last_updated    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz          -- null = не истекает
);

-- Spatial index для ST_DWithin queries
CREATE INDEX IF NOT EXISTS idx_user_locations_geog
  ON public.user_locations USING GIST(location);

-- Partial index для поиска только visible пользователей
CREATE INDEX IF NOT EXISTS idx_user_locations_visible
  ON public.user_locations(is_visible)
  WHERE is_visible = true;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- Читать свою запись всегда
DROP POLICY IF EXISTS "user_locations_select_own" ON public.user_locations;
CREATE POLICY "user_locations_select_own"
  ON public.user_locations FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: только себя
DROP POLICY IF EXISTS "user_locations_insert" ON public.user_locations;
CREATE POLICY "user_locations_insert"
  ON public.user_locations FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: только себя
DROP POLICY IF EXISTS "user_locations_update" ON public.user_locations;
CREATE POLICY "user_locations_update"
  ON public.user_locations FOR UPDATE
  USING (user_id = auth.uid());

-- DELETE: только себя
DROP POLICY IF EXISTS "user_locations_delete" ON public.user_locations;
CREATE POLICY "user_locations_delete"
  ON public.user_locations FOR DELETE
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. find_people_nearby — SECURITY DEFINER (обходит RLS для чтения видимых)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.find_people_nearby(
  p_user_id       uuid,
  p_lat           double precision,
  p_lon           double precision,
  p_radius_meters integer DEFAULT 5000,
  p_limit         integer DEFAULT 50
)
RETURNS TABLE(
  user_id          uuid,
  distance_meters  double precision,
  last_updated     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_point geography;
BEGIN
  -- Входная валидация координат
  IF p_lat < -90 OR p_lat > 90 OR p_lon < -180 OR p_lon > 180 THEN
    RAISE EXCEPTION 'Invalid coordinates: lat=%, lon=%', p_lat, p_lon;
  END IF;

  -- Ограничение радиуса: макс 50 км
  IF p_radius_meters > 50000 THEN
    p_radius_meters := 50000;
  END IF;

  -- Ограничение лимита
  IF p_limit > 200 THEN
    p_limit := 200;
  END IF;

  v_point := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography;

  RETURN QUERY
  SELECT
    ul.user_id,
    ST_Distance(ul.location, v_point)::double precision AS distance_meters,
    ul.last_updated
  FROM public.user_locations ul
  WHERE
    ul.is_visible = true
    AND ul.user_id <> p_user_id
    -- Не показывать истёкшие локации
    AND (ul.expires_at IS NULL OR ul.expires_at > now())
    -- Пространственный фильтр (использует GiST-индекс)
    AND ST_DWithin(ul.location, v_point, p_radius_meters)
    -- Не показывать заблокированных пользователей
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks ub
      WHERE (ub.blocker_id = p_user_id AND ub.blocked_id = ul.user_id)
         OR (ub.blocker_id = ul.user_id AND ub.blocked_id = p_user_id)
    )
  ORDER BY distance_meters ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_people_nearby(uuid, double precision, double precision, integer, integer)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Rate limiting helper: update_my_location
--    Проверяет cooldown 30 секунд между обновлениями
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_my_location(
  p_lat           double precision,
  p_lon           double precision,
  p_accuracy      real DEFAULT 0,
  p_visible       boolean DEFAULT true,
  p_expires_hours integer DEFAULT NULL  -- null = не истекает
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_updated timestamptz;
  v_expires_at   timestamptz;
BEGIN
  -- Rate limit: 30 секунд между обновлениями
  SELECT last_updated INTO v_last_updated
  FROM public.user_locations
  WHERE user_id = auth.uid();

  IF v_last_updated IS NOT NULL AND now() - v_last_updated < interval '30 seconds' THEN
    RAISE EXCEPTION 'Rate limit: wait % seconds before updating location',
      EXTRACT(EPOCH FROM (interval '30 seconds' - (now() - v_last_updated)))::integer;
  END IF;

  IF p_lat < -90 OR p_lat > 90 OR p_lon < -180 OR p_lon > 180 THEN
    RAISE EXCEPTION 'Invalid coordinates';
  END IF;

  IF p_expires_hours IS NOT NULL THEN
    v_expires_at := now() + (p_expires_hours || ' hours')::interval;
  END IF;

  INSERT INTO public.user_locations (user_id, location, accuracy_meters, is_visible, last_updated, expires_at)
  VALUES (
    auth.uid(),
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
    p_accuracy,
    p_visible,
    now(),
    v_expires_at
  )
  ON CONFLICT (user_id) DO UPDATE SET
    location        = EXCLUDED.location,
    accuracy_meters = EXCLUDED.accuracy_meters,
    is_visible      = EXCLUDED.is_visible,
    last_updated    = EXCLUDED.last_updated,
    expires_at      = EXCLUDED.expires_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_location(double precision, double precision, real, boolean, integer)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. hide_my_location
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hide_my_location()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_locations
  SET is_visible = false
  WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.hide_my_location() TO authenticated;
