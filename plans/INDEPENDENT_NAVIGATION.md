# 🚀 Независимая навигационная система - ПОЛНАЯ ПЕРЕПИСЬ

**Цель:** Создать 100% независимую навигацию без внешних API  
**Принцип:** Все данные локально, весь рендеринг свой, никаких зависимостей от Google/Yandex/Amap

---

## АРХИТЕКТУРА НЕЗАВИСИМОЙ СИСТЕМЫ

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    МОБИЛЬНОЕ ПРИЛОЖЕНИЕ                                │
├─────────────────────────────────────────────────────────────────────────┤
│  UI (React Native / SwiftUI / Jetpack Compose)                        │
│       ↓                                                                 │
│  VIRTUAL DOM → NATIVE UI (свой движок)                                 │
│       ↓                                                                 │
│  C++ ENGINE (рендеринг, навигация)                                     │
│       ↓                                                                 │
│  DATA LAYER (локальные данные)                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                       ЛОКАЛЬНЫЕ ДАННЫЕ                                  │
├─────────────────┬─────────────────┬─────────────────┬────────────────────┤
│   MAP TILES     │   ROAD GRAPH    │      POI       │   GEOCODING        │
│   (OSM/свои)    │   (OSM/Valhalla)│   (свой DB)    │   (свой engine)    │
└─────────────────┴─────────────────┴─────────────────┴────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      BACKEND (опционально)                             │
├─────────────────────────────────────────────────────────────────────────┤
│  FastAPI (существующий)                                                │
│  - Routing: Valhalla (можно заменить на свой)                          │
│  - No external APIs                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## ФАЗА 1: ЛОКАЛЬНЫЕ ДАННЫЕ (Дни 1-30)

### Неделя 1: Скачивание и подготовка OSM данных

```
─────────────────────────────────────────────────────────────────────────────
ЗАДАЧА 1.1: СКРИПТ ЗАГРУЗКИ OSM ДАННЫХ
─────────────────────────────────────────────────────────────────────────────

Создай Python скрипт для автоматической загрузки OSM данных:

1. REGION SELECTOR:
   - Список доступных регионов (страны, области, города)
   - Выбор регионов для скачивания
   - Проверка доступного места на диске

2. DOWNLOADER:
   - Sources:
     - Geofabrik (https://download.geofabrik.de/)
     - Protomaps (https://protomaps.com/downloads)
     - BBBike (https://download.bbbike.org/)
   
   - Formats: PBF (compressed), XML (full)
   - Chunked download для больших файлов
   - Resume support

3. PROCESSOR:
   - osm2pgsql → PostGIS (roads, POI)
   - osmium → Fast extraction
   - Filter: только нужные данные (roads, buildings, pois)

4. STORAGE:
   - PostgreSQL + PostGIS (дороги, POI)
   - SQLite (офлайн карты)
   - Файловая система (тайлы)

Создай: scripts/download_osm_data.py
Тесты: tests/test_osm_downloader.py
Документация: docs/data/osm-pipeline.md
```

```
─────────────────────────────────────────────────────────────────────────────
ЗАДАЧА 1.2: ГЕНЕРАТОР ТАЙЛОВ
─────────────────────────────────────────────────────────────────────────────

Создай систему генерации картографических тайлов из OSM:

1. TILE GENERATOR:
   - Input: OSM XML/PBF data
   - Output: PNG/WebP tiles (z/x/y format)
   - Tool: Planetiler или собственная реализация
   
2. STYLE CONFIGURATOR:
   - Стили для разных zoom levels
   - Day/Night themes
   - Custom colors (своя схема)
   
3. CACHE LAYERS:
   - RAM cache (100MB LRU)
   - Disk cache (указанная директория)
   - Pre-generation для常用 regions

4. TILING SCHEME:
   - Zoom: 1-18
   - TMS scheme (y flipped)
   - Support vector tiles (MVT)

Создай: services/tile_generator.py
Команда: python -m mansoni tiles generate --region russia
```

