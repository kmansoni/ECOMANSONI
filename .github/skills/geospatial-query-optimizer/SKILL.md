# Geospatial Query Optimizer

## Описание

Работа с геоданными в PostgreSQL через PostGIS: geography-типы, пространственные индексы, кластеризация на карте.

## Когда использовать

- Такси — поиск ближайших водителей
- Недвижимость — объекты в радиусе
- Знакомства — люди поблизости
- Маркетплейс — ближайшие магазины / пункты выдачи
- Любой "найти рядом" функционал

## Настройка PostGIS

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE drivers ADD COLUMN location geography(POINT, 4326);
CREATE INDEX idx_drivers_location ON drivers USING GIST (location);
```

## Основные запросы

### Поиск в радиусе

```sql
-- Водители в 3 км от точки
SELECT id, name,
  ST_Distance(location, ST_MakePoint(37.6173, 55.7558)::geography) AS distance_m
FROM drivers
WHERE ST_DWithin(
  location,
  ST_MakePoint(37.6173, 55.7558)::geography,
  3000  -- метры
)
AND is_available = true
ORDER BY distance_m
LIMIT 10;
```

### K ближайших соседей (KNN)

```sql
-- 5 ближайших водителей (использует GiST index)
SELECT id, name,
  location <-> ST_MakePoint(37.6173, 55.7558)::geography AS dist
FROM drivers
WHERE is_available = true
ORDER BY location <-> ST_MakePoint(37.6173, 55.7558)::geography
LIMIT 5;
```

### Объекты в bbox (для карты)

```sql
SELECT id, title, ST_AsGeoJSON(location)::jsonb AS geojson
FROM real_estate
WHERE location && ST_MakeEnvelope(37.5, 55.7, 37.7, 55.8, 4326)::geography
LIMIT 100;
```

## Кластеризация маркеров

```sql
-- Серверная кластеризация для карты
SELECT
  ST_AsGeoJSON(ST_Centroid(ST_Collect(location::geometry)))::jsonb AS center,
  count(*) AS point_count,
  array_agg(id) AS ids
FROM real_estate
WHERE location && ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography
GROUP BY ST_SnapToGrid(location::geometry, 0.01)  -- размер ячейки
HAVING count(*) > 1;
```

## Supabase RPC

```sql
CREATE OR REPLACE FUNCTION find_nearby_drivers(
  lat double precision,
  lng double precision,
  radius_m int DEFAULT 3000,
  max_results int DEFAULT 10
)
RETURNS TABLE(id uuid, name text, distance_m double precision)
LANGUAGE sql STABLE
AS $$
  SELECT d.id, d.name,
    ST_Distance(d.location, ST_MakePoint(lng, lat)::geography) AS distance_m
  FROM drivers d
  WHERE ST_DWithin(d.location, ST_MakePoint(lng, lat)::geography, radius_m)
    AND d.is_available = true
  ORDER BY distance_m
  LIMIT max_results;
$$;
```

## Чеклист

1. **geography не geometry** — geography считает в метрах по сфере, geometry — в градусах
2. **GiST индекс** — обязателен для ST_DWithin и KNN
3. **SRID 4326** — стандарт GPS координат (WGS84)
4. **Порядок** — `ST_MakePoint(longitude, latitude)`, НЕ наоборот
5. **Limit** — всегда ограничивать, особенно в плотных зонах
6. **Обновление** — location водителей обновлять через upsert, не insert

## Performance

- `ST_DWithin` использует индекс, `ST_Distance < X` — нет
- KNN оператор `<->` работает только с `ORDER BY ... LIMIT`
- Для движущихся объектов — batch update раз в 5-10 секунд
- bbox-запрос (`&&`) быстрее `ST_DWithin` для карточного вида

## Anti-patterns

- `ST_Distance(...) < 3000` вместо `ST_DWithin(..., 3000)` — не использует индекс
- geometry вместо geography — расстояния в градусах, не метрах
- `ST_MakePoint(lat, lng)` — перепутаны координаты (должно быть lng, lat)
- Обновление location каждую секунду для 10K водителей — deadlocks
- Кластеризация на клиенте для 50K точек — зависание браузера
- Отсутствие GiST индекса — каждый запрос = sequential scan
