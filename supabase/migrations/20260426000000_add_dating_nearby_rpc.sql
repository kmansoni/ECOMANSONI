-- =============================================================================
-- Dating Nearby — PostGIS-based discovery for dating profiles
-- =============================================================================
-- Использует ту же инфраструктуру, что и people_nearby:
--  - user_locations (geography) для геопозиций
--  - RLS + SECURITY DEFINER RPC
--  - Фильтрация: возраст, пол, расстояние, блокировки, активность
-- =============================================================================

-- PostGIS уже установлен в people_nearby миграции, но IF NOT EXISTS для безопасности
CREATE EXTENSION IF NOT EXISTS postgis;
-- =============================================================================
-- RPC: find_dating_profiles_nearby
-- =============================================================================
-- Параметры:
--   p_user_id       — текущий user (auth.uid())
--   p_lat, p_lon    — координаты пользователя
--   p_radius_km     — максимальное расстояние (фильтр)
--   p_limit         — лимит возвращаемых анкет
--   p_min_age, p_max_age — возрастной диапазон
--   p_gender        — предпочтение по полу (NULL = все)
--
-- Возвращает:
--   id, user_id, bio, photos, age, gender, interests, looking_for,
--   display_name, avatar_url, distance_km
--
-- Фильтры:
--   - dating_profiles.is_active = true
--   - user_locations.is_visible = true AND не истекло
--   - age BETWEEN p_min_age AND p_max_age
--   - gender = p_gender (если p_gender не NULL)
--   - НЕ заблокирован (user_blocks)
--   - ST_DWithin(geography, radius)
--   - Исключает самого себя
-- =============================================================================

CREATE OR REPLACE FUNCTION public.find_dating_profiles_nearby(
    p_user_id       uuid,
    p_lat           double precision,
    p_lon           double precision,
    p_radius_km     integer DEFAULT 50,
    p_limit         integer DEFAULT 50,
    p_min_age       integer DEFAULT 18,
    p_max_age       integer DEFAULT 100,
    p_gender        text DEFAULT NULL
)
RETURNS TABLE (
    id              uuid,
    user_id         uuid,
    bio             text,
    photos          jsonb,
    age             integer,
    gender          text,
    interests       text[],
    looking_for     text[],
    display_name    text,
    avatar_url      text,
    distance_km     double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_point         geography;
    v_radius_meters integer := p_radius_km * 1000;
BEGIN
    -- Validate coordinates
    IF p_lat < -90 OR p_lat > 90 OR p_lon < -180 OR p_lon > 180 THEN
        RAISE EXCEPTION 'Invalid coordinates: lat=%, lon=%', p_lat, p_lon;
    END IF;

    -- Cap radius to 200 km to prevent heavy scans
    IF p_radius_km > 200 THEN
        p_radius_km := 200;
        v_radius_meters := p_radius_km * 1000;
    END IF;

    -- Cap limit
    IF p_limit > 100 THEN
        p_limit := 100;
    END IF;

    v_point := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography;

    RETURN QUERY
    SELECT
        dp.id,
        dp.user_id,
        dp.bio,
        dp.photos,
        dp.age,
        dp.gender,
        dp.interests,
        dp.looking_for,
        p.display_name,
        p.avatar_url,
        ROUND((ST_Distance(ul.location, v_point) / 1000)::numeric, 2) AS distance_km
    FROM public.dating_profiles dp
    JOIN public.user_locations ul ON ul.user_id = dp.user_id
    JOIN public.profiles p ON p.user_id = dp.user_id
    WHERE
        dp.is_active = true
        AND ul.is_visible = true
        AND (ul.expires_at IS NULL OR ul.expires_at > now())
        AND dp.user_id <> p_user_id
        AND dp.age BETWEEN p_min_age AND p_max_age
        AND (p_gender IS NULL OR dp.gender = p_gender)
        AND NOT EXISTS (
            SELECT 1 FROM public.user_blocks ub
            WHERE (ub.blocker_id = p_user_id AND ub.blocked_id = dp.user_id)
               OR (ub.blocker_id = dp.user_id AND ub.blocked_id = p_user_id)
        )
        AND ST_DWithin(ul.location, v_point, v_radius_meters)
    ORDER BY distance_km ASC
    LIMIT p_limit;
END;
$$;
-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.find_dating_profiles_nearby(
    uuid, double precision, double precision, integer, integer, integer, integer, text
) TO authenticated;
-- =============================================================================
-- Indexes for performance (if not already present)
-- =============================================================================
-- On dating_profiles for active + age + gender filters
CREATE INDEX IF NOT EXISTS idx_dating_profiles_active_age_gender
    ON public.dating_profiles(is_active, age, gender)
    WHERE is_active = true;
-- Composite index for the join: user_id is already PK, but also we join on is_active
-- Already covered by idx_dating_profiles_active (is_active, last_active DESC) but we may want separate. Not urgent.

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON FUNCTION public.find_dating_profiles_nearby IS 'Находит анеты знакомств поблизости с PostGIS. Возвращает профили с расстоянием в км.';