```
─────────────────────────────────────────────────────────────────────────────
ЗАДАЧА 1.3: ROAD GRAPH ДЛЯ МАРШРУТИЗАЦИИ
─────────────────────────────────────────────────────────────────────────────

Создай локальный дорожный граф:

1. GRAPH EXTRACTOR:
   - Из OSM данных: highways, roads, paths
   - Атрибуты: speed, weight, surface, access
   - Topology: nodes + edges

2. WEIGHT CALCULATOR:
   - Время проезда = distance / speed
   - Учёт: traffic lights, turns, surface
   - Профили: car, bicycle, pedestrian

3. ROUTING ENGINE (свой):
   - A* algorithm (основной)
   - Dijkstra (для альтернатив)
   - Contraction Hierarchies (ускорение)
   
   ИЛИ используй Valhalla локально (уже есть в проекте)

4. STORAGE:
   - Binary format (.grapgh, .bin)
   - Memory-mapped для быстрого доступа
   - Incremental updates

Создай: services/road_graph.py
Документация: docs/routing/local-graph.md
```

```
─────────────────────────────────────────────────────────────────────────────
ЗАДАЧА 1.4: POI DATABASE
─────────────────────────────────────────────────────────────────────────────

Создай локальную базу POI:

1. POI EXTRACTOR:
   - Из OSM: amenity, shop, tourism, leisure
   - Категоризация: еда, отели, парковки, АЗС...
   - Full text search-ready

2. SEARCH ENGINE:
   - SQLite FTS5 (full text search)
   - Spatial query (R-tree)
   - Fuzzy matching (ошибки ввода)
   - Ranking (популярность, расстояние)

3. CATEGORIES:
   - Своя категоризация (не依赖 OSM тегов)
   - Icons для каждой категории
   - Filter by category

4. OFFLINE MODE:
   - Download POI для региона
   - Update detection
   - Incremental sync

Созди: services/poi_engine.py
Schema: database/poi_schema.sql
```

### Неделя 2: Геокодинг и поиск

```
─────────────────────────────────────────────────────────────────────────────
ЗАДАЧА 2.1: LOCAL GEOCODER
─────────────────────────────────────────────────────────────────────────────

Создай свой геокодер без внешних API:

1. FORWARD GEOCODING (address → coords):
   - Парсинг адреса (город, улица, дом)
   - Поиск в POI базе
   - Интерполяция (если есть данные о домах)
   - Fuzzy matching

2. REVERSE GEOCODING (coords → address):
   - Spatial query: nearest road segment
   -nearest building
   - Nearest POI
   - Admin boundaries

3. DATA SOURCES:
   - OSM addr:* tags
   - OpenAddresses dataset
   - Natural Earth (admin boundaries)

4. RANKING:
   - Exact match → high score
   - Partial match → medium score
   - Fuzzy → low score

Создай: services/geocoder.py
API: /api/v1/geocode (локальный)
```

```
─────────────────────────────────────────────────────────────────────────────
ЗАДАЧА 2.2: SEARCH ENGINE
─────────────────────────────────────────────────────────────────────────────

Создай поисковый движок:

1. QUERY PARSER:
   - Токенизация (пробелы, спецсимволы)
   - Нормализация (нижний регистр, ударение)
   - Synonyms (аптека=фармация)
   
2. SEARCH INDEX:
   - Inverted index (term → documents)
   - FTS5 в SQLite
   - Prefix search (автодополнение)

3. RANKING ALGORITHM:
   - TF-IDF based
   - Distance to user location
   - Popularity (clickthrough)
   - Category boost

4. RESULTS:
   - Pagination
   - Highlight matching terms
   - Categories grouping
   - Map preview

Создай: services/search_engine.py
```

### Неделя 3-4: Офлайн режим

```
─────────────────────────────────────────────────────────────────────────────
ЗАДАЧА 3.1: OFFLINE PACKAGE MANAGER
─────────────────────────────────────────────────────────────────────────────

Создай систему офлайн-пакетов:

1. PACKAGE STRUCTURE:
   - region_id + version + size
   - Содержимое:
     - tiles (z10-z16)
     - road_graph (routing-ready)
     - poi_index (searchable)
     - geocoding_data
     - routes_cache

2. DOWNLOAD MANAGER:
   - Background download
   - Pause/resume
   - WiFi-only option
   - Storage management

3. PACKAGE BUILDER:
   - Compress (LZ4/ZSTD)
   - Chunk for streaming
   - Checksum verification

4. UPDATES:
   - Diff-based updates
   - Version checking
   - Auto-update on WiFi

Создай: services/offline_manager.py
CLI: mansoni offline download russia
```

