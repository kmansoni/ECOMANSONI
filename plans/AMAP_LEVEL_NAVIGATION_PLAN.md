# План достижения уровня Amap Navigation

## Анализ текущего состояния vs Amap

### ✅ Что УЖЕ есть
| Компонент | Статус | Файл |
|-----------|--------|------|
| 3D карта MapLibre | Работает | `MapLibre3D.tsx` |
| Routing (A*/Dijkstra + OSRM + Valhalla) | Работает | `routing.ts` |
| Lane assist (turn:lanes OSM) | Базовый | `laneAssist.ts` |
| Speed cameras | Работает | `speedCameras.ts` |
| Traffic overlay | Работает | `trafficProvider.ts` |
| Dynamic rerouting | Работает | `dynamicRerouter.ts` |
| Voice instructions (Russian) | Работает | `voiceAssistant.ts` |
| Turn-by-turn | Работает | `turnInstructions.ts` |
| Predictive ETA | Работает | `predictiveETA.ts` |
| Offline routing | Работает | `routing.ts` (Dijkstra) |
| Traffic lights | Работает | `trafficLightTiming.ts` |

### ❌ Что КРИТИЧЕСКИ не хватает для Amap
| Компонент | Приоритет | Сложность |
|-----------|-----------|-----------|
| HMM Map-Matching (GPS→дорога) | 🔴 P0 | Высокая |
| Contraction Hierarchies (быстрый routing) | 🔴 P0 | Высокая |
| Lane-level graph (не turn:lanes, а полный граф полос) | 🔴 P0 | Очень высокая |
| GPS Kalman Filter (сглаживание) | 🔴 P0 | Средняя |
| Speed limit HUD | 🟡 P1 | Низкая |
| 3D road geometry (разметка, барьеры) | 🟡 P1 | Высокая |
| Route progress bar (вертикальный) | 🟡 P1 | Средняя |
| 3D interchange visualization | 🟡 P1 | Очень высокая |
| 3D car model (вместо иконки) | 🟢 P2 | Средняя |
| HD Vector Tile pipeline | 🟢 P2 | Высокая |

---

## Этапы реализации

### ЭТАП 1: GPS Foundation (Map-Matching + Kalman Filter)
**Цель:** Машина перестаёт "прыгать" по карте

1. **Kalman Filter** — сглаживание GPS шума
   - Модель: position + velocity state
   - Фьюжн GPS + акселерометр + компас
   - Предсказание позиции между GPS-фиксами
   
2. **HMM Map-Matching** — привязка к дороге
   - Emission probability: расстояние GPS → кандидат-ребро
   - Transition probability: кратчайший путь между кандидатами
   - Viterbi decoder → оптимальная последовательность рёбер

### ЭТАП 2: Routing Engine (Contraction Hierarchies)
**Цель:** Routing <50ms на графе 10M+ рёбер

1. **Preprocessing** — сжатие графа (shortcut edges)
2. **Bidirectional Dijkstra** на CH-графе
3. **Metric-dependent CH** (time vs distance)
4. **Кеширование** — LRU cache маршрутов

### ЭТАП 3: Lane-Level Navigation
**Цель:** Подсветка правильной полосы как в Amap

1. **Lane graph** — отдельный граф полос поверх road graph
2. **Lane connectivity** — какая полоса куда ведёт на перекрёстке
3. **Lane recommendation engine** — рекомендация полосы за 500m-1km
4. **Lane visualization** — 3D рендер полос с подсветкой

### ЭТАП 4: 3D Road Rendering
**Цель:** Визуализация уровня Amap

1. **Road surface** — WebGL отрисовка дорожного полотна с полосами
2. **Lane markings** — пунктирные/сплошные линии
3. **Barriers/guardrails** — 3D объекты
4. **Speed signs** — 3D знаки на карте
5. **Bridge/overpass** — elevated geometry

### ЭТАП 5: Navigation HUD
**Цель:** Информационная панель как в Amap

1. **Speed limit display** — текущий лимит из OSM maxspeed
2. **Route progress bar** — вертикальная полоска справа
3. **Camera countdown** — обратный отсчёт до камеры
4. **Junction diagram** — схема развязки при подъезде

### ЭТАП 6: Production Hardening
**Цель:** Стабильность при реальном использовании

1. **Anti-GPS spoofing** — anomaly detection
2. **Offline fallback chain** — каждый слой с fallback
3. **Battery optimization** — adaptive GPS polling
4. **Performance budget** — 60fps рендер, <100ms routing
