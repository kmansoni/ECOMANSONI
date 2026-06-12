# Навигационный модуль — Part 1: Core Engines

> **Версия:** 1.0  
> **Дата:** 2026-03-06  
> **Язык:** Русский  
> **Статус:** Draft  
> **Модуль:** Navigation Engine  
> **Часть:** 1 из 5  
> **Связанные документы:**  
> — [02-real-time-traffic.md](./02-real-time-traffic.md) — Part 2: Real-Time Traffic & Live Data  
> — [03-search-geocoding.md](./03-search-geocoding.md) — Part 3: Search, Geocoding & POI  
> — [04-offline-mobile.md](./04-offline-mobile.md) — Part 4: Offline Mode & Mobile SDK  
> — [05-infrastructure-ops.md](./05-infrastructure-ops.md) — Part 5: Infrastructure, Scaling & DevOps  
> — [taxi-aggregator/04-ideal-architecture.md](../taxi-aggregator/04-ideal-architecture.md) — Архитектура такси-агрегатора

---

## Содержание

1. [Раздел 1: Обзор системы](#раздел-1-обзор-системы)
   - 1.1 [Высокоуровневая архитектура](#11-высокоуровневая-архитектура)
   - 1.2 [Список подсистем](#12-список-подсистем)
   - 1.3 [Граф зависимостей](#13-граф-зависимостей)
   - 1.4 [Целевые SLA/SLO](#14-целевые-slaslo)
2. [Раздел 2: Map Data Engine](#раздел-2-map-data-engine)
   - 2.1 [Источники данных](#21-источники-данных)
   - 2.2 [PostgreSQL + PostGIS — схема БД](#22-postgresql--postgis--схема-бд)
   - 2.3 [Pipeline обработки OSM данных](#23-pipeline-обработки-osm-данных)
   - 2.4 [Spatial Indexing](#24-spatial-indexing)
   - 2.5 [Data Quality](#25-data-quality)
3. [Раздел 3: Tile Rendering Engine](#раздел-3-tile-rendering-engine)
   - 3.1 [Vector Tiles Architecture](#31-vector-tiles-architecture)
   - 3.2 [Tile Generation Pipeline](#32-tile-generation-pipeline)
   - 3.3 [Zoom Level Strategy](#33-zoom-level-strategy)
   - 3.4 [Style Specification](#34-style-specification)
   - 3.5 [Tile Serving Infrastructure](#35-tile-serving-infrastructure)
   - 3.6 [Client-Side Rendering](#36-client-side-rendering)
4. [Раздел 4: Routing Engine](#раздел-4-routing-engine)
   - 4.1 [Graph Data Structure](#41-graph-data-structure)
   - 4.2 [Routing Algorithms](#42-routing-algorithms)
   - 4.3 [Valhalla Configuration](#43-valhalla-configuration)
   - 4.4 [Route Types & Profiles](#44-route-types--profiles)
   - 4.5 [Route Response Format](#45-route-response-format)
   - 4.6 [Isochrone / Isodistance](#46-isochrone--isodistance)
   - 4.7 [Matrix Routing](#47-matrix-routing)
   - 4.8 [Route Optimization TSP/VRP](#48-route-optimization-tspvrp)
   - 4.9 [Weight Formula](#49-weight-formula)

---

## Раздел 1: Обзор системы

### 1.1 Высокоуровневая архитектура

Навигационный модуль ECOMANSONI — полностью независимая подсистема уровня Google Maps / Yandex Navigator / 2GIS, выступающая фундаментом для всех гео-зависимых сервисов суперприложения: такси-агрегатора, доставки, страхования (гео-привязка полисов), CRM (гео-аналитика), мессенджера (отправка локации, live location sharing).

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                              ECOMANSONI SUPER-APP CLIENTS                                    │
│                                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Mobile App   │  │  Web SPA     │  │  Telegram    │  │  Driver App  │  │  Admin Panel │   │
│  │  iOS/Android  │  │  React/TS    │  │  Mini App    │  │  React Native│  │  React/TS    │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                 │                 │                 │             │
│         └─────────────────┴─────────┬───────┴─────────────────┴─────────────────┘             │
│                                     │                                                        │
│                          ┌──────────▼──────────┐                                             │
│                          │   MapLibre GL JS     │  ◄── Vector Tile Renderer                  │
│                          │   + MapLibre Native  │      WebGL / Metal / Vulkan                │
│                          └──────────┬──────────┘                                             │
└─────────────────────────────────────┼────────────────────────────────────────────────────────┘
                                      │ HTTPS / WSS / gRPC
                                      │
┌─────────────────────────────────────┼────────────────────────────────────────────────────────┐
│                         API GATEWAY (Kong / Envoy)                                           │
│                     Rate Limiting │ Auth │ Load Balancing │ Metrics                          │
└─────────────────────────────────────┼────────────────────────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────────────┐
          │                           │                                   │
┌─────────▼──────────┐  ┌────────────▼─────────────┐  ┌──────────────────▼──────────────────┐
│  TILE SERVICE       │  │  ROUTING SERVICE          │  │  SEARCH & GEOCODING SERVICE        │
│  ┌───────────────┐  │  │  ┌────────────────────┐  │  │  ┌─────────────────────────────┐   │
│  │ Tegola/Martin │  │  │  │ Valhalla Engine     │  │  │  │ Photon / Pelias             │   │
│  │ Vector Tiles  │  │  │  │ CH / MLD / CCH      │  │  │  │ Elasticsearch / Typesense   │   │
│  └───────┬───────┘  │  │  │ A* / Dijkstra       │  │  │  │ Nominatim                   │   │
│          │          │  │  └────────┬───────────┘  │  │  └──────────────┬──────────────┘   │
│  ┌───────▼───────┐  │  │  ┌────────▼───────────┐  │  │  ┌──────────────▼──────────────┐   │
│  │ Tile Cache    │  │  │  │ Graph Data Store   │  │  │  │ POI Database               │   │
│  │ Redis/S3      │  │  │  │ Memory-mapped      │  │  │  │ PostgreSQL + FTS           │   │
│  └───────────────┘  │  │  └────────────────────┘  │  │  └─────────────────────────────┘   │
└─────────────────────┘  └──────────────────────────┘  └────────────────────────────────────┘
          │                           │                                   │
          └───────────────────────────┼───────────────────────────────────┘
                                      │
┌─────────────────────────────────────┼────────────────────────────────────────────────────────┐
│                           MAP DATA ENGINE (Core)                                             │
│                                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐ │
│  │ PostgreSQL     │  │ OSM Import     │  │ Spatial Index  │  │ Data Quality Pipeline      │ │
│  │ + PostGIS      │  │ Pipeline       │  │ R-tree/S2/H3   │  │ Topology Validation        │ │
│  │ 15+ таблиц     │  │ osm2pgsql      │  │ Geohash        │  │ Duplicate Detection        │ │
│  │ Partitioned    │  │ osmium         │  │ Quadtree       │  │ Speed Limit Inference      │ │
│  └────────────────┘  └────────────────┘  └────────────────┘  └────────────────────────────┘ │
│                                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐ │
│  │ Traffic Data   │  │ Elevation      │  │ Satellite      │  │ User Telemetry             │ │
│  │ Real-time      │  │ SRTM/ASTER    │  │ Imagery        │  │ GPS Traces                 │ │
│  │ Aggregation    │  │ DEM Tiles      │  │ Sentinel-2     │  │ POI Corrections            │ │
│  └────────────────┘  └────────────────┘  └────────────────┘  └────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                                      │
┌─────────────────────────────────────┼────────────────────────────────────────────────────────┐
│                         REAL-TIME LAYER                                                      │
│                                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐ │
│  │ Traffic        │  │ GPS Tracking   │  │ Turn-by-Turn   │  │ Event Bus                  │ │
│  │ Aggregator     │  │ Service        │  │ Navigation     │  │ Apache Kafka               │ │
│  │ speed/congestion│ │ WebSocket/gRPC │  │ Voice Guidance │  │ Real-time events           │ │
│  └────────────────┘  └────────────────┘  └────────────────┘  └────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                                      │
┌─────────────────────────────────────┼────────────────────────────────────────────────────────┐
│                         INFRASTRUCTURE LAYER                                                 │
│                                                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐│
│  │Kubernetes│  │ Redis    │  │ Kafka    │  │ S3/MinIO │  │ Prometheus│  │ Grafana/Jaeger  ││
│  │ Cluster  │  │ Cluster  │  │ Cluster  │  │ Storage  │  │ Metrics   │  │ Tracing/Dashbd  ││
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 1.2 Список подсистем

| # | Подсистема | Описание | Технологии | Критичность |
|---|-----------|----------|-----------|-------------|
| 1 | **Map Data Engine** | Ядро картографических данных: импорт, хранение, индексация, валидация | PostgreSQL 16 + PostGIS 3.4, osm2pgsql, osmium | 🔴 Critical |
| 2 | **Tile Rendering Engine** | Генерация и раздача векторных тайлов для визуализации карты | Tegola/Martin, Tippecanoe, MapLibre GL | 🔴 Critical |
| 3 | **Routing Engine** | Построение маршрутов для всех типов транспорта | Valhalla 3.x, CH/MLD/CCH алгоритмы | 🔴 Critical |
| 4 | **Search & Geocoding** | Поиск адресов, POI, обратное геокодирование | Photon/Pelias, Nominatim, Elasticsearch 8.x | 🔴 Critical |
| 5 | **Traffic Engine** | Сбор, агрегация и прогноз дорожного трафика в реальном времени | Kafka Streams, Redis TimeSeries, ML models | 🟡 High |
| 6 | **GPS Tracking Service** | Приём и обработка GPS-координат от устройств | WebSocket/gRPC, Redis GEO, TimescaleDB | 🟡 High |
| 7 | **Turn-by-Turn Navigation** | Пошаговая навигация с голосовыми подсказками | Valhalla guidance, TTS engine, SSML | 🟡 High |
| 8 | **Offline Engine** | Работа карт и маршрутизации без интернета | SQLite/MBTiles, OSRM lite, pre-cached tiles | 🟡 High |
| 9 | **ETA Prediction** | ML-модель для точного прогноза времени прибытия | LightGBM, traffic features, historical data | 🟢 Medium |
| 10 | **Map Editor** | Инструменты для редактирования карт и модерации правок | JOSM-like web UI, change review pipeline | 🟢 Medium |
| 11 | **Analytics Engine** | Гео-аналитика: heatmaps, flow analysis, coverage reports | ClickHouse, Apache Superset, H3 aggregation | 🟢 Medium |
| 12 | **Place Reviews** | Рейтинги и отзывы о местах | PostgreSQL, image storage, moderation pipeline | 🟢 Medium |
| 13 | **Fleet Management** | Мониторинг парка транспортных средств в реальном времени | WebSocket, Redis GEO, geofencing | 🟢 Medium |
| 14 | **Street View** | Панорамные снимки улиц (Mapillary / собственные) | Mapillary API, 360° viewer, S3 storage | 🔵 Low |

---

### 1.3 Граф зависимостей

```
                              ┌─────────────────────┐
                              │   Map Data Engine    │
                              │   (PostgreSQL +      │
                              │    PostGIS)          │
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┬┴────────────────────┐
                    │                    │                      │
           ┌────────▼──────┐  ┌──────────▼──────────┐  ┌──────▼──────────┐
           │ Tile Rendering │  │  Routing Engine     │  │ Search &        │
           │ Engine         │  │  (Valhalla)         │  │ Geocoding       │
           └────────┬──────┘  └──────────┬──────────┘  └──────┬──────────┘
                    │                    │                      │
                    │         ┌──────────▼──────────┐          │
                    │         │  Traffic Engine      ├──────────┤
                    │         │  (Real-time data)    │          │
                    │         └──────────┬──────────┘          │
                    │                    │                      │
           ┌────────▼──────────────────┬─▼──────────────────────▼─────────┐
           │                           │                                   │
  ┌────────▼──────┐  ┌────────────────▼──────────────┐  ┌─────────────────▼───┐
  │ Offline Engine │  │ Turn-by-Turn Navigation      │  │ ETA Prediction      │
  │ (cached tiles  │  │ (routing + guidance + voice)  │  │ (routing + traffic  │
  │  + OSRM lite)  │  │                               │  │  + ML model)        │
  └───────────────┘  └───────────────────────────────┘  └─────────────────────┘
           │                    │                                │
           └────────────────────┴────────────────────────────────┘
                                         │
                              ┌──────────▼──────────┐
                              │  GPS Tracking        │
                              │  Service             │
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┬┴────────────────────┐
                    │                    │                      │
           ┌────────▼──────┐  ┌──────────▼──────────┐  ┌──────▼──────────┐
           │ Fleet Mgmt    │  │  Analytics Engine   │  │ Place Reviews   │
           └───────────────┘  └─────────────────────┘  └─────────────────┘
```

**Правила зависимостей:**
- Map Data Engine не зависит ни от чего — чистый источник данных
- Tile Rendering, Routing и Search зависят ТОЛЬКО от Map Data Engine
- Traffic Engine зависит от Map Data Engine + GPS Tracking
- Turn-by-Turn зависит от Routing + Traffic + GPS Tracking
- Offline Engine требует предварительно сгенерированных тайлов и графа маршрутов
- ETA Prediction зависит от Routing + Traffic + исторических данных
- Fleet Management зависит от GPS Tracking + Map Data

---

### 1.4 Целевые SLA/SLO

#### Latency SLO (миллисекунды)

| Метрика | p50 | p95 | p99 | p99.9 | Max допустимый |
|---------|-----|-----|-----|-------|----------------|
| **Routing: город (< 50 km)** | 35 ms | 80 ms | 150 ms | 300 ms | 500 ms |
| **Routing: межгород (50–500 km)** | 60 ms | 150 ms | 300 ms | 500 ms | 1000 ms |
| **Routing: межрегион (> 500 km)** | 100 ms | 250 ms | 500 ms | 800 ms | 2000 ms |
| **Re-routing (отклонение от маршрута)** | 25 ms | 60 ms | 120 ms | 200 ms | 300 ms |
| **Tile load (single tile)** | 15 ms | 40 ms | 80 ms | 150 ms | 200 ms |
| **Tile load (viewport, ~6-12 tiles)** | 80 ms | 200 ms | 400 ms | 600 ms | 1000 ms |
| **Search / Autocomplete** | 30 ms | 70 ms | 150 ms | 250 ms | 400 ms |
| **Geocoding (forward)** | 20 ms | 50 ms | 100 ms | 200 ms | 300 ms |
| **Geocoding (reverse)** | 10 ms | 30 ms | 60 ms | 100 ms | 150 ms |
| **Traffic data refresh** | — | — | — | — | interval 30s |
| **GPS fix processing** | 5 ms | 15 ms | 30 ms | 50 ms | 100 ms |
| **ETA calculation** | 40 ms | 100 ms | 200 ms | 400 ms | 500 ms |
| **Matrix routing (10x10)** | 100 ms | 250 ms | 500 ms | 800 ms | 1500 ms |
| **Isochrone generation** | 150 ms | 400 ms | 800 ms | 1200 ms | 2000 ms |

#### Accuracy SLO

| Метрика | Целевое значение | Допустимое отклонение |
|---------|-----------------|----------------------|
| **GPS fix accuracy (open sky)** | ≤ 3 м | σ ≤ 5 м |
| **GPS fix accuracy (urban canyon)** | ≤ 8 м | σ ≤ 15 м |
| **Map-matching accuracy** | ≥ 95% correct road | ≥ 90% в сложных развязках |
| **ETA accuracy (город)** | ±10% от реального | ±15% для 95-го перцентиля |
| **ETA accuracy (межгород)** | ±8% от реального | ±12% для 95-го перцентиля |
| **Routing distance accuracy** | ±2% от реального | ±5% для альтернативных |
| **Geocoding accuracy (city level)** | ≥ 99.5% | — |
| **Geocoding accuracy (house level)** | ≥ 92% | — |
| **Traffic congestion accuracy** | ≥ 85% match реальности | — |

#### Availability SLO

| Подсистема | Uptime SLO | Max допустимый downtime/месяц | Error budget |
|-----------|-----------|-------------------------------|-------------|
| Tile Service | 99.95% | 21.9 мин | 0.05% |
| Routing Service | 99.95% | 21.9 мин | 0.05% |
| Search Service | 99.9% | 43.8 мин | 0.1% |
| Traffic Engine | 99.9% | 43.8 мин | 0.1% |
| GPS Tracking | 99.99% | 4.38 мин | 0.01% |
| Turn-by-Turn | 99.95% | 21.9 мин | 0.05% |
| Offline Engine | 99.999% (локально) | 0.44 мин | 0.001% |

#### Throughput SLO

| Метрика | Target (sustained) | Burst (10 sec) |
|---------|-------------------|----------------|
| Tile requests/sec | 50,000 | 200,000 |
| Route requests/sec | 10,000 | 50,000 |
| Search requests/sec | 20,000 | 80,000 |
| GPS points ingested/sec | 500,000 | 2,000,000 |
| Traffic segment updates/sec | 100,000 | 500,000 |
| WebSocket concurrent connections | 1,000,000 | 2,000,000 |

#### Offline Mode SLO

| Метрика | Целевое значение |
|---------|-----------------|
| Cold start (app launch → map visible) | ≤ 1.5 сек |
| Warm start (resume → map visible) | ≤ 0.3 сек |
| Offline route calculation (город) | ≤ 200 мс |
| Offline search (cached POI) | ≤ 50 мс |
| Pre-cached region size (Moscow) | ~350 MB |
| Pre-cached region size (Russia) | ~2.8 GB |

---

## Раздел 2: Map Data Engine

Map Data Engine — фундаментальная подсистема, хранящая и обслуживающая все картографические данные. От качества этого ядра зависит работа всех остальных подсистем навигатора.

### 2.1 Источники данных

#### 2.1.1 OpenStreetMap (OSM)

| Параметр | Значение |
|----------|---------|
| Формат | PBF (Protocol Buffer Format) |
| Planet dump размер | ~72 GB (PBF), ~1.6 TB (XML) |
| Russia extract размер | ~2.8 GB (PBF) |
| Moscow extract размер | ~180 MB (PBF) |
| Периодичность planet dump | Еженедельно (Thursday) |
| Периодичность diff updates | Ежеминутно (minutely replication) |
| Diff размер (minute) | ~10-50 KB |
| Diff размер (daily) | ~80-150 MB |
| Источник | https://planet.openstreetmap.org/ |
| Региональные extracts | https://download.geofabrik.de/ |
| Лицензия | ODbL 1.0 |
| Количество nodes (planet) | ~8.5 млрд |
| Количество ways (planet) | ~970 млн |
| Количество relations (planet) | ~12 млн |

**Структура данных OSM:**
- **Node** — точка: id, lat, lon, tags{}
- **Way** — линия/полигон: id, node_refs[], tags{}
- **Relation** — связь: id, members[{type, ref, role}], tags{}

**Ключевые теги для навигации:**
```
highway=*          — классификация дорог
maxspeed=*         — скоростной лимит
oneway=yes/no/-1   — одностороннее движение
lanes=*            — количество полос
surface=*          — тип покрытия
bridge=yes         — мост
tunnel=yes         — тоннель
access=*           — ограничения доступа
toll=yes           — платная дорога
name=*             — название
name:ru=*          — название на русском
name:en=*          — название на английском
lit=yes/no         — освещение
sidewalk=*         — тротуар
cycleway=*         — велодорожка
turn:lanes=*       — разметка поворотов по полосам
destination=*      — указатель направления
```

#### 2.1.2 Государственные источники данных (Россия)

| Источник | Данные | Формат | Периодичность | Размер |
|----------|--------|--------|---------------|--------|
| **Росреестр (ЕГРН)** | Кадастровые участки, границы | GML, SHP | Квартальный | ~50 GB |
| **ФИАС (ГАР)** | Адресный реестр РФ | XML, DBF | Ежемесячный | ~12 GB (полный) |
| **Росавтодор** | Федеральные дороги, состояние покрытия | SHP, CSV | Ежегодный | ~2 GB |
| **Минтранс РФ** | Дорожная сеть, ограничения для грузового транспорта | XML | Квартальный | ~500 MB |
| **ГИБДД** | Камеры скорости, ДТП-статистика | JSON API | Real-time | — |
| **Координационный центр** | Дорожные работы, перекрытия | JSON API | Real-time | — |
| **ДубльГИС data** | POI, организации (если лицензия) | JSON | Ежемесячный | ~5 GB |

#### 2.1.3 Спутниковые данные

| Источник | Разрешение | Покрытие | Периодичность | Стоимость |
|----------|-----------|----------|---------------|-----------|
| **Sentinel-2 (ESA)** | 10 м/пиксель | Глобальное | 5 дней | Бесплатно |
| **Landsat-9 (NASA)** | 15-30 м/пиксель | Глобальное | 16 дней | Бесплатно |
| **Maxar WorldView** | 0.3 м/пиксель | По запросу | По запросу | $14-25/км² |
| **Planet Labs** | 3-5 м/пиксель | Ежедневное | 1 день | По подписке |
| **Mapbox Satellite** | 0.5-1 м/пиксель | Глобальное | Varies | По подписке |

**Применение спутниковых данных:**
- Обнаружение новых дорог и зданий
- Верификация OSM-данных
- Классификация land use (лес, вода, застройка)
- Подложка для satellite hybrid стиля карты

#### 2.1.4 Пользовательская телеметрия

| Тип данных | Источник | Частота | Хранение | Описание |
|-----------|---------|---------|----------|----------|
| **GPS traces** | Mobile SDK | 1 Hz (движение), 0.1 Hz (стоянка) | TimescaleDB, retention 90 дней | Raw GPS-координаты для map-matching и обнаружения дорог |
| **Speed probes** | Mobile SDK | При изменении скорости > 5 km/h | Kafka → ClickHouse | Скорость движения для трафика |
| **POI corrections** | User reports | По событию | PostgreSQL | Исправления POI: перемещение, удаление, добавление |
| **Road reports** | User reports | По событию | PostgreSQL | ДТП, дорожные работы, полиция, опасности |
| **Parking events** | Mobile SDK | При входе/выходе из geofence | TimescaleDB | Обнаружение парковочных мест |

#### 2.1.5 Коммерческие источники (для сравнения и fallback)

| Поставщик | Качество дорожной сети | Покрытие РФ | API rate limit | Стоимость |
|-----------|----------------------|------------|----------------|-----------|
| **HERE Maps** | Отличное, 196 стран | Хорошее | 250k req/month (free) | от $449/мес |
| **TomTom** | Отличное, 200+ стран | Среднее | 2500 req/day (free) | от $400/мес |
| **Google Maps Platform** | Лучшее | Отличное | $200 credit/month | $5-7/1000 req |
| **Yandex Maps API** | Лучшее для РФ | Лучшее | 25k req/day (free) | По подписке |
| **2GIS API** | Отличное для городов РФ | Отличное (города) | 100k req/мес (free) | По подписке |

> **Стратегия:** OSM + государственные данные = основной стек. Коммерческие API используются для валидации качества и fallback для критичных случаев.

---

### 2.2 PostgreSQL + PostGIS — схема БД

**Общие параметры БД:**
```
PostgreSQL 16.x
PostGIS 3.4.x
PROJ 9.x
GEOS 3.12.x
GDAL 3.8.x
SRID: 4326 (WGS 84) для хранения
SRID: 3857 (Web Mercator) для тайлов
SRID: 32637 (UTM zone 37N) для расчётов расстояний (Москва)
```

#### Таблица: `roads` — Дорожный граф

```sql
-- ============================================================
-- Таблица: nav.roads
-- Описание: Основная таблица дорожного графа навигатора
-- Estimated rows: ~120M (planet), ~8M (Russia), ~800K (Moscow)
-- Estimated size: ~45 GB (planet), ~3 GB (Russia), ~300 MB (Moscow)
-- Partitioning: по region_id (LIST partitioning)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS nav;

CREATE TYPE nav.road_class AS ENUM (
    'motorway',         -- Автомагистраль (M-дороги в РФ)
    'motorway_link',    -- Съезд с автомагистрали
    'trunk',            -- Скоростная дорога
    'trunk_link',       -- Съезд со скоростной дороги
    'primary',          -- Главная дорога (федеральная)
    'primary_link',     -- Съезд с главной дороги
    'secondary',        -- Второстепенная дорога (региональная)
    'secondary_link',   -- Съезд со второстепенной
    'tertiary',         -- Третичная дорога (местная)
    'tertiary_link',    -- Съезд с третичной
    'residential',      -- Жилая улица
    'living_street',    -- Жилая зона (ограничение 20 км/ч)
    'service',          -- Служебная дорога (подъезды, парковки)
    'unclassified',     -- Неклассифицированная дорога
    'track',            -- Грунтовая дорога
    'path',             -- Тропа
    'footway',          -- Пешеходная дорожка
    'cycleway',         -- Велодорожка
    'pedestrian',       -- Пешеходная зона
    'steps',            -- Лестница
    'construction',     -- Строящаяся дорога
    'proposed'          -- Запланированная дорога
);

CREATE TYPE nav.surface_type AS ENUM (
    'asphalt', 'concrete', 'paving_stones', 'sett',
    'cobblestone', 'metal', 'wood', 'gravel',
    'fine_gravel', 'compacted', 'sand', 'dirt',
    'mud', 'grass', 'ground', 'unpaved', 'unknown'
);

CREATE TYPE nav.access_type AS ENUM (
    'yes', 'no', 'private', 'permissive', 'customers',
    'delivery', 'designated', 'destination', 'agricultural',
    'forestry', 'military', 'emergency'
);

CREATE TABLE nav.roads (
    id              BIGINT          NOT NULL,
    osm_id          BIGINT,
    geometry        geometry(LineString, 4326) NOT NULL,
    
    -- Классификация
    road_class      nav.road_class  NOT NULL DEFAULT 'unclassified',
    road_ref        VARCHAR(32),     -- Номер дороги: "М-7", "E30", "A-108"
    
    -- Наименование
    name            TEXT,            -- Название на языке региона
    name_ru         TEXT,            -- Название на русском
    name_en         TEXT,            -- Название на английском
    name_local      TEXT,            -- Название на локальном языке
    
    -- Скоростные характеристики
    max_speed       SMALLINT,        -- Ограничение скорости км/ч (NULL = определяется по road_class)
    max_speed_forward  SMALLINT,     -- Макс. скорость в прямом направлении
    max_speed_backward SMALLINT,     -- Макс. скорость в обратном направлении
    advisory_speed  SMALLINT,        -- Рекомендуемая скорость
    
    -- Физические характеристики
    lanes           SMALLINT         DEFAULT 2,
    lanes_forward   SMALLINT,
    lanes_backward  SMALLINT,
    width           REAL,            -- Ширина дороги в метрах
    surface         nav.surface_type DEFAULT 'unknown',
    smoothness      VARCHAR(32),     -- excellent/good/intermediate/bad/very_bad/horrible
    
    -- Направление
    oneway          SMALLINT         DEFAULT 0,  -- 0=двустороннее, 1=прямое, -1=обратное
    
    -- Инфраструктура
    bridge          BOOLEAN          DEFAULT FALSE,
    tunnel          BOOLEAN          DEFAULT FALSE,
    ford            BOOLEAN          DEFAULT FALSE,
    toll            BOOLEAN          DEFAULT FALSE,
    lit             BOOLEAN,         -- Освещение (NULL = неизвестно)
    
    -- Ограничения доступа
    access          nav.access_type  DEFAULT 'yes',
    vehicle_access  nav.access_type,
    motorcar_access nav.access_type,
    hgv_access      nav.access_type, -- Грузовой транспорт
    bicycle_access  nav.access_type,
    foot_access     nav.access_type,
    
    -- Ограничения для грузового транспорта
    maxheight       REAL,            -- Максимальная высота (м)
    maxweight       REAL,            -- Максимальный вес (т)
    maxwidth        REAL,            -- Максимальная ширина (м)
    maxlength       REAL,            -- Максимальная длина (м)
    maxaxleload     REAL,            -- Максимальная нагрузка на ось (т)
    
    -- Пешеходная и велосипедная инфраструктура
    sidewalk        VARCHAR(16),     -- both/left/right/no/separate
    cycleway        VARCHAR(32),     -- lane/track/share_busway/shared_lane/no
    foot            VARCHAR(16),     -- yes/no/designated
    bicycle         VARCHAR(16),     -- yes/no/designated
    
    -- Общественный транспорт
    bus             VARCHAR(16),     -- yes/no/designated
    bus_lanes       BOOLEAN          DEFAULT FALSE,
    trolleybus      BOOLEAN          DEFAULT FALSE,
    tram            BOOLEAN          DEFAULT FALSE,
    
    -- Парковка вдоль дороги
    parking_lane_left   VARCHAR(32), -- parallel/diagonal/perpendicular/no_parking/no_stopping
    parking_lane_right  VARCHAR(32),
    
    -- Z-ordering для рендеринга
    layer           SMALLINT         DEFAULT 0,  -- -5..+5, мосты/тоннели
    z_order         INTEGER          DEFAULT 0,  -- Порядок отрисовки
    
    -- Навигационные атрибуты
    turn_lanes_forward  TEXT,        -- "left|through|through;right"
    turn_lanes_backward TEXT,
    destination_forward TEXT,        -- "Москва;Тула"
    destination_backward TEXT,
    junction        VARCHAR(16),     -- roundabout/circular
    
    -- Длина в метрах (вычисляемое)
    length_m        DOUBLE PRECISION NOT NULL DEFAULT 0,
    
    -- Регион для партиционирования
    region_id       INTEGER          NOT NULL DEFAULT 0,
    
    -- Метаданные
    tags            JSONB            DEFAULT '{}',
    source          VARCHAR(32)      DEFAULT 'osm',  -- osm/government/user/satellite
    osm_version     INTEGER,
    osm_timestamp   TIMESTAMPTZ,
    imported_at     TIMESTAMPTZ      DEFAULT NOW(),
    updated_at      TIMESTAMPTZ      DEFAULT NOW(),
    
    CONSTRAINT roads_pkey PRIMARY KEY (id, region_id)
) PARTITION BY LIST (region_id);

-- Партиции по регионам
CREATE TABLE nav.roads_moscow    PARTITION OF nav.roads FOR VALUES IN (77);
CREATE TABLE nav.roads_spb       PARTITION OF nav.roads FOR VALUES IN (78);
CREATE TABLE nav.roads_moscow_obl PARTITION OF nav.roads FOR VALUES IN (50);
CREATE TABLE nav.roads_default   PARTITION OF nav.roads DEFAULT;

-- Автовычисление длины при INSERT/UPDATE
CREATE OR REPLACE FUNCTION nav.compute_road_length()
RETURNS TRIGGER AS $$
BEGIN
    NEW.length_m := ST_Length(NEW.geometry::geography);
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_roads_compute_length
    BEFORE INSERT OR UPDATE OF geometry ON nav.roads
    FOR EACH ROW EXECUTE FUNCTION nav.compute_road_length();

-- ==================== ИНДЕКСЫ ====================

-- Пространственный индекс (GiST) — основной для гео-запросов
CREATE INDEX idx_roads_geometry_gist ON nav.roads USING GIST (geometry);

-- B-tree индексы
CREATE INDEX idx_roads_road_class ON nav.roads (road_class);
CREATE INDEX idx_roads_osm_id ON nav.roads (osm_id);
CREATE INDEX idx_roads_name ON nav.roads (name) WHERE name IS NOT NULL;
CREATE INDEX idx_roads_name_ru ON nav.roads (name_ru) WHERE name_ru IS NOT NULL;
CREATE INDEX idx_roads_region_id ON nav.roads (region_id);
CREATE INDEX idx_roads_updated_at ON nav.roads (updated_at);

-- Partial индексы для частых запросов
CREATE INDEX idx_roads_toll ON nav.roads (id) WHERE toll = TRUE;
CREATE INDEX idx_roads_navigable ON nav.roads (road_class) 
    WHERE road_class NOT IN ('construction', 'proposed', 'path', 'steps');
CREATE INDEX idx_roads_oneway ON nav.roads (id, oneway) WHERE oneway != 0;

-- GIN индекс для JSONB тегов
CREATE INDEX idx_roads_tags ON nav.roads USING GIN (tags);

-- Composite индекс для routing queries
CREATE INDEX idx_roads_class_region ON nav.roads (road_class, region_id);
```

#### Таблица: `nodes` — Узлы графа

```sql
-- ============================================================
-- Таблица: nav.nodes
-- Описание: Узлы дорожного графа (перекрёстки, точки изменения атрибутов)
-- Estimated rows: ~250M (planet), ~20M (Russia), ~2M (Moscow)
-- Estimated size: ~25 GB (planet), ~2 GB (Russia), ~200 MB (Moscow)
-- ============================================================

CREATE TABLE nav.nodes (
    id              BIGINT          PRIMARY KEY,
    osm_id          BIGINT,
    geometry        geometry(Point, 4326) NOT NULL,
    
    -- Высотные данные
    elevation       REAL,            -- Высота над уровнем моря (м), из SRTM/ASTER DEM
    
    -- Дорожная инфраструктура
    barrier         VARCHAR(32),     -- gate/bollard/lift_gate/toll_booth/border_control
    crossing        VARCHAR(32),     -- traffic_signals/marked/unmarked/island/zebra
    traffic_signals BOOLEAN          DEFAULT FALSE,
    stop_sign       BOOLEAN          DEFAULT FALSE,
    give_way        BOOLEAN          DEFAULT FALSE,
    mini_roundabout BOOLEAN          DEFAULT FALSE,
    
    -- Ограничения
    motor_vehicle   nav.access_type,
    bicycle         nav.access_type,
    foot            nav.access_type,
    
    -- Связь с дорогами (денормализовано для скорости)
    road_count      SMALLINT         DEFAULT 0,  -- Кол-во дорог, сходящихся в узле
    
    -- Метаданные
    tags            JSONB            DEFAULT '{}',
    region_id       INTEGER          NOT NULL DEFAULT 0,
    source          VARCHAR(32)      DEFAULT 'osm',
    updated_at      TIMESTAMPTZ      DEFAULT NOW()
);

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX idx_nodes_geometry_gist ON nav.nodes USING GIST (geometry);
CREATE INDEX idx_nodes_osm_id ON nav.nodes (osm_id);
CREATE INDEX idx_nodes_signals ON nav.nodes (id) WHERE traffic_signals = TRUE;
CREATE INDEX idx_nodes_barrier ON nav.nodes (barrier) WHERE barrier IS NOT NULL;
CREATE INDEX idx_nodes_region ON nav.nodes (region_id);
CREATE INDEX idx_nodes_road_count ON nav.nodes (road_count) WHERE road_count >= 3;
```

#### Таблица: `intersections` — Перекрёстки

```sql
-- ============================================================
-- Таблица: nav.intersections
-- Описание: Перекрёстки дорожной сети с детальной типизацией
-- Estimated rows: ~50M (planet), ~3M (Russia), ~350K (Moscow)
-- Estimated size: ~8 GB (planet), ~500 MB (Russia), ~55 MB (Moscow)
-- ============================================================

CREATE TYPE nav.intersection_type AS ENUM (
    'simple',           -- Простой перекрёсток (T, X, Y)
    'roundabout',       -- Круговое движение
    'mini_roundabout',  -- Мини-круг
    'traffic_signals',  -- Регулируемый светофором
    'stop_sign',        -- Со знаком STOP
    'give_way',         -- Со знаком "Уступи дорогу"
    'interchange',      -- Развязка (motorway junction)
    'fork',             -- Развилка
    'merge',            -- Слияние
    'crossing'          -- Пешеходный переход через дорогу
);

CREATE TYPE nav.signal_type AS ENUM (
    'fixed_time',       -- Фиксированная фаза
    'actuated',         -- Адаптивный (с датчиками)
    'adaptive',         -- Интеллектуальный (SCOOT/SCATS)
    'pedestrian_only',  -- Только для пешеходов
    'flashing',         -- Мигающий жёлтый
    'none'              -- Без светофора
);

CREATE TABLE nav.intersections (
    id              BIGINT          PRIMARY KEY,
    node_id         BIGINT          NOT NULL REFERENCES nav.nodes(id),
    geometry        geometry(Point, 4326) NOT NULL,
    
    -- Тип перекрёстка
    type            nav.intersection_type NOT NULL DEFAULT 'simple',
    signal_type     nav.signal_type      DEFAULT 'none',
    
    -- Геометрия перекрёстка
    approach_count  SMALLINT        NOT NULL DEFAULT 2,  -- Кол-во подходов (2..12)
    
    -- Светофорные данные
    signal_phases   JSONB,          -- Фазы светофора: [{"green_time": 30, "roads": [1,3]}, ...]
    signal_cycle_s  SMALLINT,       -- Длительность полного цикла в секундах
    avg_wait_s      SMALLINT,       -- Среднее время ожидания в секундах
    
    -- Ограничения поворотов (сводка - детали в turn_restrictions)
    turn_restrictions JSONB         DEFAULT '[]',
    -- Формат: [{"from": road_id, "to": road_id, "type": "no_left_turn", "condition": "Mo-Fr 07:00-09:00"}]
    
    -- Штрафы за прохождение (для routing)
    crossing_cost_s REAL            DEFAULT 0,   -- Дополнительное время на проезд (сек)
    
    -- Метаданные
    region_id       INTEGER         NOT NULL DEFAULT 0,
    tags            JSONB           DEFAULT '{}',
    source          VARCHAR(32)     DEFAULT 'osm',
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX idx_intersections_geometry ON nav.intersections USING GIST (geometry);
CREATE INDEX idx_intersections_node_id ON nav.intersections (node_id);
CREATE INDEX idx_intersections_type ON nav.intersections (type);
CREATE INDEX idx_intersections_signals ON nav.intersections (id) WHERE signal_type != 'none';
CREATE INDEX idx_intersections_region ON nav.intersections (region_id);
```

#### Таблица: `turn_restrictions` — Ограничения поворотов

```sql
-- ============================================================
-- Таблица: nav.turn_restrictions
-- Описание: Ограничения поворотов (обязательные и запрещённые)
-- Estimated rows: ~5M (planet), ~400K (Russia), ~60K (Moscow)
-- Estimated size: ~800 MB (planet), ~65 MB (Russia), ~10 MB (Moscow)
-- ============================================================

CREATE TYPE nav.restriction_type AS ENUM (
    'no_right_turn',
    'no_left_turn',
    'no_u_turn',
    'no_straight_on',
    'no_entry',
    'no_exit',
    'only_right_turn',
    'only_left_turn',
    'only_straight_on'
);

CREATE TYPE nav.vehicle_class AS ENUM (
    'all',              -- Все ТС
    'motorcar',         -- Легковые
    'hgv',              -- Грузовые
    'bus',              -- Автобусы
    'taxi',             -- Такси
    'motorcycle',       -- Мотоциклы
    'bicycle',          -- Велосипеды
    'psv',              -- Общественный транспорт
    'emergency'         -- Экстренные службы
);

CREATE TABLE nav.turn_restrictions (
    id              BIGINT          PRIMARY KEY,
    osm_id          BIGINT,
    
    -- Связи
    from_road_id    BIGINT          NOT NULL,   -- FK → nav.roads (дорога, откуда едем)
    via_node_id     BIGINT          NOT NULL,   -- FK → nav.nodes (узел поворота)
    to_road_id      BIGINT          NOT NULL,   -- FK → nav.roads (дорога, куда едем)
    via_way_id      BIGINT,                     -- Для complex restriction через way
    
    -- Тип ограничения
    restriction_type nav.restriction_type NOT NULL,
    
    -- Условия действия
    time_condition  TEXT,           -- "Mo-Fr 07:00-09:00,17:00-19:00" (OSM-формат)
    vehicle_type    nav.vehicle_class DEFAULT 'all',
    except_vehicle  nav.vehicle_class[], -- Исключения: ARRAY['taxi', 'bus', 'emergency']
    
    -- Метаданные
    tags            JSONB           DEFAULT '{}',
    source          VARCHAR(32)     DEFAULT 'osm',
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX idx_turn_from_road ON nav.turn_restrictions (from_road_id);
CREATE INDEX idx_turn_via_node ON nav.turn_restrictions (via_node_id);
CREATE INDEX idx_turn_to_road ON nav.turn_restrictions (to_road_id);
CREATE INDEX idx_turn_type ON nav.turn_restrictions (restriction_type);
CREATE INDEX idx_turn_vehicle ON nav.turn_restrictions (vehicle_type) WHERE vehicle_type != 'all';
CREATE INDEX idx_turn_time_cond ON nav.turn_restrictions (id) WHERE time_condition IS NOT NULL;

-- Composite для быстрого поиска ограничений при routing
CREATE INDEX idx_turn_from_via_to ON nav.turn_restrictions (from_road_id, via_node_id, to_road_id);
```

#### Таблица: `speed_limits` — Лимиты скорости

```sql
-- ============================================================
-- Таблица: nav.speed_limits
-- Описание: Ограничения скорости с условиями (время, погода, тип ТС)
-- Estimated rows: ~30M (planet), ~2M (Russia), ~250K (Moscow)
-- Estimated size: ~4 GB (planet), ~300 MB (Russia), ~35 MB (Moscow)
-- ============================================================

CREATE TABLE nav.speed_limits (
    id              BIGINT          PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    road_id         BIGINT          NOT NULL,   -- FK → nav.roads
    
    -- Базовый лимит
    max_speed       SMALLINT        NOT NULL,   -- km/h
    min_speed       SMALLINT,                   -- Минимальная скорость (автомагистрали)
    advisory_speed  SMALLINT,                   -- Рекомендуемая скорость
    
    -- Условные лимиты
    conditional_speed JSONB         DEFAULT '[]',
    -- Формат: [
    --   {"speed": 40, "condition": "wet", "description": "При мокрой дороге"},
    --   {"speed": 60, "condition": "time", "time": "22:00-06:00", "description": "Ночью"},
    --   {"speed": 30, "condition": "school_zone", "time": "Mo-Fr 07:00-17:00"}
    -- ]
    
    -- Ограничения по типу ТС
    vehicle_type    nav.vehicle_class DEFAULT 'all',
    hgv_speed       SMALLINT,       -- Для грузовых отдельно
    bus_speed       SMALLINT,       -- Для автобусов
    
    -- Геопривязка (если лимит действует на участке дороги)
    geometry        geometry(LineString, 4326),  -- NULL = вся дорога
    from_m          REAL,           -- Начало участка (метры от начала дороги)
    to_m            REAL,           -- Конец участка
    
    -- Время действия
    time_of_day     TEXT,           -- "Mo-Fr 07:00-21:00" или NULL = всегда
    seasonal        TEXT,           -- "Apr-Oct" или NULL = весь год
    
    -- Источник знака
    sign_type       VARCHAR(32),    -- "3.24" (Ограничение макс. скорости, ГОСТ)
    enforcement     VARCHAR(32),    -- camera/police/none
    
    -- Метаданные
    source          VARCHAR(32)     DEFAULT 'osm',
    verified        BOOLEAN         DEFAULT FALSE,
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX idx_speed_limits_road ON nav.speed_limits (road_id);
CREATE INDEX idx_speed_limits_geometry ON nav.speed_limits USING GIST (geometry) 
    WHERE geometry IS NOT NULL;
CREATE INDEX idx_speed_limits_vehicle ON nav.speed_limits (vehicle_type) 
    WHERE vehicle_type != 'all';
CREATE INDEX idx_speed_limits_enforcement ON nav.speed_limits (enforcement) 
    WHERE enforcement = 'camera';
```

#### Таблица: `traffic_segments` — Сегменты трафика

```sql
-- ============================================================
-- Таблица: nav.traffic_segments
-- Описание: Сегменты дорог для real-time и исторического трафика
-- Estimated rows: ~80M (planet), ~5M (Russia), ~600K (Moscow)
-- Estimated size: ~35 GB (planet), ~2.2 GB (Russia), ~260 MB (Moscow)
-- ============================================================

CREATE TYPE nav.congestion_level AS ENUM (
    'free_flow',    -- Свободный поток (0-25% загрузки)
    'light',        -- Лёгкий трафик (25-50%)
    'moderate',     -- Умеренный (50-75%)
    'heavy',        -- Тяжёлый (75-90%)
    'severe',       -- Пробка (90-100%)
    'blocked'       -- Полная блокировка
);

CREATE TABLE nav.traffic_segments (
    id              BIGINT          PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    road_id         BIGINT          NOT NULL,   -- FK → nav.roads
    geometry        geometry(LineString, 4326) NOT NULL,
    
    -- Направление
    direction       SMALLINT        NOT NULL DEFAULT 1,  -- 1=forward, -1=backward
    
    -- Базовые скорости
    free_flow_speed SMALLINT        NOT NULL,   -- Скорость при свободном потоке (km/h)
    
    -- Типичные скорости по часам и дням (для prediction)
    typical_speed   JSONB           NOT NULL DEFAULT '{}',
    -- Формат: {
    --   "mon": [45,42,40,42,45,35,25,18,22,30,35,38,40,40,40,38,30,22,20,25,35,40,42,45],
    --   "tue": [...], "wed": [...], "thu": [...], "fri": [...],
    --   "sat": [48,48,47,48,48,45,42,38,35,32,30,30,32,35,38,40,40,38,35,40,42,45,47,48],
    --   "sun": [...]
    -- }
    -- 24 значения = средняя скорость для каждого часа суток (km/h)
    
    -- Real-time данные (обновляются каждые 30 сек)
    current_speed       SMALLINT,       -- Текущая скорость (km/h)
    congestion_level    nav.congestion_level DEFAULT 'free_flow',
    travel_time_s       REAL,           -- Текущее время проезда сегмента (секунды)
    confidence          REAL            DEFAULT 0,  -- 0..1, достоверность данных
    sample_count        INTEGER         DEFAULT 0,  -- Кол-во GPS-проб за последние 5 мин
    
    -- Длина сегмента
    length_m            REAL            NOT NULL,
    
    -- Регион
    region_id           INTEGER         NOT NULL DEFAULT 0,
    
    -- Timestamps
    speed_updated_at    TIMESTAMPTZ,    -- Время последнего обновления скорости
    typical_updated_at  TIMESTAMPTZ,    -- Время последнего обновления типичных скоростей
    created_at          TIMESTAMPTZ     DEFAULT NOW()
);

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX idx_traffic_geometry ON nav.traffic_segments USING GIST (geometry);
CREATE INDEX idx_traffic_road_id ON nav.traffic_segments (road_id);
CREATE INDEX idx_traffic_congestion ON nav.traffic_segments (congestion_level) 
    WHERE congestion_level IN ('heavy', 'severe', 'blocked');
CREATE INDEX idx_traffic_region ON nav.traffic_segments (region_id);
CREATE INDEX idx_traffic_updated ON nav.traffic_segments (speed_updated_at);
CREATE INDEX idx_traffic_road_dir ON nav.traffic_segments (road_id, direction);
```

#### Таблица: `poi` — Точки интереса

```sql
-- ============================================================
-- Таблица: nav.poi
-- Описание: Точки интереса с полной информацией
-- Estimated rows: ~200M (planet), ~15M (Russia), ~2M (Moscow)
-- Estimated size: ~60 GB (planet), ~4.5 GB (Russia), ~600 MB (Moscow)
-- ============================================================

CREATE TYPE nav.poi_category AS ENUM (
    -- Питание
    'restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court',
    -- Магазины
    'supermarket', 'convenience', 'mall', 'clothes', 'electronics', 
    'hardware', 'pharmacy', 'beauty', 'bookshop', 'florist',
    -- Транспорт
    'fuel', 'charging_station', 'parking', 'car_wash', 'car_repair',
    'bus_stop', 'metro_station', 'train_station', 'airport', 'ferry_terminal',
    'taxi_stand', 'bicycle_rental', 'scooter_rental',
    -- Размещение
    'hotel', 'hostel', 'motel', 'guest_house', 'apartment',
    -- Финансы
    'bank', 'atm', 'bureau_de_change', 'insurance',
    -- Здоровье
    'hospital', 'clinic', 'dentist', 'veterinary',
    -- Образование
    'school', 'university', 'kindergarten', 'library',
    -- Развлечения
    'cinema', 'theatre', 'museum', 'park', 'zoo', 'theme_park',
    'sports_centre', 'swimming_pool', 'stadium',
    -- Государственные учреждения
    'police', 'fire_station', 'post_office', 'townhall', 'courthouse',
    'embassy', 'prison',
    -- Религия
    'place_of_worship',
    -- Туризм
    'viewpoint', 'information', 'picnic_site', 'camp_site',
    'attraction', 'monument', 'memorial',
    -- Прочее
    'toilets', 'recycling', 'marketplace', 'other'
);

CREATE TABLE nav.poi (
    id              BIGINT          PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    osm_id          BIGINT,
    external_id     VARCHAR(128),    -- ID из внешнего источника (2GIS, ФИАС, etc.)
    
    -- Геометрия
    geometry        geometry(Point, 4326) NOT NULL,
    
    -- Классификация
    category        nav.poi_category NOT NULL,
    subcategory     VARCHAR(64),     -- Более точная подкатегория
    brand           VARCHAR(128),    -- Бренд: "Пятёрочка", "Макдоналдс"
    brand_wikidata  VARCHAR(16),     -- Wikidata ID бренда: "Q4178147"
    chain           VARCHAR(128),    -- Сеть
    operator        VARCHAR(128),    -- Оператор/владелец
    
    -- Наименование
    name            TEXT             NOT NULL,
    name_ru         TEXT,
    name_en         TEXT,
    name_short      TEXT,            -- Краткое название для тайлов
    description     TEXT,
    
    -- Адрес (структурированный)
    address_country VARCHAR(2),      -- ISO 3166-1 alpha-2: "RU"
    address_region  VARCHAR(128),    -- "Московская область"
    address_city    VARCHAR(128),    -- "Москва"
    address_district VARCHAR(128),   -- "Тверской район"
    address_street  VARCHAR(256),    -- "ул. Тверская"
    address_housenumber VARCHAR(32), -- "13"
    address_postcode VARCHAR(16),    -- "125009"
    address_full    TEXT,            -- Полный адрес строкой
    
    -- Контакты
    phone           TEXT,            -- "+7 (495) 123-45-67"
    phone_alt       TEXT,            -- Дополнительный телефон
    website         TEXT,            -- "https://example.com"
    email           TEXT,
    
    -- Социальные сети
    social_vk       TEXT,
    social_telegram TEXT,
    social_instagram TEXT,
    
    -- Режим работы
    opening_hours   TEXT,            -- OSM-формат: "Mo-Fr 09:00-21:00; Sa 10:00-18:00; Su off"
    opening_hours_parsed JSONB,     -- Разобранный формат для программного доступа
    -- Формат: {"mon": {"open": "09:00", "close": "21:00"}, "tue": {...}, ...}
    
    -- Рейтинг и отзывы
    rating          REAL,            -- 1.0 - 5.0, средний рейтинг
    rating_count    INTEGER          DEFAULT 0,
    review_count    INTEGER          DEFAULT 0,
    
    -- Ценовая категория
    price_level     SMALLINT,        -- 1-4 (₽, ₽₽, ₽₽₽, ₽₽₽₽)
    
    -- Фотографии
    photo_urls      TEXT[],          -- До 20 URL фотографий
    photo_count     INTEGER          DEFAULT 0,
    
    -- Специфические атрибуты по категориям
    cuisine         TEXT[],          -- Для ресторанов: ARRAY['russian', 'italian', 'sushi']
    diet_vegan      BOOLEAN,
    diet_vegetarian BOOLEAN,
    diet_halal      BOOLEAN,
    diet_kosher     BOOLEAN,
    internet_access VARCHAR(16),     -- wlan/wired/terminal/yes/no
    wheelchair      VARCHAR(16),     -- yes/limited/no/designated
    smoking         VARCHAR(16),     -- outside/isolated/no/yes
    air_conditioning BOOLEAN,
    outdoor_seating BOOLEAN,
    delivery        BOOLEAN,
    takeaway        BOOLEAN,
    drive_through   BOOLEAN,
    
    -- Для парковок
    parking_type    VARCHAR(32),     -- surface/underground/multi-storey/roof
    parking_capacity INTEGER,
    parking_fee     BOOLEAN,
    
    -- Для АЗС и зарядных станций
    fuel_types      TEXT[],          -- ARRAY['diesel', 'octane_95', 'octane_98', 'lpg', 'electric']
    socket_types    TEXT[],          -- ARRAY['type2', 'ccs', 'chademo'] для EV
    charging_power  REAL,            -- кВт для EV зарядки
    
    -- Этаж (для indoor navigation)
    floor           SMALLINT,
    building_id     BIGINT,          -- FK → nav.buildings
    
    -- Популярность / вес для сортировки
    popularity      REAL             DEFAULT 0,  -- 0..1, вычисляемая метрика
    importance      REAL             DEFAULT 0,  -- 0..1, для zoom level display threshold
    
    -- Регион
    region_id       INTEGER          NOT NULL DEFAULT 0,
    
    -- Метаданные
    tags            JSONB            DEFAULT '{}',
    source          VARCHAR(32)      DEFAULT 'osm',
    verified        BOOLEAN          DEFAULT FALSE,
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ      DEFAULT NOW(),
    updated_at      TIMESTAMPTZ      DEFAULT NOW()
);

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX idx_poi_geometry ON nav.poi USING GIST (geometry);
CREATE INDEX idx_poi_category ON nav.poi (category);
CREATE INDEX idx_poi_name_trgm ON nav.poi USING GIN (name gin_trgm_ops);
CREATE INDEX idx_poi_name_ru_trgm ON nav.poi USING GIN (name_ru gin_trgm_ops) 
    WHERE name_ru IS NOT NULL;
CREATE INDEX idx_poi_brand ON nav.poi (brand) WHERE brand IS NOT NULL;
CREATE INDEX idx_poi_region ON nav.poi (region_id);
CREATE INDEX idx_poi_category_region ON nav.poi (category, region_id);
CREATE INDEX idx_poi_rating ON nav.poi (rating DESC NULLS LAST) WHERE rating IS NOT NULL;
CREATE INDEX idx_poi_popularity ON nav.poi (popularity DESC);
CREATE INDEX idx_poi_osm_id ON nav.poi (osm_id) WHERE osm_id IS NOT NULL;
CREATE INDEX idx_poi_external ON nav.poi (external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_poi_opening ON nav.poi (id) WHERE opening_hours IS NOT NULL;
CREATE INDEX idx_poi_fuel ON nav.poi (id) WHERE category = 'fuel';
CREATE INDEX idx_poi_charging ON nav.poi (id) WHERE category = 'charging_station';

-- Full-Text Search индекс
CREATE INDEX idx_poi_fts ON nav.poi USING GIN (
    to_tsvector('russian', COALESCE(name, '') || ' ' || 
                            COALESCE(name_ru, '') || ' ' || 
                            COALESCE(address_street, '') || ' ' ||
                            COALESCE(address_city, '') || ' ' ||
                            COALESCE(brand, ''))
);
```

#### Таблица: `buildings` — Здания

```sql
-- ============================================================
-- Таблица: nav.buildings
-- Описание: Здания с 3D-параметрами для визуализации
-- Estimated rows: ~500M (planet), ~30M (Russia), ~3M (Moscow)
-- Estimated size: ~120 GB (planet), ~7 GB (Russia), ~700 MB (Moscow)
-- ============================================================

CREATE TYPE nav.building_type AS ENUM (
    'residential', 'apartments', 'house', 'detached', 'dormitory',
    'commercial', 'office', 'retail', 'industrial', 'warehouse',
    'church', 'mosque', 'synagogue', 'temple',
    'hospital', 'school', 'university', 'kindergarten',
    'hotel', 'government', 'civic', 'public',
    'stadium', 'train_station', 'transportation',
    'garage', 'garages', 'parking',
    'farm', 'barn', 'greenhouse',
    'construction', 'ruins', 'yes', 'other'
);

CREATE TABLE nav.buildings (
    id              BIGINT          PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    osm_id          BIGINT,
    geometry        geometry(Polygon, 4326) NOT NULL,
    
    -- 3D параметры
    height          REAL,            -- Высота здания (метры)
    min_height      REAL             DEFAULT 0,  -- Для зданий на платформах
    levels          SMALLINT,        -- Количество этажей
    min_level       SMALLINT         DEFAULT 0,  -- Подземные этажи
    roof_shape      VARCHAR(32),     -- flat/gabled/hipped/pyramidal/dome/onion
    roof_height     REAL,
    roof_material   VARCHAR(32),
    roof_colour     VARCHAR(32),
    
    -- Классификация
    building_type   nav.building_type DEFAULT 'yes',
    
    -- Наименование и адрес
    name            TEXT,
    name_ru         TEXT,
    
    -- Адрес
    address_street  VARCHAR(256),
    address_housenumber VARCHAR(32),
    address_postcode VARCHAR(16),
    address_city    VARCHAR(128),
    
    -- Визуализация
    colour          VARCHAR(32),     -- Цвет фасада
    material        VARCHAR(32),     -- brick/concrete/glass/wood/stone/metal/plaster
    
    -- Свойства
    wheelchair      VARCHAR(16),
    
    -- Z-ordering
    layer           SMALLINT         DEFAULT 0,
    
    -- Площадь (вычисляемое)
    area_m2         REAL,
    
    -- Регион
    region_id       INTEGER          NOT NULL DEFAULT 0,
    
    -- Метаданные
    tags            JSONB            DEFAULT '{}',
    source          VARCHAR(32)      DEFAULT 'osm',
    updated_at      TIMESTAMPTZ      DEFAULT NOW()
);

-- Автовычисление площади
CREATE OR REPLACE FUNCTION nav.compute_building_area()
RETURNS TRIGGER AS $$
BEGIN
    NEW.area_m2 := ST_Area(NEW.geometry::geography);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_building_area
    BEFORE INSERT OR UPDATE OF geometry ON nav.buildings
    FOR EACH ROW EXECUTE FUNCTION nav.compute_building_area();

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX idx_buildings_geometry ON nav.buildings USING GIST (geometry);
CREATE INDEX idx_buildings_type ON nav.buildings (building_type);
CREATE INDEX idx_buildings_osm ON nav.buildings (osm_id) WHERE osm_id IS NOT NULL;
CREATE INDEX idx_buildings_height ON nav.buildings (height) WHERE height IS NOT NULL;
CREATE INDEX idx_buildings_name ON nav.buildings (name) WHERE name IS NOT NULL;
CREATE INDEX idx_buildings_region ON nav.buildings (region_id);
CREATE INDEX idx_buildings_address ON nav.buildings (address_street, address_housenumber) 
    WHERE address_street IS NOT NULL;
```

#### Таблица: `boundaries` — Административные границы

```sql
-- ============================================================
-- Таблица: nav.boundaries
-- Описание: Административные границы всех уровней
-- Estimated rows: ~400K (planet), ~120K (Russia)
-- Estimated size: ~15 GB (planet), ~3 GB (Russia)
-- ============================================================

CREATE TABLE nav.boundaries (
    id              BIGINT          PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    osm_id          BIGINT,
    geometry        geometry(MultiPolygon, 4326) NOT NULL,
    
    -- Административный уровень (OSM admin_level)
    admin_level     SMALLINT        NOT NULL,
    -- 2 = страна, 3 = федеральный округ, 4 = субъект РФ,
    -- 5 = район/городской округ, 6 = муниципальный район,
    -- 8 = город/посёлок, 9 = район города, 10 = микрорайон
    
    -- Наименование
    name            TEXT            NOT NULL,
    name_ru         TEXT,
    name_en         TEXT,
    name_local      TEXT,
    
    -- Иерархия
    parent_id       BIGINT,          -- FK → nav.boundaries (родительский регион)
    country_code    VARCHAR(2),      -- ISO 3166-1 alpha-2
    iso_3166_2      VARCHAR(8),      -- ISO 3166-2: "RU-MOW", "RU-MOS"
    
    -- Население
    population      INTEGER,
    
    -- Служебные
    capital_node_id BIGINT,          -- FK → nav.nodes, столица/центр
    timezone        VARCHAR(64),     -- "Europe/Moscow"
    
    -- Площадь (вычисляемое)
    area_km2        REAL,
    
    -- Метаданные
    tags            JSONB           DEFAULT '{}',
    source          VARCHAR(32)     DEFAULT 'osm',
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX idx_boundaries_geometry ON nav.boundaries USING GIST (geometry);
CREATE INDEX idx_boundaries_level ON nav.boundaries (admin_level);
CREATE INDEX idx_boundaries_name ON nav.boundaries (name);
CREATE INDEX idx_boundaries_parent ON nav.boundaries (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_boundaries_country ON nav.boundaries (country_code);
CREATE INDEX idx_boundaries_iso ON nav.boundaries (iso_3166_2) WHERE iso_3166_2 IS NOT NULL;
CREATE INDEX idx_boundaries_level_geo ON nav.boundaries USING GIST (geometry) 
    WHERE admin_level IN (2, 4, 6, 8);
```

#### Таблица: `admin_regions` — Иерархия регионов

```sql
-- ============================================================
-- Таблица: nav.admin_regions
-- Описание: Плоская иерархия регионов для быстрого lookup
-- Estimated rows: ~100K (planet), ~30K (Russia)
-- Estimated size: ~50 MB (planet), ~15 MB (Russia)
-- ============================================================

CREATE TABLE nav.admin_regions (
    id              INTEGER         PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    boundary_id     BIGINT          NOT NULL REFERENCES nav.boundaries(id),
    
    -- Иерархия (materialized path)
    path            INTEGER[]       NOT NULL,  -- ARRAY[1, 77, 2456] = Россия > Москва > Тверской р-н
    depth           SMALLINT        NOT NULL,  -- Глубина в иерархии (0 = root)
    
    -- Быстрый доступ к родителям
    country_id      INTEGER,
    region_id_l1    INTEGER,        -- Федеральный округ
    region_id_l2    INTEGER,        -- Субъект
    city_id         INTEGER,        -- Город
    district_id     INTEGER,        -- Район
    
    -- Центроид для быстрого поиска
    centroid        geometry(Point, 4326) NOT NULL,
    bbox            geometry(Polygon, 4326) NOT NULL,
    
    -- Имя (денормализовано)
    name            TEXT            NOT NULL,
    name_ru         TEXT,
    full_name       TEXT,           -- "Россия > Москва > Тверской район"
    
    -- Навигационные данные
    default_zoom    SMALLINT,       -- Zoom level для отображения по умолчанию
    tile_count_z14  INTEGER,        -- Количество тайлов на zoom 14 для pre-generation
    
    -- Data stats
    road_count      INTEGER         DEFAULT 0,
    poi_count       INTEGER         DEFAULT 0,
    building_count  INTEGER         DEFAULT 0,
    
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX idx_admin_centroid ON nav.admin_regions USING GIST (centroid);
CREATE INDEX idx_admin_bbox ON nav.admin_regions USING GIST (bbox);
CREATE INDEX idx_admin_country ON nav.admin_regions (country_id);
CREATE INDEX idx_admin_path ON nav.admin_regions USING GIN (path);
CREATE INDEX idx_admin_name ON nav.admin_regions (name);
CREATE INDEX idx_admin_boundary ON nav.admin_regions (boundary_id);
```

#### Таблица: `road_surfaces` — Покрытия дорог

```sql
-- ============================================================
-- Таблица: nav.road_surfaces
-- Описание: Детальная информация о состоянии дорожного покрытия
-- Estimated rows: ~15M (Russia), ~2M (Moscow)
-- Estimated size: ~2 GB (Russia), ~250 MB (Moscow)
-- ============================================================

CREATE TYPE nav.surface_condition AS ENUM (
    'excellent',    -- Новое покрытие
    'good',         -- Хорошее состояние
    'fair',         -- Удовлетворительное (мелкие дефекты)
    'poor',         -- Плохое (трещины, ямы)
    'very_poor',    -- Очень плохое
    'impassable'    -- Непроездное
);

CREATE TABLE nav.road_surfaces (
    id              BIGINT          PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    road_id         BIGINT          NOT NULL,   -- FK → nav.roads
    
    -- Тип покрытия
    surface_type    nav.surface_type NOT NULL,
    surface_condition nav.surface_condition DEFAULT 'fair',
    
    -- Числовые оценки
    iri_value       REAL,            -- International Roughness Index (м/км)
                                     -- < 2.0 = отлично, 2-4 = хорошо, 4-6 = удовл., > 6 = плохо
    pci_value       REAL,            -- Pavement Condition Index (0-100)
    
    -- Скоростной множитель
    speed_factor    REAL             DEFAULT 1.0, -- 0.1..1.0 (1=нет влияния, 0.1=почти непроездная)
    
    -- Сезонные ограничения
    seasonal_access TEXT,            -- "Apr 15 - Oct 31" для грунтовых дорог
    flood_risk      BOOLEAN          DEFAULT FALSE,
    
    -- Дата оценки
    surveyed_at     DATE,
    surveyed_by     VARCHAR(64),     -- 'osm_user', 'rosavtodor', 'ai_satellite', 'user_report'
    
    -- Метаданные
    source          VARCHAR(32)     DEFAULT 'osm',
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX idx_road_surfaces_road ON nav.road_surfaces (road_id);
CREATE INDEX idx_road_surfaces_condition ON nav.road_surfaces (surface_condition) 
    WHERE surface_condition IN ('poor', 'very_poor', 'impassable');
CREATE INDEX idx_road_surfaces_speed ON nav.road_surfaces (speed_factor) 
    WHERE speed_factor < 0.8;
```

#### Таблица: `parking` — Парковки

```sql
-- ============================================================
-- Таблица: nav.parking
-- Описание: Парковки с полной информацией о доступности и стоимости
-- Estimated rows: ~5M (planet), ~500K (Russia), ~100K (Moscow)
-- Estimated size: ~1.5 GB (planet), ~150 MB (Russia), ~30 MB (Moscow)
-- ============================================================

CREATE TYPE nav.parking_type AS ENUM (
    'surface',          -- Наземная открытая
    'underground',      -- Подземная
    'multi_storey',     -- Многоуровневая
    'roof',             -- Крышная
    'street_side',      -- Парковка вдоль дороги
    'lane'              -- Выделенная полоса для парковки
);

CREATE TABLE nav.parking (
    id              BIGINT          PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    osm_id          BIGINT,
    geometry        geometry(Geometry, 4326) NOT NULL,  -- Point или Polygon
    
    -- Классификация
    parking_type    nav.parking_type NOT NULL DEFAULT 'surface',
    access          nav.access_type  DEFAULT 'yes',
    
    -- Вместимость
    capacity        INTEGER,         -- Общее количество мест
    capacity_disabled INTEGER,      -- Места для инвалидов
    capacity_ev     INTEGER,        -- Места с зарядкой EV
    capacity_women  INTEGER,        -- Женские парковочные места
    
    -- Наименование
    name            TEXT,
    operator        VARCHAR(128),    -- "Московский паркинг", "Парк-Сити"
    
    -- Стоимость
    fee             BOOLEAN          DEFAULT FALSE,
    fee_amount      JSONB,          -- {"hourly": 200, "daily": 1500, "monthly": 15000, "currency": "RUB"}
    payment_methods TEXT[],         -- ARRAY['cash', 'card', 'app', 'sms']
    
    -- Режим работы
    opening_hours   TEXT,            -- OSM-формат
    
    -- Ограничения
    maxheight       REAL,            -- Максимальная высота (м)
    maxweight       REAL,            -- Максимальный вес (т)
    max_stay        TEXT,            -- "2h", "overnight", "unlimited"
    
    -- Удобства
    covered         BOOLEAN          DEFAULT FALSE,
    lit             BOOLEAN,
    surveillance    BOOLEAN,
    
    -- Real-time (если поддерживается)
    available_spots INTEGER,        -- Текущее кол-во свободных мест
    occupancy_pct   REAL,           -- % заполненности (0..100)
    spots_updated_at TIMESTAMPTZ,
    
    -- Регион
    region_id       INTEGER         NOT NULL DEFAULT 0,
    
    -- Метаданные
    source          VARCHAR(32)     DEFAULT 'osm',
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX idx_parking_geometry ON nav.parking USING GIST (geometry);
CREATE INDEX idx_parking_type ON nav.parking (parking_type);
CREATE INDEX idx_parking_fee ON nav.parking (fee);
CREATE INDEX idx_parking_region ON nav.parking (region_id);
CREATE INDEX idx_parking_capacity ON nav.parking (capacity) WHERE capacity IS NOT NULL;
CREATE INDEX idx_parking_available ON nav.parking (available_spots) WHERE available_spots IS NOT NULL;
```

#### Таблица: `charging_stations` — Зарядные станции EV

```sql
-- ============================================================
-- Таблица: nav.charging_stations
-- Описание: Зарядные станции для электромобилей
-- Estimated rows: ~500K (planet), ~15K (Russia), ~5K (Moscow)
-- Estimated size: ~150 MB (planet), ~5 MB (Russia), ~2 MB (Moscow)
-- ============================================================

CREATE TABLE nav.charging_stations (
    id              BIGINT          PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    osm_id          BIGINT,
    geometry        geometry(Point, 4326) NOT NULL,
    
    -- Наименование и оператор
    name            TEXT,
    operator        VARCHAR(128),    -- "Московская зарядная сеть", "Tesla Supercharger"
    network         VARCHAR(128),    -- Сеть: "Charge Point", "ENEL X"
    brand           VARCHAR(128),
    
    -- Разъёмы
    socket_types    JSONB           NOT NULL DEFAULT '[]',
    -- Формат: [
    --   {"type": "type2", "power_kw": 22, "voltage": 400, "amperage": 32, "count": 2},
    --   {"type": "ccs", "power_kw": 150, "voltage": 500, "amperage": 300, "count": 1},
    --   {"type": "chademo", "power_kw": 50, "voltage": 500, "amperage": 125, "count": 1}
    -- ]
    
    -- Максимальная мощность
    max_power_kw    REAL,            -- Максимальная мощность (кВт)
    
    -- Количество постов
    capacity        SMALLINT        DEFAULT 1,
    
    -- Доступ и стоимость
    access          nav.access_type  DEFAULT 'yes',
    fee             BOOLEAN          DEFAULT TRUE,
    fee_per_kwh     JSONB,          -- {"amount": 15, "currency": "RUB"} за кВт·ч
    fee_per_minute  JSONB,          -- {"amount": 3, "currency": "RUB"} за минуту
    authentication  TEXT[],          -- ARRAY['app', 'rfid', 'plug_and_charge', 'credit_card']
    
    -- Режим работы
    opening_hours   TEXT,            -- "24/7" или OSM-формат
    
    -- Real-time статус
    status          VARCHAR(16)     DEFAULT 'unknown',  -- available/occupied/out_of_service/unknown
    available_count SMALLINT,
    status_updated_at TIMESTAMPTZ,
    
    -- Регион
    region_id       INTEGER         NOT NULL DEFAULT 0,
    
    -- Метаданные
    source          VARCHAR(32)     DEFAULT 'osm',
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX idx_charging_geometry ON nav.charging_stations USING GIST (geometry);
CREATE INDEX idx_charging_operator ON nav.charging_stations (operator) WHERE operator IS NOT NULL;
CREATE INDEX idx_charging_power ON nav.charging_stations (max_power_kw);
CREATE INDEX idx_charging_status ON nav.charging_stations (status);
CREATE INDEX idx_charging_region ON nav.charging_stations (region_id);
CREATE INDEX idx_charging_socket ON nav.charging_stations USING GIN (socket_types);
```

#### Таблица: `speed_cameras` — Камеры скорости

```sql
-- ============================================================
-- Таблица: nav.speed_cameras
-- Описание: Камеры контроля скорости и нарушений ПДД
-- Estimated rows: ~2M (planet), ~300K (Russia), ~50K (Moscow)
-- Estimated size: ~300 MB (planet), ~50 MB (Russia), ~8 MB (Moscow)
-- ============================================================

CREATE TYPE nav.camera_type AS ENUM (
    'speed',            -- Контроль скорости (стационарная)
    'speed_mobile',     -- Мобильная камера скорости (треноги)
    'red_light',        -- Контроль проезда на красный
    'bus_lane',         -- Контроль полосы для ОТ
    'average_speed',    -- Средняя скорость на участке
    'traffic_signals',  -- Контроль светофоров
    'section',          -- Секционный контроль (начало-конец)
    'weight',           -- Весовой контроль
    'toll',             -- Контроль оплаты проезда
    'multifunctional'   -- Многофункциональная
);

CREATE TABLE nav.speed_cameras (
    id              BIGINT          PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    geometry        geometry(Point, 4326) NOT NULL,
    
    -- Тип камеры
    camera_type     nav.camera_type  NOT NULL DEFAULT 'speed',
    
    -- Направление
    direction       REAL,            -- Азимут направления камеры (0-360°)
    road_id         BIGINT,          -- FK → nav.roads
    
    -- Параметры контроля
    speed_limit     SMALLINT,        -- Скоростной лимит на данном участке
    section_end_id  BIGINT,          -- Для секционного контроля: id конечной камеры
    
    -- Расположение
    road_name       TEXT,
    description     TEXT,            -- "Варшавское шоссе, 23 км от МКАД"
    
    -- Модель и характеристики
    model           VARCHAR(64),     -- "Стрелка-СТ", "Автодория", "Крис-П"
    bilateral       BOOLEAN          DEFAULT FALSE,  -- Двусторонняя (контроль обоих направлений)
    
    -- Статус
    active          BOOLEAN          DEFAULT TRUE,
    confirmed       BOOLEAN          DEFAULT FALSE,  -- Подтверждено пользователями
    report_count    INTEGER          DEFAULT 0,      -- Кол-во подтверждений от пользователей
    
    -- Регион
    region_id       INTEGER         NOT NULL DEFAULT 0,
    
    -- Метаданные
    source          VARCHAR(32)     DEFAULT 'user_report',  -- gibdd/osm/user_report
    first_reported  TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX idx_cameras_geometry ON nav.speed_cameras USING GIST (geometry);
CREATE INDEX idx_cameras_type ON nav.speed_cameras (camera_type);
CREATE INDEX idx_cameras_road ON nav.speed_cameras (road_id) WHERE road_id IS NOT NULL;
CREATE INDEX idx_cameras_active ON nav.speed_cameras (id) WHERE active = TRUE;
CREATE INDEX idx_cameras_region ON nav.speed_cameras (region_id);
```

#### Таблица: `gas_stations` — АЗС с ценами

```sql
-- ============================================================
-- Таблица: nav.gas_stations
-- Описание: Автозаправочные станции с актуальными ценами
-- Estimated rows: ~1M (planet), ~50K (Russia), ~5K (Moscow)
-- Estimated size: ~200 MB (planet), ~10 MB (Russia), ~1 MB (Moscow)
-- ============================================================

CREATE TABLE nav.gas_stations (
    id              BIGINT          PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    osm_id          BIGINT,
    poi_id          BIGINT          REFERENCES nav.poi(id),
    geometry        geometry(Point, 4326) NOT NULL,
    
    -- Бренд
    name            TEXT,
    brand           VARCHAR(128),    -- "Лукойл", "Газпромнефть", "Shell", "BP"
    operator        VARCHAR(128),
    
    -- Доступные виды топлива и цены
    fuel_prices     JSONB           DEFAULT '{}',
    -- Формат: {
    --   "ai_92":     {"price": 52.40, "currency": "RUB", "updated": "2026-03-06T10:00:00Z"},
    --   "ai_95":     {"price": 56.80, "currency": "RUB", "updated": "2026-03-06T10:00:00Z"},
    --   "ai_98":     {"price": 65.20, "currency": "RUB", "updated": "2026-03-06T10:00:00Z"},
    --   "ai_100":    {"price": 72.50, "currency": "RUB", "updated": "2026-03-06T10:00:00Z"},
    --   "diesel":    {"price": 62.10, "currency": "RUB", "updated": "2026-03-06T10:00:00Z"},
    --   "diesel_premium": {"price": 68.90, "currency": "RUB", "updated": "2026-03-06T10:00:00Z"},
    --   "lpg":       {"price": 28.50, "currency": "RUB", "updated": "2026-03-06T10:00:00Z"},
    --   "cng":       {"price": 22.00, "currency": "RUB", "updated": "2026-03-06T10:00:00Z"}
    -- }
    
    -- Удобства
    has_shop        BOOLEAN          DEFAULT FALSE,
    has_car_wash    BOOLEAN          DEFAULT FALSE,
    has_cafe        BOOLEAN          DEFAULT FALSE,
    has_toilets     BOOLEAN          DEFAULT FALSE,
    has_air_pump    BOOLEAN          DEFAULT FALSE,
    has_ev_charging BOOLEAN          DEFAULT FALSE,  -- Если есть также зарядка EV
    
    -- Самообслуживание
    self_service    BOOLEAN,
    
    -- Оплата
    payment_methods TEXT[],         -- ARRAY['cash', 'card', 'app', 'loyalty_card']
    
    -- Режим работы
    opening_hours   TEXT,
    
    -- Регион
    region_id       INTEGER         NOT NULL DEFAULT 0,
    
    -- Метаданные
    source          VARCHAR(32)     DEFAULT 'osm',
    prices_updated_at TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- ==================== ИНДЕКСЫ ====================
CREATE INDEX idx_gas_geometry ON nav.gas_stations USING GIST (geometry);
CREATE INDEX idx_gas_brand ON nav.gas_stations (brand) WHERE brand IS NOT NULL;
CREATE INDEX idx_gas_region ON nav.gas_stations (region_id);
CREATE INDEX idx_gas_prices ON nav.gas_stations USING GIN (fuel_prices);
CREATE INDEX idx_gas_ev ON nav.gas_stations (id) WHERE has_ev_charging = TRUE;
```

#### Сводная таблица размеров БД

| Таблица | Rows (Moscow) | Size (Moscow) | Rows (Russia) | Size (Russia) | Rows (Planet) | Size (Planet) |
|---------|-------------|--------------|--------------|--------------|--------------|--------------|
| `roads` | 800K | 300 MB | 8M | 3 GB | 120M | 45 GB |
| `nodes` | 2M | 200 MB | 20M | 2 GB | 250M | 25 GB |
| `intersections` | 350K | 55 MB | 3M | 500 MB | 50M | 8 GB |
| `turn_restrictions` | 60K | 10 MB | 400K | 65 MB | 5M | 800 MB |
| `speed_limits` | 250K | 35 MB | 2M | 300 MB | 30M | 4 GB |
| `traffic_segments` | 600K | 260 MB | 5M | 2.2 GB | 80M | 35 GB |
| `poi` | 2M | 600 MB | 15M | 4.5 GB | 200M | 60 GB |
| `buildings` | 3M | 700 MB | 30M | 7 GB | 500M | 120 GB |
| `boundaries` | 5K | 50 MB | 120K | 3 GB | 400K | 15 GB |
| `admin_regions` | 2K | 5 MB | 30K | 15 MB | 100K | 50 MB |
| `road_surfaces` | 2M | 250 MB | 15M | 2 GB | — | — |
| `parking` | 100K | 30 MB | 500K | 150 MB | 5M | 1.5 GB |
| `charging_stations` | 5K | 2 MB | 15K | 5 MB | 500K | 150 MB |
| `speed_cameras` | 50K | 8 MB | 300K | 50 MB | 2M | 300 MB |
| `gas_stations` | 5K | 1 MB | 50K | 10 MB | 1M | 200 MB |
| **ИТОГО** | **~9.2M** | **~2.5 GB** | **~99M** | **~25 GB** | **~1.24B** | **~315 GB** |

---

### 2.3 Pipeline обработки OSM данных

#### 2.3.1 Основной pipeline

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ planet.osm  │────►│ osmium       │────►│ osm2pgsql    │────►│ PostgreSQL   │
│ .pbf (72GB) │     │ extract      │     │ import       │     │ + PostGIS    │
│ Weekly      │     │ (по регионам)│     │ (flex output)│     │ nav схема    │
└─────────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                      │
                    ┌──────────────┐     ┌──────────────┐            │
                    │ Data Quality │◄────│ Post-import  │◄───────────┘
                    │ Validation   │     │ Processing   │
                    └──────┬───────┘     └──────────────┘
                           │
                    ┌──────▼───────┐     ┌──────────────┐
                    │ Graph Build  │────►│ Valhalla     │
                    │ (routing     │     │ Tile Build   │
                    │  graph)      │     │              │
                    └──────────────┘     └──────────────┘
```

#### 2.3.2 osmium extract — nарезка по регионам

```bash
#!/bin/bash
# scripts/osm/extract_regions.sh
# Нарезка planet.osm.pbf на региональные экстракты

PLANET_PBF="/data/osm/planet-latest.osm.pbf"
OUTPUT_DIR="/data/osm/extracts"

# Конфигурация регионов (BBox: min_lon, min_lat, max_lon, max_lat)
# Москва и МО
osmium extract \
    --bbox 35.0,54.0,40.0,57.0 \
    --strategy smart \
    --output "${OUTPUT_DIR}/moscow-region.osm.pbf" \
    --overwrite \
    "${PLANET_PBF}"

# Санкт-Петербург и ЛО
osmium extract \
    --bbox 28.0,58.5,32.5,61.5 \
    --strategy smart \
    --output "${OUTPUT_DIR}/spb-region.osm.pbf" \
    --overwrite \
    "${PLANET_PBF}"

# Вся Россия (через poly-файл)
osmium extract \
    --polygon /data/osm/poly/russia.poly \
    --strategy smart \
    --output "${OUTPUT_DIR}/russia.osm.pbf" \
    --overwrite \
    "${PLANET_PBF}"

echo "Extraction complete."
echo "moscow-region: $(du -h ${OUTPUT_DIR}/moscow-region.osm.pbf | cut -f1)"
echo "spb-region: $(du -h ${OUTPUT_DIR}/spb-region.osm.pbf | cut -f1)"
echo "russia: $(du -h ${OUTPUT_DIR}/russia.osm.pbf | cut -f1)"
```

#### 2.3.3 osm2pgsql конфигурация (Flex output)

```lua
-- config/osm2pgsql/nav-flex.lua
-- osm2pgsql Flex output configuration для навигационного модуля
-- Запуск: osm2pgsql -d nav_db -S nav-flex.lua --slim -C 16000 russia.osm.pbf

-- ==================== ТАБЛИЦЫ ====================

local roads = osm2pgsql.define_way_table('roads', {
    { column = 'osm_id', sql_type = 'bigint', create_only = true },
    { column = 'geometry', type = 'linestring', projection = 4326, not_null = true },
    { column = 'road_class', type = 'text' },
    { column = 'road_ref', type = 'text' },
    { column = 'name', type = 'text' },
    { column = 'name_ru', type = 'text' },
    { column = 'name_en', type = 'text' },
    { column = 'max_speed', sql_type = 'smallint' },
    { column = 'lanes', sql_type = 'smallint' },
    { column = 'oneway', sql_type = 'smallint' },
    { column = 'surface', type = 'text' },
    { column = 'bridge', type = 'boolean' },
    { column = 'tunnel', type = 'boolean' },
    { column = 'toll', type = 'boolean' },
    { column = 'access', type = 'text' },
    { column = 'width', sql_type = 'real' },
    { column = 'lit', type = 'boolean' },
    { column = 'sidewalk', type = 'text' },
    { column = 'cycleway', type = 'text' },
    { column = 'maxheight', sql_type = 'real' },
    { column = 'maxweight', sql_type = 'real' },
    { column = 'layer', sql_type = 'smallint' },
    { column = 'z_order', sql_type = 'int' },
    { column = 'turn_lanes_forward', type = 'text' },
    { column = 'turn_lanes_backward', type = 'text' },
    { column = 'junction', type = 'text' },
    { column = 'tags', type = 'jsonb' },
    { column = 'region_id', sql_type = 'int' },
})

local nodes_table = osm2pgsql.define_node_table('nodes', {
    { column = 'osm_id', sql_type = 'bigint', create_only = true },
    { column = 'geometry', type = 'point', projection = 4326, not_null = true },
    { column = 'barrier', type = 'text' },
    { column = 'crossing', type = 'text' },
    { column = 'traffic_signals', type = 'boolean' },
    { column = 'tags', type = 'jsonb' },
    { column = 'region_id', sql_type = 'int' },
})

local poi_table = osm2pgsql.define_table({
    name = 'poi_import',
    ids = { type = 'any', type_column = 'osm_type' },
    columns = {
        { column = 'osm_id', sql_type = 'bigint' },
        { column = 'geometry', type = 'point', projection = 4326, not_null = true },
        { column = 'category', type = 'text' },
        { column = 'name', type = 'text' },
        { column = 'name_ru', type = 'text' },
        { column = 'name_en', type = 'text' },
        { column = 'brand', type = 'text' },
        { column = 'opening_hours', type = 'text' },
        { column = 'phone', type = 'text' },
        { column = 'website', type = 'text' },
        { column = 'cuisine', type = 'text' },
        { column = 'wheelchair', type = 'text' },
        { column = 'tags', type = 'jsonb' },
        { column = 'region_id', sql_type = 'int' },
    }
})

local buildings_table = osm2pgsql.define_way_table('buildings_import', {
    { column = 'osm_id', sql_type = 'bigint', create_only = true },
    { column = 'geometry', type = 'polygon', projection = 4326, not_null = true },
    { column = 'height', sql_type = 'real' },
    { column = 'levels', sql_type = 'smallint' },
    { column = 'building_type', type = 'text' },
    { column = 'name', type = 'text' },
    { column = 'address_street', type = 'text' },
    { column = 'address_housenumber', type = 'text' },
    { column = 'tags', type = 'jsonb' },
    { column = 'region_id', sql_type = 'int' },
})

-- ==================== Z_ORDER LOOKUP ====================

local z_order_lookup = {
    motorway = 380,
    motorway_link = 370,
    trunk = 360,
    trunk_link = 350,
    primary = 330,
    primary_link = 320,
    secondary = 310,
    secondary_link = 300,
    tertiary = 290,
    tertiary_link = 280,
    residential = 260,
    living_street = 250,
    unclassified = 240,
    service = 230,
    track = 100,
    path = 90,
    footway = 80,
    cycleway = 85,
    pedestrian = 75,
    steps = 70,
}

-- ==================== HELPER FUNCTIONS ====================

local highway_types = {
    'motorway', 'motorway_link', 'trunk', 'trunk_link',
    'primary', 'primary_link', 'secondary', 'secondary_link',
    'tertiary', 'tertiary_link', 'residential', 'living_street',
    'service', 'unclassified', 'track', 'path', 'footway',
    'cycleway', 'pedestrian', 'steps', 'construction', 'proposed'
}

local function is_highway(tags)
    local hw = tags.highway
    if not hw then return false end
    for _, v in ipairs(highway_types) do
        if hw == v then return true end
    end
    return false
end

local function parse_speed(val)
    if not val then return nil end
    local num = tonumber(val)
    if num then return num end
    -- Обработка "50 mph" → 80
    local mph = string.match(val, '(%d+)%s*mph')
    if mph then return math.floor(tonumber(mph) * 1.60934) end
    -- Обработка "RU:urban" и подобных
    local presets = {
        ['RU:urban'] = 60,
        ['RU:rural'] = 90,
        ['RU:motorway'] = 110,
        ['RU:living_street'] = 20,
    }
    return presets[val]
end

local function parse_oneway(tags)
    if tags.oneway == 'yes' or tags.oneway == '1' then return 1 end
    if tags.oneway == '-1' or tags.oneway == 'reverse' then return -1 end
    if tags.junction == 'roundabout' then return 1 end
    if tags.highway == 'motorway' then return 1 end
    return 0
end

local function parse_boolean(val)
    if val == 'yes' or val == '1' or val == 'true' then return true end
    if val == 'no' or val == '0' or val == 'false' then return false end
    return nil
end

local function region_from_point(lon, lat)
    -- Упрощённое определение региона по координатам
    -- В production используется PostGIS ST_Within с полигонами регионов
    if lon >= 36.8 and lon <= 38.0 and lat >= 55.1 and lat <= 56.1 then return 77 end  -- Москва
    if lon >= 29.4 and lon <= 30.8 and lat >= 59.7 and lat <= 60.2 then return 78 end  -- СПб
    return 0
end

-- ==================== PROCESS FUNCTIONS ====================

function osm2pgsql.process_way(object)
    local tags = object.tags
    
    -- Roads
    if is_highway(tags) then
        local layer = tonumber(tags.layer) or 0
        local z = z_order_lookup[tags.highway] or 0
        if tags.bridge then z = z + 10 end
        if tags.tunnel then z = z - 10 end
        z = z + layer * 10
        
        roads:insert({
            osm_id = object.id,
            geometry = object:as_linestring(),
            road_class = tags.highway,
            road_ref = tags.ref,
            name = tags.name,
            name_ru = tags['name:ru'],
            name_en = tags['name:en'],
            max_speed = parse_speed(tags.maxspeed),
            lanes = tonumber(tags.lanes),
            oneway = parse_oneway(tags),
            surface = tags.surface,
            bridge = parse_boolean(tags.bridge),
            tunnel = parse_boolean(tags.tunnel),
            toll = parse_boolean(tags.toll),
            access = tags.access,
            width = tonumber(tags.width),
            lit = parse_boolean(tags.lit),
            sidewalk = tags.sidewalk,
            cycleway = tags.cycleway,
            maxheight = tonumber(tags.maxheight),
            maxweight = tonumber(tags.maxweight),
            layer = layer,
            z_order = z,
            turn_lanes_forward = tags['turn:lanes:forward'],
            turn_lanes_backward = tags['turn:lanes:backward'],
            junction = tags.junction,
            tags = tags,
            region_id = 0,  -- Вычисляется post-import через ST_Within
        })
    end
    
    -- Buildings
    if tags.building then
        buildings_table:insert({
            osm_id = object.id,
            geometry = object:as_polygon(),
            height = tonumber(tags.height) or tonumber(tags['building:height']),
            levels = tonumber(tags['building:levels']),
            building_type = tags.building,
            name = tags.name,
            address_street = tags['addr:street'],
            address_housenumber = tags['addr:housenumber'],
            tags = tags,
            region_id = 0,
        })
    end
end

function osm2pgsql.process_node(object)
    local tags = object.tags
    
    -- Nodes с навигационной значимостью
    if tags.highway == 'traffic_signals' or tags.barrier or tags.highway == 'crossing'
       or tags.highway == 'stop' or tags.highway == 'give_way'
       or tags.highway == 'mini_roundabout' then
        nodes_table:insert({
            osm_id = object.id,
            geometry = object:as_point(),
            barrier = tags.barrier,
            crossing = tags.crossing,
            traffic_signals = (tags.highway == 'traffic_signals'),
            tags = tags,
            region_id = 0,
        })
    end
    
    -- POI из nodes
    if tags.amenity or tags.shop or tags.tourism or tags.leisure then
        local cat = tags.amenity or tags.shop or tags.tourism or tags.leisure
        poi_table:insert({
            osm_id = object.id,
            geometry = object:as_point(),
            category = cat,
            name = tags.name,
            name_ru = tags['name:ru'],
            name_en = tags['name:en'],
            brand = tags.brand,
            opening_hours = tags.opening_hours,
            phone = tags.phone or tags['contact:phone'],
            website = tags.website or tags['contact:website'],
            cuisine = tags.cuisine,
            wheelchair = tags.wheelchair,
            tags = tags,
            region_id = 0,
        })
    end
end
```

#### 2.3.4 Команда запуска импорта

```bash
#!/bin/bash
# scripts/osm/import_osm.sh
# Полный импорт OSM данных в PostgreSQL

set -euo pipefail

DB_NAME="nav_db"
DB_USER="nav_admin"
DB_HOST="localhost"
OSM_FILE="/data/osm/extracts/russia.osm.pbf"
STYLE_FILE="/opt/nav/config/osm2pgsql/nav-flex.lua"
CACHE_MB=16000  # 16 GB RAM cache для osm2pgsql
WORKERS=8       # Параллельные потоки

echo "=== Начало импорта OSM: $(date) ==="
echo "Файл: ${OSM_FILE}"
echo "БД: ${DB_NAME}"
echo "Cache: ${CACHE_MB} MB"
echo "Workers: ${WORKERS}"

# Шаг 1: Создание extensions
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
    CREATE EXTENSION IF NOT EXISTS postgis;
    CREATE EXTENSION IF NOT EXISTS postgis_topology;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS btree_gist;
    CREATE EXTENSION IF NOT EXISTS hstore;
    CREATE SCHEMA IF NOT EXISTS nav;
"

# Шаг 2: Импорт через osm2pgsql (Flex output)
osm2pgsql \
    --database="${DB_NAME}" \
    --user="${DB_USER}" \
    --host="${DB_HOST}" \
    --output=flex \
    --style="${STYLE_FILE}" \
    --slim \
    --cache="${CACHE_MB}" \
    --number-processes="${WORKERS}" \
    --log-progress=true \
    --flat-nodes="/data/osm/nodes.cache" \
    "${OSM_FILE}"

echo "=== Импорт OSM завершён: $(date) ==="

# Шаг 3: Post-import processing
echo "=== Post-import processing ==="

# Присвоение region_id через пространственный join
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
    UPDATE nav.roads r
    SET region_id = COALESCE(
        (SELECT ar.id FROM nav.boundaries ar 
         WHERE ar.admin_level = 4 
         AND ST_Intersects(r.geometry, ar.geometry) 
         LIMIT 1),
        0
    )
    WHERE r.region_id = 0;
"

# Вычисление длин дорог
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
    UPDATE nav.roads SET length_m = ST_Length(geometry::geography);
"

# Генерация intersections
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
    INSERT INTO nav.intersections (node_id, geometry, type, approach_count, region_id)
    SELECT 
        n.id,
        n.geometry,
        CASE 
            WHEN n.traffic_signals THEN 'traffic_signals'
            ELSE 'simple'
        END::nav.intersection_type,
        COUNT(DISTINCT r.id)::smallint,
        n.region_id
    FROM nav.nodes n
    JOIN nav.roads r ON ST_DWithin(n.geometry, r.geometry, 0.00005)
    WHERE n.road_count >= 3 OR n.traffic_signals = TRUE
    GROUP BY n.id, n.geometry, n.traffic_signals, n.region_id
    HAVING COUNT(DISTINCT r.id) >= 3;
"

echo "=== Post-import завершён: $(date) ==="

# Шаг 4: VACUUM ANALYZE
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
    VACUUM ANALYZE nav.roads;
    VACUUM ANALYZE nav.nodes;
    VACUUM ANALYZE nav.intersections;
    VACUUM ANALYZE nav.poi;
    VACUUM ANALYZE nav.buildings;
"

echo "=== Import pipeline complete: $(date) ==="
```

#### 2.3.5 Incremental Updates (ежеминутные)

```bash
#!/bin/bash
# scripts/osm/incremental_update.sh
# Запускается по cron: * * * * * /opt/nav/scripts/osm/incremental_update.sh
# Применяет ежеминутные дифференциальные обновления OSM

set -euo pipefail

WORKDIR="/data/osm/replication"
DB_NAME="nav_db"
DB_USER="nav_admin"
STATE_FILE="${WORKDIR}/state.txt"
LOCK_FILE="/tmp/osm_update.lock"

# Mutex — не запускать параллельно
exec 200>"${LOCK_FILE}"
flock -n 200 || { echo "Previous update still running, skipping."; exit 0; }

# Скачивание и применение дифа
osmium derive-changes \
    --server="https://planet.openstreetmap.org/replication/minute" \
    --state-file="${STATE_FILE}" \
    --output="${WORKDIR}/changes.osc.gz" \
    --overwrite

# Применение через osm2pgsql в append mode
osm2pgsql \
    --database="${DB_NAME}" \
    --user="${DB_USER}" \
    --output=flex \
    --style="/opt/nav/config/osm2pgsql/nav-flex.lua" \
    --slim \
    --append \
    --flat-nodes="/data/osm/nodes.cache" \
    "${WORKDIR}/changes.osc.gz"

# Обновление статистик для изменённых таблиц
psql -U $DB_USER -d $DB_NAME -c "
    ANALYZE nav.roads;
    ANALYZE nav.nodes;
"

echo "$(date): Applied OSM diff successfully." >> /var/log/nav/osm_updates.log
```

#### 2.3.6 Cron-расписание

```cron
# /etc/cron.d/nav-osm-updates

# Ежеминутные инкрементальные обновления OSM
* * * * * nav /opt/nav/scripts/osm/incremental_update.sh >> /var/log/nav/cron_osm.log 2>&1

# Еженедельный полный reimport (воскресенье 03:00 UTC)
0 3 * * 0 nav /opt/nav/scripts/osm/full_reimport.sh >> /var/log/nav/cron_reimport.log 2>&1

# Ежедневная валидация данных (ночь 02:00 UTC)
0 2 * * * nav /opt/nav/scripts/osm/validate_data.sh >> /var/log/nav/cron_validate.log 2>&1

# Ежедневный VACUUM (ночь 04:00 UTC)
0 4 * * * nav psql -U nav_admin -d nav_db -c "VACUUM ANALYZE;" >> /var/log/nav/cron_vacuum.log 2>&1

# Еженедельная перегенерация Valhalla tile graph (воскресенье 06:00 UTC)
0 6 * * 0 nav /opt/nav/scripts/routing/rebuild_valhalla_tiles.sh >> /var/log/nav/cron_valhalla.log 2>&1

# Ежедневное обновление елевации из SRTM (ночь 01:00 UTC)
0 1 * * * nav /opt/nav/scripts/osm/update_elevation.sh >> /var/log/nav/cron_elevation.log 2>&1

# Обновление цен на АЗС (каждые 6 часов)
0 */6 * * * nav /opt/nav/scripts/poi/update_gas_prices.sh >> /var/log/nav/cron_gas.log 2>&1

# Обновление данных ФИАС (1-е число каждого месяца)
0 5 1 * * nav /opt/nav/scripts/government/import_fias.sh >> /var/log/nav/cron_fias.log 2>&1
```

---

### 2.4 Spatial Indexing

#### 2.4.1 R-tree в PostGIS (GiST)

PostGIS по умолчанию использует R-tree через GiST-индексы. Это основной пространственный индекс для всех гео-запросов.

**Параметры R-tree в PostGIS:**
```sql
-- Стандартный GiST-индекс (R-tree)
CREATE INDEX idx_roads_geometry_gist ON nav.roads USING GIST (geometry);

-- С параметром fillfactor для write-heavy таблиц
CREATE INDEX idx_traffic_geometry ON nav.traffic_segments 
    USING GIST (geometry) WITH (fillfactor = 90);

-- Пример запроса: все дороги в BBox
EXPLAIN ANALYZE
SELECT id, name, road_class, ST_AsGeoJSON(geometry) 
FROM nav.roads
WHERE geometry && ST_MakeEnvelope(37.5, 55.7, 37.7, 55.8, 4326)
  AND road_class IN ('primary', 'secondary', 'tertiary', 'residential');
-- Index Scan using idx_roads_geometry_gist: ~2ms для Moscow viewport

-- Пример запроса: ближайшие 10 POI к точке
EXPLAIN ANALYZE
SELECT id, name, category, 
       ST_Distance(geometry::geography, ST_SetSRID(ST_MakePoint(37.6175, 55.7558), 4326)::geography) AS dist_m
FROM nav.poi
ORDER BY geometry <-> ST_SetSRID(ST_MakePoint(37.6175, 55.7558), 4326)
LIMIT 10;
-- KNN Index Scan: ~1ms (оператор <-> использует GiST для KNN)
```

**Benchmark R-tree:**

| Запрос | Rows returned | Время (cold) | Время (warm) |
|--------|-------------|-------------|-------------|
| BBox viewport (z14, ~2km²) | ~500 roads | 5 ms | 2 ms |
| BBox large (z10, ~50km²) | ~5000 roads | 25 ms | 8 ms |
| KNN 10 nearest POI | 10 | 3 ms | 1 ms |
| KNN 100 nearest POI | 100 | 8 ms | 3 ms |
| ST_Within (point in polygon) | 1 | 2 ms | 0.5 ms |
| ST_Intersects (line vs polygon) | varies | 10 ms | 4 ms |

#### 2.4.2 Quadtree / Geohash

Geohash используется для кэширования в Redis и шардирования данных.

```
Geohash Grid (Moscow area):
Level 1: u (1/32 of earth)           → ~5000 x 5000 km
Level 2: uc (1/1024)                  → ~1250 x 625 km
Level 3: ucf (1/32768)               → ~156 x 156 km
Level 4: ucfv (1/1048576)            → ~39 x 19.5 km    ← City level
Level 5: ucfvg (1/33554432)          → ~4.9 x 4.9 km    ← District level
Level 6: ucfvgr (1/1073741824)       → ~1.2 x 0.6 km    ← Neighborhood
Level 7: ucfvgrx                      → ~153 x 153 m     ← Block level
Level 8: ucfvgrxs                     → ~38 x 19 m       ← Building level
Level 9: ucfvgrxsy                    → ~4.8 x 4.8 m     ← Parking spot
```

**Применение Geohash в системе:**
```python
# Кэш ключи в Redis для тайлов трафика
# Формат: traffic:{geohash6}:{timestamp_5min}
# Пример: traffic:ucfvgr:202603061430

# Кэш для POI поиска
# Формат: poi:{geohash5}:{category}
# Пример: poi:ucfvg:restaurant

# Шардирование GPS-потока
# Kafka partition key = geohash4 (ucfv)
# Обеспечивает локальность данных в одном partition
```

#### 2.4.3 S2 Geometry (Google)

S2 использует проекцию на куб с Hilbert curve для индексации.

```
S2 Cell Levels:
Level 0:  ~85,000 km²  (6 граней куба)
Level 5:  ~1,670 km²   (крупный город)
Level 10: ~50 km²       (район города)
Level 12: ~3.3 km²      (микрорайон)
Level 14: ~200,000 m²   (квартал)
Level 16: ~12,500 m²    (здание)
Level 18: ~780 m²       (двор)
Level 20: ~49 m²        (парковочное место)
Level 22: ~3 m²         (точка GPS)
Level 24: ~0.2 m²       (прецизионная точка)
Level 30: max (0.74 cm²)
```

**Применение S2 в системе:**

```python
# pip install s2sphere
import s2sphere

# Покрытие области S2 cells для эффективного поиска
region = s2sphere.LatLngRect(
    s2sphere.LatLng.from_degrees(55.7, 37.5),   # SW corner
    s2sphere.LatLng.from_degrees(55.8, 37.7)    # NE corner
)
coverer = s2sphere.RegionCoverer()
coverer.min_level = 12
coverer.max_level = 16
coverer.max_cells = 20
covering = coverer.get_covering(region)
# Result: ~8-15 S2 cells, покрывающих viewport

# Пример использования для geofence
# Geofence МКАД:
# S2 covering level 14: 48 cells
# S2 covering level 12: 12 cells (грубее, но быстрее для фильтрации)
```

#### 2.4.4 H3 — Hexagonal Hierarchical Spatial Index (Uber)

H3 использует гексагональную сетку — идеально для агрегации трафика и heatmaps.

```
H3 Resolutions:
Res 0:  ~4,357,449 km²   (континент)
Res 1:  ~609,788 km²      (крупный регион)
Res 2:  ~86,745 km²       (страна/крупный регион)
Res 3:  ~12,392 km²       (область)
Res 4:  ~1,770 km²        (район/город)
Res 5:  ~252.9 km²        (мелкий город)
Res 6:  ~36.13 km²        (часть города)
Res 7:  ~5.161 km²        (район)           ← Агрегация трафика primary
Res 8:  ~0.737 km²        (микрорайон)      ← Heatmap
Res 9:  ~0.105 km²        (квартал)         ← GPS trip aggregation
Res 10: ~0.015 km²        (100м x 100м)     ← Surge pricing zone
Res 11: ~0.002 km²        (45м x 45м)       ← Детальный трафик
Res 12: ~0.0003 km²       (18м x 18м)
Res 15: max (~0.9 m²)
```

**Применение H3 в навигаторе:**

```sql
-- Добавление H3 extension в PostgreSQL
CREATE EXTENSION IF NOT EXISTS h3;

-- Индексирование дорог по H3 для быстрой агрегации трафика
ALTER TABLE nav.traffic_segments ADD COLUMN h3_res7 h3index;
ALTER TABLE nav.traffic_segments ADD COLUMN h3_res9 h3index;

UPDATE nav.traffic_segments 
SET h3_res7 = h3_lat_lng_to_cell(ST_Y(ST_Centroid(geometry)), ST_X(ST_Centroid(geometry)), 7),
    h3_res9 = h3_lat_lng_to_cell(ST_Y(ST_Centroid(geometry)), ST_X(ST_Centroid(geometry)), 9);

CREATE INDEX idx_traffic_h3_res7 ON nav.traffic_segments (h3_res7);
CREATE INDEX idx_traffic_h3_res9 ON nav.traffic_segments (h3_res9);

-- Пример: агрегация трафика по H3 гексагонам для heatmap
SELECT 
    h3_res7 AS hex_id,
    h3_cell_to_lat_lng(h3_res7) AS center,
    AVG(current_speed) AS avg_speed,
    AVG(free_flow_speed) AS avg_free_flow,
    ROUND(AVG(current_speed::float / NULLIF(free_flow_speed, 0) * 100)) AS flow_pct,
    COUNT(*) AS segment_count
FROM nav.traffic_segments 
WHERE h3_res7 IN (
    SELECT h3_lat_lng_to_cell(55.7558, 37.6173, 7)  -- Центр Москвы
    UNION ALL
    SELECT unnest(h3_grid_ring_unsafe(h3_lat_lng_to_cell(55.7558, 37.6173, 7), 2))  -- Кольцо радиусом 2
)
AND speed_updated_at > NOW() - INTERVAL '5 minutes'
GROUP BY h3_res7;
```

#### 2.4.5 Benchmark: сравнение пространственных индексов

| Операция | R-tree (PostGIS) | Geohash (Redis) | S2 (memory) | H3 (PostgreSQL) |
|----------|-----------------|-----------------|-------------|-----------------|
| Point-in-polygon | 0.5 ms | — | 0.01 ms | — |
| BBox query (z14) | 2 ms | 0.3 ms | 0.1 ms | 1.5 ms |
| KNN-10 | 1 ms | — | 0.05 ms | — |
| Range query (5km radius) | 5 ms | 0.5 ms | 0.2 ms | 3 ms |
| Hex aggregation (city) | 50 ms | — | — | 15 ms |
| Bulk insert 100K points | 3,000 ms | 200 ms | 50 ms (mem) | 2,500 ms |
| Index size (1M records) | ~400 MB | ~80 MB | ~64 MB | ~100 MB |
| Persistent storage | ✅ Disk | ✅ Disk/RAM | ❌ Memory | ✅ Disk |
| SQL queryable | ✅ | ❌ | ❌ | ✅ |

**Рекомендация:** Гибридный подход:
- **R-tree (PostGIS)** — основное хранилище, сложные гео-запросы
- **Geohash** — ключи кэширования в Redis, шардирование Kafka
- **S2** — клиентский код, geofencing, cell covering
- **H3** — агрегация трафика, heatmaps, surge pricing zones

---

### 2.5 Data Quality

#### 2.5.1 Валидация топологии графа

```sql
-- ============================================================
-- Скрипт: scripts/sql/validate_topology.sql
-- Описание: Проверка топологической корректности дорожного графа
-- ============================================================

-- 1. Проверка connected components (несвязные подграфы)
-- Используем pgRouting для анализа связности
CREATE EXTENSION IF NOT EXISTS pgrouting;

-- Поиск компонентов связности
SELECT component, COUNT(*) AS node_count
FROM pgr_connectedComponents(
    'SELECT id, source, target, length_m AS cost FROM nav.roads_graph'
)
GROUP BY component
ORDER BY node_count DESC;
-- Ожидание: 1 гигантский компонент (99.5%+ узлов)
-- Red flag: > 100 компонентов с > 10 узлами

-- 2. Обнаружение dead-end дорог (тупики)
SELECT n.id, n.geometry, COUNT(r.id) AS road_count
FROM nav.nodes n
JOIN nav.roads r ON ST_DWithin(n.geometry, r.geometry, 0.00001)
GROUP BY n.id, n.geometry
HAVING COUNT(r.id) = 1 AND NOT EXISTS (
    SELECT 1 FROM nav.roads WHERE road_class IN ('service', 'track', 'path', 'residential')
    AND ST_DWithin(n.geometry, geometry, 0.00001)
);
-- Фильтрует настоящие тупики от ошибок картографии

-- 3. Проверка oneway consistency
-- Дороги, помеченные как oneway, но образующие тупиковые зоны
WITH oneway_dead AS (
    SELECT n.id AS node_id, n.geometry,
           SUM(CASE WHEN r.oneway = 1 THEN 1 ELSE 0 END) AS incoming,
           SUM(CASE WHEN r.oneway = -1 THEN 1 ELSE 0 END) AS outgoing,
           SUM(CASE WHEN r.oneway = 0 THEN 1 ELSE 0 END) AS bidirectional
    FROM nav.nodes n
    JOIN nav.roads r ON ST_DWithin(n.geometry, r.geometry, 0.00005)
    WHERE n.road_count >= 2
    GROUP BY n.id, n.geometry
)
SELECT * FROM oneway_dead
WHERE (incoming > 0 AND outgoing = 0 AND bidirectional = 0)   -- Можно въехать, нельзя выехать
   OR (outgoing > 0 AND incoming = 0 AND bidirectional = 0);  -- Можно выехать, нельзя въехать
```

#### 2.5.2 Обнаружение дубликатов дорог

```sql
-- Поиск почти-дубликатов дорог (перекрывающиеся геометрии)
SELECT r1.id AS road1_id, r2.id AS road2_id,
       r1.name, r1.road_class, r2.road_class,
       ST_HausdorffDistance(r1.geometry::geography, r2.geometry::geography) AS hausdorff_m,
       ST_Length(ST_Intersection(
           ST_Buffer(r1.geometry::geography, 5)::geometry,
           r2.geometry
       )::geography) / GREATEST(r1.length_m, 1) AS overlap_ratio
FROM nav.roads r1
JOIN nav.roads r2 ON r1.id < r2.id
    AND r1.geometry && r2.geometry  -- BBox overlap (GiST index)
    AND ST_DWithin(r1.geometry::geography, r2.geometry::geography, 10)  -- В пределах 10м
WHERE r1.road_class NOT IN ('service', 'path', 'footway')
  AND r2.road_class NOT IN ('service', 'path', 'footway')
  AND ST_HausdorffDistance(r1.geometry::geography, r2.geometry::geography) < 15;
-- Порог: Hausdorff distance < 15m → вероятный дубликат
```

#### 2.5.3 Snap tolerance и корректировка

```sql
-- Snap nodes, которые находятся слишком близко (< 1м) — вероятная ошибка
-- Объединение в один node
WITH close_nodes AS (
    SELECT n1.id AS node1, n2.id AS node2,
           ST_Distance(n1.geometry::geography, n2.geometry::geography) AS dist_m
    FROM nav.nodes n1
    JOIN nav.nodes n2 ON n1.id < n2.id
        AND ST_DWithin(n1.geometry::geography, n2.geometry::geography, 1.0)  -- < 1 метр
    WHERE n1.road_count >= 2 AND n2.road_count >= 2
)
SELECT COUNT(*) AS nodes_to_merge, 
       AVG(dist_m) AS avg_dist_m
FROM close_nodes;
-- Snap tolerance: 1.0m для nodes на перекрёстках
-- Snap tolerance: 0.5m для nodes на одной дороге
```

#### 2.5.4 Автоматическое определение скорости по типу дороги

```sql
-- Дефолтные скорости для дорог без явного maxspeed (по странам)
-- Стандарт: Россия (по ПДД РФ)

CREATE TABLE nav.default_speed_limits (
    country_code    VARCHAR(2)      NOT NULL,
    road_class      nav.road_class  NOT NULL,
    area_type       VARCHAR(16)     NOT NULL,  -- urban/rural
    default_speed   SMALLINT        NOT NULL,  -- km/h
    source          VARCHAR(64),
    CONSTRAINT pk_default_speed PRIMARY KEY (country_code, road_class, area_type)
);

INSERT INTO nav.default_speed_limits (country_code, road_class, area_type, default_speed, source) VALUES
-- Россия: населённый пункт
('RU', 'motorway',      'urban',  110, 'ПДД РФ п.10.2'),
('RU', 'motorway_link', 'urban',  60,  'ПДД РФ п.10.2'),
('RU', 'trunk',         'urban',  80,  'ПДД РФ п.10.2'),
('RU', 'trunk_link',    'urban',  60,  'ПДД РФ п.10.2'),
('RU', 'primary',       'urban',  60,  'ПДД РФ п.10.2'),
('RU', 'primary_link',  'urban',  60,  'ПДД РФ п.10.2'),
('RU', 'secondary',     'urban',  60,  'ПДД РФ п.10.2'),
('RU', 'secondary_link','urban',  60,  'ПДД РФ п.10.2'),
('RU', 'tertiary',      'urban',  60,  'ПДД РФ п.10.2'),
('RU', 'tertiary_link', 'urban',  60,  'ПДД РФ п.10.2'),
('RU', 'residential',   'urban',  60,  'ПДД РФ п.10.2'),
('RU', 'living_street', 'urban',  20,  'ПДД РФ п.10.2'),
('RU', 'service',       'urban',  20,  'ПДД РФ п.10.2'),
('RU', 'unclassified',  'urban',  60,  'ПДД РФ п.10.2'),
-- Россия: вне населённого пункта
('RU', 'motorway',      'rural',  110, 'ПДД РФ п.10.3'),
('RU', 'motorway_link', 'rural',  80,  'ПДД РФ п.10.3'),
('RU', 'trunk',         'rural',  90,  'ПДД РФ п.10.3'),
('RU', 'trunk_link',    'rural',  80,  'ПДД РФ п.10.3'),
('RU', 'primary',       'rural',  90,  'ПДД РФ п.10.3'),
('RU', 'primary_link',  'rural',  80,  'ПДД РФ п.10.3'),
('RU', 'secondary',     'rural',  90,  'ПДД РФ п.10.3'),
('RU', 'secondary_link','rural',  80,  'ПДД РФ п.10.3'),
('RU', 'tertiary',      'rural',  90,  'ПДД РФ п.10.3'),
('RU', 'residential',   'rural',  90,  'ПДД РФ п.10.3'),
('RU', 'unclassified',  'rural',  60,  'ПДД РФ п.10.3'),
('RU', 'track',         'rural',  40,  'Estimated');

-- Применение дефолтных скоростей к дорогам без maxspeed
UPDATE nav.roads r
SET max_speed = dsl.default_speed
FROM nav.default_speed_limits dsl
WHERE r.max_speed IS NULL
  AND r.road_class::text = dsl.road_class::text
  AND dsl.country_code = 'RU'
  AND dsl.area_type = CASE 
      WHEN EXISTS (
          SELECT 1 FROM nav.boundaries b 
          WHERE b.admin_level = 8 
          AND ST_Within(ST_Centroid(r.geometry), b.geometry)
      ) THEN 'urban' 
      ELSE 'rural' 
  END;
```

#### 2.5.5 Data Quality Dashboard — метрики

| Метрика | Формула | Target | Alert threshold |
|---------|---------|--------|-----------------|
| Roads without name | COUNT(name IS NULL) / COUNT(*) × 100 | < 15% | > 25% |
| Roads without maxspeed (after inference) | COUNT(max_speed IS NULL) / COUNT(*) × 100 | < 5% | > 10% |
| Disconnected graph components (>10 nodes) | COUNT(components with >10 nodes) | < 50 | > 200 |
| Duplicate roads detected | COUNT(hausdorff < 15m pairs) | < 0.1% | > 0.5% |
| Dead-end nodes (unexpected) | COUNT(suspicious dead-ends) | < 500/city | > 2000 |
| OSM data freshness | MAX(osm_timestamp) age | < 2 min | > 10 min |
| Surface coverage | COUNT(surface != 'unknown') / COUNT(*) × 100 | > 60% | < 40% |
| Turn restriction density | restrictions_per_1000_intersections | > 50 | < 20 |
| POI with opening_hours | COUNT(opening_hours IS NOT NULL) / COUNT(*) × 100 | > 30% | < 15% |
| Buildings with height | COUNT(height IS NOT NULL) / COUNT(*) × 100 | > 20% | < 10% |

---

## Раздел 3: Tile Rendering Engine

### 3.1 Vector Tiles Architecture

#### 3.1.1 Формат MVT (Mapbox Vector Tile)

Vector tiles используют формат MVT (Mapbox Vector Tile spec v2.1), основанный на Protocol Buffers.

**Структура .mvt файла (protobuf schema):**
```protobuf
// Simplified MVT protobuf schema
message Tile {
    enum GeomType {
        UNKNOWN = 0;
        POINT = 1;
        LINESTRING = 2;
        POLYGON = 3;
    }
    
    message Value {
        optional string string_value = 1;
        optional float float_value = 2;
        optional double double_value = 3;
        optional int64 int_value = 4;
        optional uint64 uint_value = 5;
        optional sint64 sint_value = 6;
        optional bool bool_value = 7;
    }
    
    message Feature {
        optional uint64 id = 1;
        repeated uint32 tags = 2;    // key/value indexes, interleaved
        optional GeomType type = 3;
        repeated uint32 geometry = 4; // encoded geometry commands
    }
    
    message Layer {
        required uint32 version = 15; // Always 2
        required string name = 1;
        repeated Feature features = 2;
        repeated string keys = 3;     // Shared string keys
        repeated Value values = 4;    // Shared values
        optional uint32 extent = 5;   // Default 4096 (tile coordinate space)
    }
    
    repeated Layer layers = 3;
}
```

**Tile coordinate system:**
- Extent: 4096 × 4096 (стандартный)
- Координаты: integer (0..4096)
- Geometry encoding: command integers (MoveTo, LineTo, ClosePath)
- Delta encoding: координаты кодируются как дельты от предыдущей точки

#### 3.1.2 Layers внутри тайла

| Layer name | Geometry type | Zoom levels | Feature count per tile (z14, Moscow) | Описание |
|-----------|--------------|-------------|--------------------------------------|----------|
| `water` | Polygon | 0–22 | ~5 | Водоёмы: реки, озёра, моря |
| `waterway` | LineString | 4–22 | ~10 | Реки, каналы (линейные) |
| `landuse` | Polygon | 4–22 | ~30 | Использование земли: лес, парки, промзоны |
| `landcover` | Polygon | 0–22 | ~15 | Покрытие: лес, пашня, ледник |
| `buildings` | Polygon | 13–22 | ~200 | Здания с высотой |
| `roads` | LineString | 4–22 | ~150 | Дорожная сеть |
| `roads_label` | LineString | 10–22 | ~50 | Названия дорог (для тектирования вдоль линии) |
| `boundaries` | LineString | 0–14 | ~5 | Административные границы |
| `poi` | Point | 12–22 | ~80 | Точки интереса |
| `poi_label` | Point | 12–22 | ~40 | Подписи POI |
| `place_label` | Point | 2–22 | ~10 | Названия городов, районов |
| `transit` | LineString + Point | 10–22 | ~30 | Маршруты ОТ, остановки, станции метро |
| `housenumber` | Point | 16–22 | ~100 | Номера домов |
| `contour` | LineString | 10–22 | ~20 | Изолинии рельефа |

**Feature properties по слоям:**

```json
// Layer: roads — properties для каждого feature
{
    "class": "primary",           // road_class
    "name": "Тверская ул.",
    "name_en": "Tverskaya Street",
    "ref": "А-108",
    "oneway": 1,
    "lanes": 4,
    "surface": "asphalt",
    "bridge": false,
    "tunnel": false,
    "toll": false,
    "layer": 0,
    "z_order": 330
}

// Layer: buildings
{
    "height": 25.0,
    "min_height": 0,
    "levels": 7,
    "type": "residential",
    "name": "Жилой дом",
    "colour": "#d4c4a8"
}

// Layer: poi
{
    "category": "restaurant",
    "name": "Пушкинъ",
    "icon": "restaurant",
    "rank": 2,
    "rating": 4.5
}
```

#### 3.1.3 Simplification по zoom levels

Douglas-Peucker simplification применяется при генерации тайлов для уменьшения количества точек в геометриях:

| Zoom level | Tolerance (метры) | Tolerance (градусы, ~WGS84) | Сохраняется деталей |
|-----------|-------------------|------------------------------|---------------------|
| 0–3 | 50,000 | 0.45 | ~0.1% |
| 4–5 | 10,000 | 0.09 | ~0.5% |
| 6–7 | 5,000 | 0.045 | ~1% |
| 8–9 | 1,000 | 0.009 | ~5% |
| 10–11 | 200 | 0.0018 | ~15% |
| 12–13 | 50 | 0.00045 | ~40% |
| 14–15 | 10 | 0.00009 | ~70% |
| 16–17 | 2 | 0.000018 | ~90% |
| 18–22 | 0 (no simplification) | 0 | 100% |

---

### 3.2 Tile Generation Pipeline

#### 3.2.1 Tegola конфигурация

```toml
# config/tegola/config.toml
# Tegola — vector tile server

[webserver]
port = ":8080"
cors_allowed_origin = "*"

[webserver.headers]
Access-Control-Allow-Origin = "*"
Cache-Control = "public, max-age=3600, s-maxage=86400"

# ==================== ПРОВАЙДЕРЫ ДАННЫХ ====================

[[providers]]
name = "nav_db"
type = "mvt_postgis"
host = "${NAV_DB_HOST}"
port = 5432
database = "nav_db"
user = "${NAV_DB_USER}"
password = "${NAV_DB_PASSWORD}"
srid = 4326
max_connections = 50

    # --- Layer: water ---
    [[providers.layers]]
    name = "water"
    geometry_fieldname = "geometry"
    geometry_type = "Polygon"
    id_fieldname = "id"
    srid = 4326
    sql = """
        SELECT id, ST_AsMVTGeom(geometry, !BBOX!) AS geometry,
               name, name_ru, water_type
        FROM nav.water_areas
        WHERE geometry && !BBOX!
          AND ST_Intersects(geometry, !BBOX!)
          AND (area_m2 > CASE 
               WHEN !ZOOM! < 6 THEN 1000000000
               WHEN !ZOOM! < 10 THEN 100000000
               WHEN !ZOOM! < 14 THEN 1000000
               ELSE 10000
          END)
    """

    # --- Layer: roads ---
    [[providers.layers]]
    name = "roads"
    geometry_fieldname = "geometry"
    geometry_type = "LineString"
    id_fieldname = "id"
    srid = 4326
    sql = """
        SELECT id, 
               ST_AsMVTGeom(
                   CASE 
                       WHEN !ZOOM! < 10 THEN ST_Simplify(geometry, 0.001)
                       WHEN !ZOOM! < 14 THEN ST_Simplify(geometry, 0.0001)
                       WHEN !ZOOM! < 17 THEN ST_Simplify(geometry, 0.00001)
                       ELSE geometry 
                   END, 
                   !BBOX!
               ) AS geometry,
               road_class AS class,
               name, name_ru, name_en,
               road_ref AS ref,
               oneway, lanes,
               surface, bridge, tunnel, toll,
               layer, z_order
        FROM nav.roads
        WHERE geometry && !BBOX!
          AND road_class IN (
              CASE WHEN !ZOOM! >= 4 THEN 'motorway' END,
              CASE WHEN !ZOOM! >= 4 THEN 'trunk' END,
              CASE WHEN !ZOOM! >= 6 THEN 'primary' END,
              CASE WHEN !ZOOM! >= 8 THEN 'secondary' END,
              CASE WHEN !ZOOM! >= 10 THEN 'tertiary' END,
              CASE WHEN !ZOOM! >= 12 THEN 'residential' END,
              CASE WHEN !ZOOM! >= 12 THEN 'unclassified' END,
              CASE WHEN !ZOOM! >= 14 THEN 'living_street' END,
              CASE WHEN !ZOOM! >= 14 THEN 'service' END,
              CASE WHEN !ZOOM! >= 15 THEN 'footway' END,
              CASE WHEN !ZOOM! >= 15 THEN 'cycleway' END,
              CASE WHEN !ZOOM! >= 15 THEN 'pedestrian' END,
              CASE WHEN !ZOOM! >= 16 THEN 'path' END,
              CASE WHEN !ZOOM! >= 16 THEN 'steps' END,
              CASE WHEN !ZOOM! >= 16 THEN 'track' END
          )
        ORDER BY z_order
    """

    # --- Layer: buildings ---
    [[providers.layers]]
    name = "buildings"
    geometry_fieldname = "geometry"
    geometry_type = "Polygon"
    id_fieldname = "id"
    srid = 4326
    sql = """
        SELECT id, ST_AsMVTGeom(geometry, !BBOX!) AS geometry,
               height, levels, building_type AS type,
               name, colour, material
        FROM nav.buildings
        WHERE geometry && !BBOX!
          AND !ZOOM! >= 13
          AND (area_m2 > CASE 
               WHEN !ZOOM! = 13 THEN 5000
               WHEN !ZOOM! = 14 THEN 500
               WHEN !ZOOM! = 15 THEN 100
               ELSE 10
          END)
    """

    # --- Layer: poi ---
    [[providers.layers]]
    name = "poi"
    geometry_fieldname = "geometry"
    geometry_type = "Point"
    id_fieldname = "id"
    srid = 4326
    sql = """
        SELECT id, ST_AsMVTGeom(geometry, !BBOX!) AS geometry,
               category, name, name_ru,
               brand,
               CASE 
                   WHEN category IN ('fuel', 'charging_station') THEN 'fuel'
                   WHEN category IN ('restaurant', 'cafe', 'fast_food') THEN 'food'
                   WHEN category IN ('hospital', 'clinic', 'pharmacy') THEN 'health'
                   WHEN category IN ('supermarket', 'convenience', 'mall') THEN 'shop'
                   WHEN category IN ('hotel', 'hostel') THEN 'lodging'
                   WHEN category IN ('bank', 'atm') THEN 'finance'
                   WHEN category = 'parking' THEN 'parking'
                   WHEN category = 'metro_station' THEN 'metro'
                   ELSE 'default'
               END AS icon,
               ROUND(importance * 10)::int AS rank,
               rating
        FROM nav.poi
        WHERE geometry && !BBOX!
          AND !ZOOM! >= 12
          AND importance >= CASE
               WHEN !ZOOM! = 12 THEN 0.8
               WHEN !ZOOM! = 13 THEN 0.5
               WHEN !ZOOM! = 14 THEN 0.3
               WHEN !ZOOM! = 15 THEN 0.1
               ELSE 0
          END
        ORDER BY importance DESC
        LIMIT CASE WHEN !ZOOM! < 15 THEN 50 ELSE 200 END
    """

    # --- Layer: boundaries ---
    [[providers.layers]]
    name = "boundaries"
    geometry_fieldname = "geometry"
    geometry_type = "LineString"
    id_fieldname = "id"
    srid = 4326
    sql = """
        SELECT id, 
               ST_AsMVTGeom(ST_Boundary(geometry), !BBOX!) AS geometry,
               admin_level, name, name_ru
        FROM nav.boundaries
        WHERE geometry && !BBOX!
          AND admin_level <= CASE
               WHEN !ZOOM! <= 3 THEN 2
               WHEN !ZOOM! <= 6 THEN 4
               WHEN !ZOOM! <= 10 THEN 6
               ELSE 8
          END
    """

    # --- Layer: place_label ---
    [[providers.layers]]
    name = "place_label"
    geometry_fieldname = "geometry"
    geometry_type = "Point"
    id_fieldname = "id"
    srid = 4326
    sql = """
        SELECT ar.id, ST_AsMVTGeom(ar.centroid, !BBOX!) AS geometry,
               ar.name, ar.name_ru,
               b.admin_level,
               b.population,
               CASE 
                   WHEN b.population > 1000000 THEN 'city_large'
                   WHEN b.population > 100000 THEN 'city'
                   WHEN b.population > 10000 THEN 'town'
                   ELSE 'village'
               END AS place_type
        FROM nav.admin_regions ar
        JOIN nav.boundaries b ON ar.boundary_id = b.id
        WHERE ar.centroid && !BBOX!
          AND b.admin_level IN (4, 6, 8, 10)
          AND b.population >= CASE
               WHEN !ZOOM! <= 4 THEN 500000
               WHEN !ZOOM! <= 6 THEN 100000
               WHEN !ZOOM! <= 8 THEN 10000
               WHEN !ZOOM! <= 10 THEN 1000
               ELSE 0
          END
    """

    # --- Layer: housenumber ---
    [[providers.layers]]
    name = "housenumber"
    geometry_fieldname = "geometry"
    geometry_type = "Point"
    id_fieldname = "id"
    srid = 4326
    sql = """
        SELECT id, ST_AsMVTGeom(ST_Centroid(geometry), !BBOX!) AS geometry,
               address_housenumber AS housenumber
        FROM nav.buildings
        WHERE geometry && !BBOX!
          AND !ZOOM! >= 17
          AND address_housenumber IS NOT NULL
    """

# ==================== MAPS ====================

[[maps]]
name = "nav"
attribution = "© ECOMANSONI © OpenStreetMap contributors"
center = [37.6173, 55.7558, 12]   # Moscow center
bounds = [-180, -85, 180, 85]

    [[maps.layers]]
    provider_layer = "nav_db.water"
    min_zoom = 0
    max_zoom = 22

    [[maps.layers]]
    provider_layer = "nav_db.roads"
    min_zoom = 4
    max_zoom = 22

    [[maps.layers]]
    provider_layer = "nav_db.buildings"
    min_zoom = 13
    max_zoom = 22

    [[maps.layers]]
    provider_layer = "nav_db.poi"
    min_zoom = 12
    max_zoom = 22

    [[maps.layers]]
    provider_layer = "nav_db.boundaries"
    min_zoom = 0
    max_zoom = 14

    [[maps.layers]]
    provider_layer = "nav_db.place_label"
    min_zoom = 2
    max_zoom = 14

    [[maps.layers]]
    provider_layer = "nav_db.housenumber"
    min_zoom = 17
    max_zoom = 22

# ==================== CACHE ====================

[cache]
type = "s3"
bucket = "ecomansoni-nav-tiles"
basepath = "tiles"
region = "ru-central1"
endpoint = "https://storage.yandexcloud.net"
access_key_id = "${S3_ACCESS_KEY}"
secret_access_key = "${S3_SECRET_KEY}"
max_zoom = 16      # Pre-cache до zoom 16, z17+ генерируются on-demand
```

#### 3.2.2 Tippecanoe — предгенерация тайлов (offline/batch)

```bash
#!/bin/bash
# scripts/tiles/generate_tiles.sh
# Генерация MBTiles из GeoJSON для offline и CDN pre-seed

set -euo pipefail

OUTPUT_DIR="/data/tiles"
MBTILES_FILE="${OUTPUT_DIR}/nav-planet.mbtiles"

# Шаг 1: Экспорт из PostGIS в GeoJSON ND (newline-delimited)
echo "Exporting roads..."
ogr2ogr -f GeoJSONSeq /tmp/roads.geojsonl \
    PG:"host=localhost dbname=nav_db user=nav_admin" \
    -sql "SELECT id, road_class AS class, name, name_ru, oneway, lanes, surface, bridge, tunnel, toll, z_order, geometry FROM nav.roads" \
    -lco RS_POLICY=EOL

echo "Exporting buildings..."
ogr2ogr -f GeoJSONSeq /tmp/buildings.geojsonl \
    PG:"host=localhost dbname=nav_db user=nav_admin" \
    -sql "SELECT id, height, levels, building_type AS type, name, geometry FROM nav.buildings"

echo "Exporting POI..."
ogr2ogr -f GeoJSONSeq /tmp/poi.geojsonl \
    PG:"host=localhost dbname=nav_db user=nav_admin" \
    -sql "SELECT id, category, name, name_ru, brand, importance, geometry FROM nav.poi"

# Шаг 2: Tippecanoe — генерация оптимизированных vector tiles
tippecanoe \
    --output="${MBTILES_FILE}" \
    --force \
    --name="ECOMANSONI Navigation" \
    --attribution="© ECOMANSONI © OpenStreetMap" \
    --minimum-zoom=0 \
    --maximum-zoom=16 \
    --base-zoom=14 \
    --full-detail=14 \
    --low-detail=10 \
    --minimum-detail=7 \
    --drop-densest-as-needed \
    --extend-zooms-if-still-dropping \
    --no-tile-compression \
    --simplification=10 \
    --simplify-only-low-zooms \
    --detect-shared-borders \
    --coalesce-smallest-as-needed \
    --coalesce-densest-as-needed \
    --maximum-tile-bytes=500000 \
    --maximum-tile-features=200000 \
    --named-layer=roads:/tmp/roads.geojsonl \
    --named-layer=buildings:/tmp/buildings.geojsonl \
    --named-layer=poi:/tmp/poi.geojsonl

echo "MBTiles generated: $(du -h ${MBTILES_FILE})"

# Шаг 3: Извлечение в z/x/y директорию для CDN upload
mb-util "${MBTILES_FILE}" "${OUTPUT_DIR}/z_x_y/" --image_format=pbf

echo "=== Tile generation complete ==="
echo "Total tiles: $(find ${OUTPUT_DIR}/z_x_y/ -name '*.pbf' | wc -l)"
echo "Total size: $(du -sh ${OUTPUT_DIR}/z_x_y/)"
```

**Tile size targets по zoom level:**

| Zoom | Avg tile size (bytes) | Max tile size (bytes) | Notes |
|------|--------------------|--------------------|-------|
| 0–3 | 5 KB | 20 KB | Только coastlines + boundaries |
| 4–6 | 15 KB | 60 KB | Major roads, large water |
| 7–9 | 30 KB | 120 KB | Primary/secondary roads |
| 10–11 | 50 KB | 200 KB | Tertiary roads, land use |
| 12–13 | 80 KB | 350 KB | Residential roads, buildings appear |
| 14 | 120 KB | 500 KB | Full detail, POI |
| 15–16 | 80 KB | 300 KB | Fewer features per tile — smaller area |
| 17–22 | 40 KB | 200 KB | House numbers, paths, steps |

---

### 3.3 Zoom Level Strategy

#### Полная спецификация по каждому zoom level

| Zoom | Масштаб ~1: | м/пиксель | Слои включены | Min object size | Avg tile KB | Tiles planet | Use case |
|------|----------|-----------|--------------|----------------|-------------|----------------|----------|
| 0 | 500M | 156,543 | water, boundaries_L2 | continent | 3 | 1 | Глобус |
| 1 | 250M | 78,271 | water, boundaries_L2 | continent | 4 | 4 | Полушарие |
| 2 | 150M | 39,136 | water, boundaries_L2, place_L1 | subcontinent | 6 | 16 | Континент |
| 3 | 70M | 19,568 | + landcover large | country | 8 | 64 | Регион мира |
| 4 | 35M | 9,784 | + motorway, trunk | country | 15 | 256 | Страна |
| 5 | 15M | 4,892 | + motorway_link, primary | large region | 20 | 1,024 | Крупный регион |
| 6 | 10M | 2,446 | + secondary, boundaries_L4 | region | 25 | 4,096 | Субъект РФ |
| 7 | 5M | 1,223 | + tertiary, landuse major | city | 35 | 16,384 | Область |
| 8 | 2.4M | 611 | + unclassified, water detail | town | 45 | 65,536 | Район |
| 9 | 1.2M | 305 | + residential, railway | village | 55 | 262,144 | Городская агломерация |
| 10 | 577K | 153 | + living_street, transit stops | block group | 65 | 1,048,576 | Город целиком |
| 11 | 288K | 76 | + service major, detailed labels | block | 70 | 4,194,304 | Часть города |
| 12 | 144K | 38 | + POI major, boundaries_L8 | 50m road | 80 | 16,777,216 | Район города |
| 13 | 72K | 19 | + buildings footprint, all POI | building | 100 | 67,108,864 | Микрорайон |
| 14 | 36K | 9.6 | + all roads, building detail | 10m road | 120 | 268,435,456 | Несколько кварталов |
| 15 | 18K | 4.8 | + service, footway, cycleway | path | 80 | 1,073,741,824 | Квартал |
| 16 | 9K | 2.4 | + steps, track, path detail | 3m path | 60 | 4,294,967,296 | Здания детально |
| 17 | 4.5K | 1.2 | + housenumber, all labels | door | 45 | 17,179,869,184 | Улица |
| 18 | 2.25K | 0.6 | + indoor если есть | 1m object | 30 | 68,719,476,736 | Здание |
| 19 | 1.1K | 0.3 | indoor detail | 0.5m | 20 | — | Этаж здания |
| 20 | 564 | 0.15 | indoor + furniture | 0.3m | 15 | — | Комната |
| 21 | 282 | 0.07 | precision indoor | 0.1m | 10 | — | Детализация |
| 22 | 141 | 0.04 | max detail | 0.05m | 8 | — | Максимум |

> **Примечание:** Zoom 17–22 генерируются on-demand. Pre-generation выполняется только для z0–z16.
> Для покрытия России z0–z14: ~12M тайлов, ~2.5 TB storage.
> Для покрытия Москвы z0–z16: ~800K тайлов, ~80 GB storage.

---

### 3.4 Style Specification

#### 3.4.1 Цветовые схемы

**Day Mode (основная):**

| Элемент | Цвет hex | RGB |
|---------|-----------|-----|
| Background | #f0ede6 | 240, 237, 230 |
| Water | #aad3df | 170, 211, 223 |
| Park / Green | #c8e6a0 | 200, 230, 160 |
| Buildings | #d4c4a8 | 212, 196, 168 |
| Motorway fill | #f5a623 | 245, 166, 35 |
| Motorway casing | #c77a2f | 199, 122, 47 |
| Primary road | #ffd700 | 255, 215, 0 |
| Secondary road | #ffffff | 255, 255, 255 |
| Residential road | #ffffff | 255, 255, 255 |
| Road casing | #c0c0c0 | 192, 192, 192 |
| Label text | #333333 | 51, 51, 51 |
| Label halo | #ffffff | 255, 255, 255 |

**Night Mode:**

| Элемент | Цвет hex | RGB |
|---------|-----------|-----|
| Background | #1a1a2e | 26, 26, 46 |
| Water | #16213e | 22, 33, 62 |
| Park / Green | #1e3a2f | 30, 58, 47 |
| Buildings | #2a2a40 | 42, 42, 64 |
| Motorway fill | #e67e22 | 230, 126, 34 |
| Primary road | #3498db | 52, 152, 219 |
| Secondary road | #444466 | 68, 68, 102 |
| Residential road | #333355 | 51, 51, 85 |
| Label text | #e0e0e0 | 224, 224, 224 |
| Label halo | #1a1a2e | 26, 26, 46 |

**Traffic overlay цвета:**

| Congestion level | Цвет | Код | Скорость / free_flow |
|-----------------|------|-----|---------------------|
| Free flow | Зелёный | #4CAF50 | > 75% |
| Light | Светло-зелёный | #8BC34A | 50–75% |
| Moderate | Жёлтый | #FFC107 | 35–50% |
| Heavy | Оранжевый | #FF9800 | 20–35% |
| Severe | Красный | #F44336 | 5–20% |
| Blocked | Фиолетовый | #9C27B0 | < 5% |

---

### 3.5 Tile Serving Infrastructure

#### 3.5.1 CDN и caching стратегия

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Client   │────►│  CDN Edge    │────►│  Origin      │────►│  Tile Server │
│  Browser  │     │  CloudFlare  │     │  Shield      │     │  Tegola      │
│  /Mobile  │◄────│  < 10ms      │◄────│  1 node      │◄────│  + PostGIS   │
└──────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                        │                                          │
                        │                                   ┌──────▼───────┐
                        │                                   │  S3 / MinIO  │
                        │                                   │  Pre-cached  │
                        │                                   │  tiles       │
                        │                                   └──────────────┘
                        │
                 ┌──────▼───────┐
                 │  Tile Cache  │
                 │  Redis       │
                 │  hot tiles   │
                 └──────────────┘
```

**Cache headers:**

| Zoom level | Cache-Control | CDN TTL | Browser TTL |
|-----------|--------------|---------|-------------|
| 0–8 | public, max-age=604800, s-maxage=2592000 | 30 дней | 7 дней |
| 9–12 | public, max-age=86400, s-maxage=604800 | 7 дней | 1 день |
| 13–16 | public, max-age=3600, s-maxage=86400 | 1 день | 1 час |
| 17–22 | public, max-age=300, s-maxage=3600 | 1 час | 5 мин |
| traffic overlay | public, max-age=30, s-maxage=60 | 1 мин | 30 сек |

**Invalidation стратегия:**
- **Tile versioning:** URL включает версию: `/tiles/v2/{z}/{x}/{y}.pbf`
- **Purge by tag:** CloudFlare Cache Tags: `tile:z14`, `tile:region:moscow`
- **Incremental:** При OSM update → определить затронутые тайлы → purge конкретных z/x/y

#### 3.5.2 Bandwidth и Storage расчёты

**Storage per region:**

| Регион | z0–14 | z0–16 | z0–18 on-demand |
|--------|-------|-------|-------------------|
| Москва | 8 GB | 80 GB | ~800 GB |
| Санкт-Петербург | 5 GB | 50 GB | ~500 GB |
| Московская обл. | 15 GB | 150 GB | ~1.5 TB |
| Россия | 250 GB | 2.5 TB | ~25 TB |
| Планета | 2 TB | 20 TB | ~200 TB |

**Bandwidth при N пользователей daily:**

| Пользователей | Sessions/day | Tiles/session | Daily bandwidth | Peak bandwidth |
|--------------|-------------|---------------|----------------|----------------|
| 10K | 25K | 50 × 80KB | 100 GB/day | 30 Mbps |
| 100K | 250K | 50 × 80KB | 1 TB/day | 300 Mbps |
| 1M | 2.5M | 50 × 80KB | 10 TB/day | 3 Gbps |
| 10M | 25M | 50 × 80KB | 100 TB/day | 30 Gbps |

> **CDN снижает origin load на 95–99%** за счёт edge caching.

---

### 3.6 Client-Side Rendering

#### 3.6.1 MapLibre GL JS Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    MapLibre GL JS Architecture                 │
│                                                                │
│  ┌──────────────┐                                             │
│  │   Main Thread │                                             │
│  │  ┌─────────┐ │  ┌───────────────────┐                      │
│  │  │  Style   │ │  │   Web Worker      │                      │
│  │  │  Manager │ │  │   tile parsing    │                      │
│  │  └────┬────┘ │  │  ┌─────────────┐  │  ┌─────────────────┐│
│  │  ┌────▼────┐ │  │  │ VT Decoder  │  │  │  WebGL Context  ││
│  │  │  Source │◄├──┼──│ protobuf    │  │  │  Vertex Buffer  ││
│  │  │  Cache  │ │  │  │ Tesselation │  │  │  Fragment Shader││
│  │  └────┬────┘ │  │  │ Label Place │  │  │  Texture Atlas  ││
│  │  ┌────▼────┐ │  │  └─────┬───────┘  │  └─────────────────┘│
│  │  │  Render │─┼──┼────────┘          │                      │
│  │  │  Loop   │ │  └───────────────────┘  Frame: 16.6ms 60fps│
│  │  └─────────┘ │                                             │
│  └──────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

**Render pipeline per frame — 16.6ms budget:**

| Фаза | Время ms | Описание |
|------|----------|----------|
| Style evaluation | 0.5 | Вычисление paint/layout свойств для текущего zoom |
| Tile selection | 0.2 | Определение видимых тайлов |
| Source update | 0.3 | Запрос новых тайлов, если нужно |
| Symbol placement | 1.5 | Collision detection для labels |
| Buffer upload | 1.0 | Transfer vertex/index buffers → GPU |
| Opaque pass | 3.0 | Рендеринг fill, line |
| Translucent pass | 2.0 | Полупрозрачные слои |
| Symbol pass | 2.0 | Иконки и текст |
| 3D extrusion pass | 2.0 | 3D-здания |
| Debug/overlay | 0.5 | FPS counter, tile borders dev |
| **Total** | **~13 ms** | **budget: 16.6ms для 60fps** |

#### 3.6.2 Memory budget

| Компонент | Mobile low-end | Mobile mid | Mobile high | Desktop |
|----------|---------------|-----------|------------|---------|
| Tile cache decoded | 32 MB | 64 MB | 128 MB | 256 MB |
| Tile cache compressed | 16 MB | 32 MB | 64 MB | 128 MB |
| GPU texture memory | 32 MB | 64 MB | 128 MB | 256 MB |
| Glyph atlas | 4 MB | 8 MB | 16 MB | 32 MB |
| Sprite atlas | 2 MB | 4 MB | 8 MB | 16 MB |
| Vertex buffers | 16 MB | 32 MB | 64 MB | 128 MB |
| **Total** | **~100 MB** | **~200 MB** | **~400 MB** | **~800 MB** |

**Tile cache policy:**
- LRU eviction — Least Recently Used
- Max tiles in cache: 200 mobile, 500 desktop
- Parent tiles kept for smooth zoom transitions
- Expired tiles served if network unavailable — stale-while-revalidate

---

## Раздел 4: Routing Engine

Движок маршрутизации — одна из самых вычислительно сложных подсистем навигатора. Обеспечивает построение оптимальных маршрутов для всех видов транспорта с учётом трафика, ограничений и предпочтений пользователя.

### 4.1 Graph Data Structure

#### 4.1.1 Дорожный граф — представление

```
Реальная дорога:
    A ════════════ B ════════════ C
    Node           Node           Node
    intersection   speed change   intersection

Граф — directed weighted graph G = V, E:
    A ──edge_AB──► B ──edge_BC──► C    forward
    A ◄──edge_BA── B ◄──edge_CB── C    backward

    двустороннее — 2 ребра
    одностороннее — 1 ребро
```

#### 4.1.2 Node structure — in-memory

```c
struct GraphNode {
    uint64_t id;           // 8 bytes
    float    lat;          // 4 bytes — точность ~1м
    float    lon;          // 4 bytes
    float    elevation;    // 4 bytes — высота м
    uint32_t edge_offset;  // 4 bytes — смещение в массиве рёбер
    uint16_t edge_count;   // 2 bytes — кол-во исходящих рёбер
    uint8_t  flags;        // 1 byte  — traffic_signal, barrier
    uint8_t  _padding;     // 1 byte  — alignment
    // Total: 28 bytes per node
};
// Russia: 20M nodes x 28 bytes = ~530 MB
// Planet: 250M nodes x 28 bytes = ~6.5 GB
```

#### 4.1.3 Edge structure — in-memory

```c
struct GraphEdge {
    uint64_t id;               // 8 bytes
    uint32_t from_node_idx;    // 4 bytes
    uint32_t to_node_idx;      // 4 bytes
    float    distance_m;       // 4 bytes — длина в метрах
    float    base_weight;      // 4 bytes — время при free flow сек
    float    traffic_weight;   // 4 bytes — время с трафиком
    uint16_t max_speed;        // 2 bytes — km/h
    uint8_t  road_class;       // 1 byte  — 0..21
    uint8_t  lanes;            // 1 byte
    uint8_t  surface;          // 1 byte  — 0..16
    uint8_t  flags;            // 1 byte  — bridge|tunnel|toll|oneway|roundabout
    uint16_t name_idx;         // 2 bytes — индекс в string table
    uint32_t geometry_offset;  // 4 bytes
    uint16_t geometry_count;   // 2 bytes
    uint16_t restrictions;     // 2 bytes — bitmap поворотов
    // Total: 44 bytes per edge padded
};
// Russia: ~16M edges x 44 bytes = ~670 MB
// Planet: ~200M edges x 44 bytes = ~8.4 GB
```

#### 4.1.4 Размер графа в RAM

| Регион | Nodes | Edges | Node size | Edge size | Total RAM |
|--------|-------|-------|-----------|-----------|-----------|
| Москва | 2M | 1.6M | 53 MB | 67 MB | **~120 MB** |
| Московская обл. | 5M | 4M | 133 MB | 167 MB | **~300 MB** |
| Россия | 20M | 16M | 530 MB | 670 MB | **~1.2 GB** |
| Европа | 80M | 65M | 2.1 GB | 2.7 GB | **~4.8 GB** |
| Планета | 250M | 200M | 6.5 GB | 8.4 GB | **~15 GB** |

> **Contraction Hierarchies добавляют ~100% shortcut edges**, удваивая размер edge массива. Для планеты: ~30 GB RAM.

---

### 4.2 Routing Algorithms

#### 4.2.1 Dijkstra

```
function Dijkstra(G, source, target):
    dist[v] <- INF for all v
    prev[v] <- null for all v
    dist[source] <- 0
    Q <- MinPriorityQueue()
    Q.insert(source, 0)
    settled <- {}

    while Q is not empty:
        u <- Q.extractMin()
        if u == target:
            return reconstructPath(prev, target), dist[target]
        if u in settled: continue
        settled.add(u)
        for each edge (u, v, w) in G.adjacentEdges(u):
            if v in settled: continue
            alt <- dist[u] + w
            if alt < dist[v]:
                dist[v] <- alt
                prev[v] <- u
                Q.insert(v, alt)
    return NO_PATH

Complexity: O((|V| + |E|) x log|V|) с binary heap
```

**Benchmark Dijkstra:**

| Маршрут | Nodes explored | Время | RAM |
|---------|---------------|-------|-----|
| 10 km город | ~50K | 15 ms | 5 MB |
| 50 km | ~200K | 80 ms | 20 MB |
| 100 km межгород | ~500K | 250 ms | 50 MB |
| 500 km | ~2M | 1200 ms | 200 MB |
| 4000 km Москва→Красноярск | ~12M | 8000 ms | 1.2 GB |

#### 4.2.2 A* — A-Star

```
Heuristic: h(v, target) = haversine_distance(v, target) / MAX_SPEED
MAX_SPEED = 130 km/h = 36.11 m/s

Haversine formula:
  a = sin2(dlat/2) + cos(lat1) x cos(lat2) x sin2(dlon/2)
  c = 2 x atan2(sqrt(a), sqrt(1-a))
  d = R x c        // R = 6,371,000 м
```

**Benchmark A* vs Dijkstra:**

| Маршрут | Dijkstra nodes | A* nodes | Speedup | A* время |
|---------|---------------|---------|---------|---------|
| 10 km город | 50K | 15K | 3.3x | 5 ms |
| 50 km | 200K | 40K | 5x | 16 ms |
| 100 km | 500K | 80K | 6.2x | 35 ms |
| 500 km | 2M | 250K | 8x | 100 ms |
| 4000 km | 12M | 1M | 12x | 600 ms |

#### 4.2.3 Contraction Hierarchies — CH

```
===== PREPROCESSING =====
1. Node ordering по importance:
   importance(v) = edge_difference + contracted_neighbors + search_space_size
   edge_difference = shortcuts_added - edges_removed

2. Node contraction от least к most important:
   Для каждой пары (u,w) где u->v->w — кратчайший путь:
   Добавить shortcut u->w с весом = w(u->v) + w(v->w)

===== QUERY bidirectional =====
   Forward search from s: только ВВЕРХ по иерархии
   Backward search from t: только ВВЕРХ по иерархии
   Meeting point = optimal path
   Nodes visited: 300-500 для ЛЮБОГО маршрута на планете
```

**Benchmark CH:**

| Метрика | Russia | Planet |
|---------|--------|--------|
| Preprocessing time | 15 мин | 4–6 часов |
| Preprocessing RAM | 4 GB | 60 GB |
| Shortcut edges | ~15M ~100% | ~200M |
| **Query time ANY route** | **< 1 ms** | **< 1 ms** |
| Query time p99 | 2 ms | 5 ms |

**Ограничение:** Не поддерживает dynamic weights → полный rebuild.

#### 4.2.4 Multi-Level Dijkstra — MLD

Граф делится на cells — METIS partitioning.
- Level 0: ~2000 nodes per cell
- Level 1: ~20K nodes
- Level 2: ~200K nodes
Boundary nodes между cells → overlay graph.

**При изменении трафика → пересчёт ТОЛЬКО затронутой cell.**

#### 4.2.5 Customizable Contraction Hierarchies — CCH

```
Phase 1: Preprocessing — один раз, topology only, 1-2 часа planet
Phase 2: Customization — при каждом обновлении трафика, 1-5 сек planet
Phase 3: Query — bidirectional upward search, < 1 ms
```

**Сравнительная таблица:**

| Алгоритм | Preprocessing | Query time | Dynamic weights | RAM Planet |
|----------|--------------|-----------|----------------|-----------|
| Dijkstra | 0 | 8000 ms | Native | 15 GB |
| A* | 0 | 600 ms | Native | 15 GB |
| CH | 4–6 часов | < 1 ms | Full rebuild | 30 GB |
| MLD | 30 мин | ~5 ms | Per-cell сек | 25 GB |
| **CCH** | **1–2 часа** | **< 1 ms** | **Customize сек** | **35 GB** |

---

### 4.3 Valhalla Configuration

Valhalla — открытый routing engine, используемый как основной routing backend.

#### 4.3.1 Ключевые параметры costing models

**auto — легковой автомобиль:**

| Параметр | Default | Range | Описание |
|----------|---------|-------|----------|
| maneuver_penalty | 5.0 | 0–50 | Штраф за маневр сек |
| destination_only_penalty | 600.0 | 0–1000 | Штраф за destination-only дороги |
| gate_cost | 30.0 | 0–300 | Стоимость проезда через ворота |
| gate_penalty | 300.0 | 0–1000 | Штраф за ворота |
| toll_booth_cost | 15.0 | 0–300 | Стоимость toll booth |
| country_crossing_cost | 600.0 | 0–3600 | Пересечение границы |
| ferry_cost | 300.0 | 0–3600 | Стоимость парома |
| use_highways | 1.0 | 0–1 | Предпочтение магистралей |
| use_tolls | 0.5 | 0–1 | Готовность платить за toll |
| use_ferry | 1.0 | 0–1 | Готовность использовать паром |
| use_living_streets | 0.1 | 0–1 | Использование жилых зон |
| top_speed | 130 | 10–252 | Макс скорость km/h |
| closure_factor | 9.0 | 1–20 | Множитель для закрытых дорог |

**truck — грузовой:**

| Параметр | Default | Range | Описание |
|----------|---------|-------|----------|
| height | 4.11 | 1.9–10 | Высота ТС м |
| width | 2.6 | 1.0–5.0 | Ширина м |
| length | 21.64 | 1.0–50 | Длина м |
| weight | 21.77 | 0.5–100 | Полная масса т |
| axle_load | 9.07 | 0.5–20 | Нагрузка на ось т |
| axle_count | 5 | 2–10 | Количество осей |
| hazmat | false | bool | Опасный груз |
| top_speed | 90 | 10–120 | Макс скорость km/h |
| exclude_unpaved | true | bool | Избегать грунтовых |

**pedestrian — пешеходный:**

| Параметр | Default | Range | Описание |
|----------|---------|-------|----------|
| walking_speed | 5.1 | 0.5–25 | Скорость ходьбы km/h |
| walkway_factor | 1.0 | 0–10 | Множитель для пешеходных дорожек |
| sidewalk_factor | 1.0 | 0–10 | Множитель для тротуаров |
| alley_factor | 2.0 | 0–10 | Штраф за переулки |
| driveway_factor | 5.0 | 0–10 | Штраф за подъездные пути |
| step_penalty | 30.0 | 0–300 | Штраф за лестницу |
| use_hills | 0.5 | 0–1 | Готовность к подъёмам |

**bicycle — велосипед:**

| Параметр | Default | Range | Описание |
|----------|---------|-------|----------|
| cycling_speed | 20.0 | 5–50 | Скорость km/h |
| use_roads | 0.5 | 0–1 | Использование автодорог |
| use_hills | 0.5 | 0–1 | Готовность к подъёмам |
| avoid_bad_surfaces | 0.25 | 0–1 | Избегание плохих покрытий |
| bicycle_type | Hybrid | Road/Hybrid/Cross/Mountain | Тип велосипеда |

#### 4.3.2 Turn costs по типам дорог

| Тип поворота | Motorway сек | Primary сек | Residential сек | Service сек |
|-------------|-------------|------------|----------------|------------|
| through прямо | 0 | 0 | 0 | 0 |
| slight_right | 1 | 1 | 1 | 1 |
| right | 2 | 5 | 3 | 2 |
| sharp_right | 3 | 8 | 5 | 3 |
| slight_left | 1 | 2 | 2 | 1 |
| left через встречку | 5 | 15 | 10 | 5 |
| sharp_left | 8 | 20 | 12 | 5 |
| u_turn | 30 | 30 | 20 | 10 |
| traffic_signal | 8 | 15 | 10 | 5 |
| stop_sign | 3 | 5 | 5 | 3 |
| roundabout entry | 5 | 10 | 8 | 5 |

---

### 4.4 Route Types & Profiles

| Профиль | Описание | max_speed | Restrictions |
|---------|----------|-----------|-------------|
| `car_fastest` | Авто быстрейший | 130 km/h | Стандартные |
| `car_shortest` | Авто кратчайший | 130 km/h | Стандартные |
| `car_economical` | Авто экономичный | 100 km/h | Избегание резких ускорений |
| `truck` | Грузовой | 90 km/h | height/weight/width/hgv |
| `truck_hazmat` | Грузовой опасный груз | 80 km/h | + tunnel ban, residential ban |
| `pedestrian` | Пешеходный | 5.1 km/h | foot_access |
| `pedestrian_wheelchair` | Инвалидная коляска | 4 km/h | no steps, wheelchair=yes |
| `bicycle` | Велосипед город | 25 km/h | bicycle_access |
| `bicycle_mountain` | MTB | 15 km/h | Prefer trails |
| `bicycle_road` | Шоссейный | 35 km/h | Avoid bad surfaces |
| `motorcycle` | Мотоцикл | 130 km/h | motorcycle_access |
| `public_transport` | Мультимодальный | — | GTFS + walk |
| `emergency` | Экстренные | 150 km/h | Ignore oneways, bus lanes |
| `taxi` | Такси | 130 km/h | bus_lanes = allow |

---

### 4.5 Route Response Format

```json
{
    "trip": {
        "language": "ru-RU",
        "status": 0,
        "status_message": "Found route between points",
        "units": "kilometers",
        "locations": [
            {"type": "break", "lat": 55.753215, "lon": 37.622504,
             "street": "улица Тверская", "city": "Москва"},
            {"type": "break", "lat": 55.718680, "lon": 37.631630,
             "street": "Ленинский проспект", "city": "Москва"}
        ],
        "legs": [{
            "summary": {
                "time": 1260, "length": 8.734,
                "has_toll": false, "has_highway": true, "has_ferry": false
            },
            "shape": "_yvlIqgqcDeGrBsFlA}EzAoFhBeG...",
            "maneuvers": [
                {
                    "type": 1,
                    "instruction": "Двигайтесь на юг по улице Тверская.",
                    "verbal_pre_transition_instruction": "Двигайтесь на юг по улице Тверская 1.2 километра.",
                    "street_names": ["улица Тверская"],
                    "begin_shape_index": 0, "end_shape_index": 45,
                    "length": 1.234, "time": 180,
                    "travel_mode": "drive", "travel_type": "car"
                },
                {
                    "type": 15,
                    "instruction": "Поверните налево на Садовое кольцо.",
                    "street_names": ["Садовое кольцо", "Б. Садовая ул."],
                    "begin_shape_index": 45, "end_shape_index": 89,
                    "length": 2.100, "time": 300,
                    "travel_mode": "drive"
                },
                {
                    "type": 4,
                    "instruction": "Вы прибыли в пункт назначения.",
                    "begin_shape_index": 156, "end_shape_index": 156,
                    "length": 0, "time": 0
                }
            ]
        }],
        "summary": {"time": 1260, "length": 8.734}
    },
    "alternates": [
        {"trip": {"summary": {"time": 1380, "length": 7.200, "has_highway": false}}},
        {"trip": {"summary": {"time": 1150, "length": 10.500, "has_toll": true}}}
    ]
}
```

**Maneuver types — ключевые:**

| Code | Type | Описание ru |
|------|------|------------|
| 1 | kStart | Начало маршрута |
| 4 | kDestination | Прибытие |
| 8 | kContinue | Продолжайте |
| 9 | kSlightRight | Немного правее |
| 10 | kRight | Направо |
| 15 | kLeft | Налево |
| 13 | kUturnLeft | Разворот |
| 25 | kMerge | Вливайтесь |
| 26 | kRoundaboutEnter | Въезд на круг |
| 27 | kRoundaboutExit | Съезд с круга |
| 28 | kFerryEnter | Посадка на паром |

---

### 4.6 Isochrone / Isodistance

**Изохроны** — зоны доступности за N минут / N км от точки.

**Запрос:**
```json
{
    "locations": [{"lat": 55.7558, "lon": 37.6173}],
    "costing": "auto",
    "contours": [
        {"time": 5, "color": "ff0000"},
        {"time": 10, "color": "ffff00"},
        {"time": 15, "color": "00ff00"},
        {"time": 30, "color": "0000ff"}
    ],
    "polygons": true,
    "denoise": 0.5,
    "generalize": 50
}
```

**Ответ — GeoJSON FeatureCollection с Polygon для каждого контура.**

**Применение в ECOMANSONI:**
- **Такси:** Зона покрытия водителей за 5/10/15 мин
- **Доставка:** Зоны доставки 30/45/60 мин
- **Страхование:** Гео-зоны для расчёта стоимости полиса
- **CRM:** Анализ доступности клиентов

---

### 4.7 Matrix Routing

**Distance/Time matrix NxN — кратчайшие расстояния между N точками.**

**Лимиты:**

| Параметр | Значение |
|----------|---------|
| Max sources x targets | 2,500 пар |
| Max sources | 50 |
| Max targets | 50 |
| Max distance per pair | 400 km |
| Timeout | 30 сек |
| Rate limit | 100 req/sec |

**Применение:**
- Такси: поиск ближайшего из N свободных водителей
- Доставка: оптимизация распределения заказов
- Логистика: кластеризация адресов

---

### 4.8 Route Optimization TSP/VRP

#### 4.8.1 TSP — Traveling Salesman Problem
Кратчайший маршрут через все точки. Valhalla `optimized_route` API.

#### 4.8.2 VRP — Vehicle Routing Problem
Интеграция с VROOM — Vehicle Routing Open-source Optimization Machine.

**Поддерживаемые VRP варианты:**

| Вариант | Описание | Constraints |
|---------|----------|------------|
| CVRP | Capacitated VRP | Ёмкость ТС |
| VRPTW | VRP with Time Windows | Временные окна |
| VRPPD | Pickup and Delivery | Забор + доставка |
| MDVRP | Multi-Depot | Несколько складов |
| OVRP | Open VRP | Без возврата |

---

### 4.9 Weight Formula

```
weight(edge) = base_travel_time
             + traffic_penalty
             + turn_cost
             + road_priority_penalty
             + surface_penalty
             + toll_penalty
             + elevation_penalty
             + time_restriction_penalty
             + access_penalty
```

#### Детальное описание компонентов:

**1. base_travel_time:**
```
base_travel_time = edge.distance_m / effective_speed
effective_speed = min(edge.max_speed, profile.top_speed) x surface_factor
```

**2. traffic_penalty:**
```
speed_ratio = current_speed / free_flow_speed
traffic_penalty = base_travel_time x (1/speed_ratio - 1)

Пример: free_flow=60, current=15 km/h
speed_ratio = 0.25
penalty = 30 x (4 - 1) = 90 сек → итого 120 сек вместо 30
```

**3. turn_cost:**
```
turn_cost = base_turn_penalty[turn_type][road_class]
          + (traffic_signal ? 15 : 0)
          + (stop_sign ? 5 : 0)
```

**4. road_priority_penalty — множители для car_fastest:**

| road_class | Множитель | Эффект |
|-----------|----------|--------|
| motorway | 0.8 | Бонус -20% |
| trunk | 0.85 | -15% |
| primary | 0.9 | -10% |
| secondary | 1.0 | Нейтрально |
| tertiary | 1.05 | +5% |
| residential | 1.15 | +15% |
| living_street | 1.5 | +50% |
| service | 2.0 | +100% |
| track | 5.0 | +400% |

**5. surface_penalty — speed factors:**

| Surface | Factor |
|---------|--------|
| asphalt | 1.0 |
| concrete | 0.95 |
| paving_stones | 0.85 |
| cobblestone | 0.65 |
| gravel | 0.6 |
| dirt | 0.4 |
| sand | 0.25 |
| mud | 0.15 |

**6. toll_penalty:**
```
use_tolls = 0..1 (user setting, default 0.5)
if edge.toll:
  toll_penalty = (1.0 - use_tolls) x 600  // 0..600 сек
```

**7. elevation_penalty — grade factors:**

| Grade % | Auto factor | Truck factor | Bicycle factor |
|---------|------------|-------------|---------------|
| 0% | 1.0 | 1.0 | 1.0 |
| 5% | 1.02 | 1.05 | 1.30 |
| 10% | 1.08 | 1.15 | 2.00 |
| 15% | 1.20 | 1.35 | 3.50 |
| 20% | 1.40 | 1.60 | 5.00 |

#### Итоговый пример расчёта:

```
Edge: ул. Тверская, 500m, 60 km/h, asphalt, primary, no toll
Traffic: current 25 km/h heavy congestion
Turn: left turn with traffic signal

base_travel_time  = 500 / 16.67           = 30.0 сек
traffic_penalty   = 30.0 x (60/25 - 1)   = 42.0 сек
turn_cost         = 15 + 15               = 30.0 сек left + signal
road_priority     = 30.0 x (0.9 - 1.0)   = -3.0 сек бонус primary
surface_penalty   = 0                     = 0 сек asphalt
toll_penalty      = 0                     = 0 сек no toll
elevation_penalty = 0                     = 0 сек flat
access_penalty    = 0                     = 0 сек

TOTAL WEIGHT = 30 + 42 + 30 + (-3) = 99.0 сек

Без трафика: 30 + 0 + 30 + (-3) = 57 сек
С трафиком: 99 сек (x1.74 дольше)
```

---

## Приложение A: Glossary

| Термин | Определение |
|--------|-----------|
| **CH** | Contraction Hierarchies — мгновенные запросы через preprocessing |
| **CCH** | Customizable CH — CH с обновляемыми весами |
| **MLD** | Multi-Level Dijkstra — multi-level partitioning |
| **MVT** | Mapbox Vector Tile — бинарный формат protobuf |
| **GiST** | Generalized Search Tree — spatial index в PostgreSQL |
| **H3** | Hexagonal Hierarchical Spatial Index от Uber |
| **S2** | Spherical geometry library от Google |
| **SRTM** | Shuttle Radar Topography Mission — рельеф NASA |
| **OSRM** | Open Source Routing Machine |
| **Valhalla** | Open-source routing engine от Mapzen |
| **PostGIS** | PostgreSQL extension для пространственных данных |
| **PBF** | Protocol Buffer Binary Format |
| **TSP** | Traveling Salesman Problem |
| **VRP** | Vehicle Routing Problem |
| **ETA** | Estimated Time of Arrival |
| **GTFS** | General Transit Feed Specification |
| **DEM** | Digital Elevation Model |
| **KNN** | K-Nearest Neighbors |
| **LOD** | Level of Detail |

---

> **Следующая часть:** [Part 2: Real-Time Traffic & Live Data](./02-real-time-traffic.md)
> Содержание: Traffic Engine, GPS Tracking, Live Traffic Aggregation, Speed Prediction ML, Incident Detection, Road Events, Weather Integration.