---

## ФАЗА 2: СВОЙ РЕНДЕРИНГ (Дни 31-60)

### Неделя 5: WebGL рендерер

```
─────────────────────────────────────────────────────────────────────────────
ЗАДАЧА 4.1: CANVAS/WebGL MAP RENDERER
─────────────────────────────────────────────────────────────────────────────

Создай свой рендерер карты:

1. RENDERING ENGINE:
   - Canvas 2D (базовый, для старта)
   - WebGL (для 3D/производительность)
   - TileRenderer (загрузка + отрисовка)
   
2. LAYERS:
   - Base tiles (дороги, здания, вода)
   - POI markers (icons + labels)
   - User location (blue dot + accuracy)
   - Routes (polylines)
   - Traffic (colored lines, если есть данные)

3. INTERACTIONS:
   - Pan/zoom (touch + mouse)
   - Rotation (two-finger rotate)
   - Tilt (two-finger tilt)
   - Double-tap zoom

4. PERFORMANCE:
   - 60 FPS target
   - Frustum culling
   - LOD (level of detail)
   - Texture reuse

Создай: components/MapRenderer.tsx
Технология: MapLibre GL JS (open source, не требует API)
```

```
─────────────────────────────────────────────────────────────────────────────
ЗАДАЧА 4.2: MAP STYLING SYSTEM
─────────────────────────────────────────────────────────────────────────────

Создай систему стилизации карты:

1. STYLE SPEC:
   - JSON-based style specification
   - Layers: background, water, landuse, roads, buildings, pois
   - Filters: zoom, visibility
   - Paint: colors, opacity, width

2. THEMES:
   - Day theme (светлая)
   - Night theme (тёмная)
   - Custom theme (пользовательский)

3. VISUAL EFFECTS:
   - 3D buildings (extrusion)
   - Hillshade (рельеф)
   - Labels (все языки)

4. TOOLS:
   - Style editor (web-based)
   - Preview на разных zoom
   - Export/import styles

Созди: assets/styles/
Документация: docs/rendering/style-spec.md
```

### Неделя 6: Навигация

```
─────────────────────────────────────────────────────────────────────────────
ЗАДАЧА 5.1: TURN-BY-TURN NAVIGATION ENGINE
─────────────────────────────────────────────────────────────────────────────

Создай полноценный навигатор:

1. GUIDANCE ENGINE:
   - Maneuver generation (turn, merge, depart, arrive)
   - Distance to maneuver (announce at 500m, 200m, 50m)
   - Street names
   - Lane guidance (если есть данные)

2. ROUTE TRACKING:
   - Snap to route (привязка к маршруту)
   - Off-route detection (>30m deviation)
   - Recalculation (локальный пересчёт)
   - Alternative routes

3. ETA CALCULATION:
   - Distance remaining
   - Time remaining
   - Average speed (историческая)
   - Traffic (если есть данные)

4. VOICE INSTRUCTIONS:
   - TTS (browser native или локальный)
   - Queue of instructions
   - Repeat on demand

Создай: services/navigation_engine.ts
Интеграция: navigation_server (существующий)
```

---

## ФАЗА 3: МОБИЛЬНЫЙ КЛИЕНТ (Дни 61-90)

### Неделя 7-8: React Native приложение

```
─────────────────────────────────────────────────────────────────────────────
ЗАДАЧА 6.1: NAVIGATOR APP - BASE
─────────────────────────────────────────────────────────────────────────────

Создай полноценное приложение навигатора:

1. SCREENS:
   - MapScreen (главный экран)
   - SearchScreen (поиск)
   - RouteScreen (построение маршрута)
   - NavigateScreen (ведущая навигация)
   - SettingsScreen (настройки)
   
2. NAVIGATION:
   - React Navigation (stack + tabs)
   - Deep linking support
   - Background navigation

3. MAP INTEGRATION:
   - MapRenderer (из задачи 4.1)
   - Offline maps support
   - Cached tiles

4. LOCATION:
   - GPS tracking
   - Background location
   - Geofencing

Созди: apps/navigator/
Стек: React Native + TypeScript
```

### Неделя 9: Нативные приложения

```
─────────────────────────────────────────────────────────────────────────────
ЗАДАЧА 7.1: ANDROID APP (KOTLIN)
─────────────────────────────────────────────────────────────────────────────

Создай нативное Android приложение:

1. ARCHITECTURE:
   - Kotlin + Jetpack Compose
   - Clean Architecture
   - MVVM
   
2. MAP:
   - Custom View с WebGL canvas
   - Tile loading (локальные файлы)
   - Offline support

3. FEATURES:
   - GPS navigation
   - Offline maps
   - Route calculation
   - Voice guidance

Созди: apps/navigator-android/
Build: Gradle
```

```
─────────────────────────────────────────────────────────────────────────────
ЗАДАЧА 7.2: IOS APP (SWIFT)
─────────────────────────────────────────────────────────────────────────────

Создай нативное iOS приложение:

1. ARCHITECTURE:
   - Swift + SwiftUI
   - MVVM
   
2. MAP:
   - MapKit wrapper + custom rendering
   - Offline tiles
   - 3D buildings

3. FEATURES:
   - Turn-by-turn
   - Offline mode
   - CarPlay support

Созди: apps/navigator-ios/
Build: Xcode
```

---

## ФАЗА 4: ОПТИМИЗАЦИЯ (Дни 91-120)

```
─────────────────────────────────────────────────────────────────────────────
ЗАДАЧА 8.1: PERFORMANCE OPTIMIZATION
─────────────────────────────────────────────────────────────────────────────

Оптимизируй производительность:

1. STARTUP:
   - Lazy load modules
   - Preload critical tiles
   - Skeleton UI

2. RENDERING:
   - 60 FPS target
   - Hardware acceleration
   - Frame budget monitoring

3. MEMORY:
   - Tile cache management
   - Bitmap recycling
   - Memory monitoring

4. BATTERY:
   - GPS duty cycling
   - Background restrictions
   - Efficient algorithms

Документируй: docs/performance/benchmarks.md
```

---

## ИТОГОВАЯ СТРУКТУРА ПРОЕКТА

```
mansoni/
├── apps/
│   ├── navigator/           # React Native (главное приложение)
│   ├── navigator-android/   # Android нативное
│   └── navigator-ios/       # iOS нативное
│
├── services/                # Бизнес-логика
│   ├── tile_generator.py   # Генерация тайлов
│   ├── road_graph.py       # Дорожный граф
│   ├── poi_engine.py       # POI поиск
│   ├── geocoder.py         # Геокодинг
│   ├── search_engine.py    # Поиск
│   ├── offline_manager.py  # Офлайн менеджер
│   └── navigation_engine.ts# Навигация
│
├── components/
│   └── MapRenderer.tsx     # Рендерер карты
│
├── assets/
│   └── styles/             # Стили карт
│
├── scripts/
│   └── download_osm_data.py# Загрузка OSM
│
├── navigation_server/      # Существующий (расширить)
│
└── database/
    └── schemas/            # Схемы БД
```

---

## КЛЮЧЕВЫЕ ПРИНЦИПЫ

| Принцип | Реализация |
|---------|------------|
| **Независимость от API** | Все данные локально из OSM |
| **Офлайн-first** | Работа без интернета |
| **Open Source** | Никаких проприетарных SDK |
| **Свой рендеринг** | Canvas/WebGL, не Google/Amap |
| **Свой routing** | Valhalla локально или свой A* |

---

## ПЕРВЫЕ ШАГИ (начни сегодня)

1. **Создай скрипт загрузки OSM** → `scripts/download_osm_data.py`
2. **Настрой локальный тайл-сервер** → используй Mbtiles или tileserver-gl
3. **Подключи MapLibre GL** (без API ключей, OSM тайлы)
4. **Расшири routing_service** для офлайн режима
5. **Создай базовый UI** на React Native

Начать с задачи 1.1?