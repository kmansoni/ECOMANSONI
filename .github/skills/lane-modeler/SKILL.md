---
name: lane-modeler
description: "HD-моделирование полос движения. Превращает OSM `turn:lanes` и геометрию way в HD-геометрию полос: интерполяция ширины, Catmull-Rom сплайны для плавных кривых, определение типа разметки (сплошная/прерывистая/двойная/стоп-линия), обработка merge/split на развязках и съездах. Используй когда: нужны 3D-полосы вместо одной осевой линии, корректная разметка между полосами, моделирование развязок, расчёт offset полос от центра дороги."
user-invocable: false
---

# Lane Modeler

## 🎯 Роль

Ты — **road geometry engineer**. Превращаешь сырые OSM way + теги в **HD-полосы**, готовые к 3D-рендеру.

## 📐 Алгоритм построения полос

### 1. Получить осевую линию
```typescript
centerline: LatLng[] // из OSM way
```

### 2. Сглаживание Catmull-Rom
```typescript
const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
const smoothed = curve.getPoints(centerline.length * 4); // 4x субдискретизация
```

### 3. Расчёт offset для каждой полосы
```typescript
laneCount = tags.lanes ?? 2
laneWidth = parseFloat(tags.width) / laneCount ?? 3.5  // м
// Полоса i: offset = (i - (laneCount-1)/2) * laneWidth
// Перпендикуляр: rotate(tangent, 90°)
```

### 4. Triangle strip для каждой полосы
Лента из треугольников шириной `laneWidth`, центрированная на `centerline + offset * normal`.

### 5. Разметка между полосами
| Контекст | Тип |
|---|---|
| Между встречными | двойная сплошная (или одинарная если `lanes:forward + lanes:backward` с `divider=no`) |
| Между попутными, change=yes | прерывистая |
| Между попутными, change=not_left/right | сплошная с одной стороны |
| Перед перекрёстком 20м | стоп-линия + стрелки направления |
| Велополоса | белая прерывистая + цветная заливка |
| Автобусная (`busway=lane`) | сплошная жёлтая |

## 🔀 Развязки (merge/split)

### Detection
- `turn:lanes` содержит `merge_to_left|merge_to_right`
- `way` оканчивается `motorway_junction` node
- `highway=motorway_link` — съезд

### Геометрия
```
Основная дорога:  ═══════════
                          ╲
Съезд (link):              ╲══════
                            
1. Найти точку разделения (junction node)
2. Сужать полосу разделения от laneWidth до 0.5м на длине 30м
3. Добавить переходную разметку (jaggies)
4. Стрелка-указатель на разметке за 100м до съезда
```

## 🎯 API

```typescript
buildLaneGeometry(way: OsmWay, opts: {
  smoothing?: number;   // 0..1, default 0.5
  subdivision?: number; // points multiplier, default 4
  withMarkings?: boolean;
}): {
  lanes: Lane3DGeometry[];      // triangle strips
  markings: MarkingGeometry[];  // полигоны разметки
  arrows: ArrowGeometry[];      // стрелки направлений
}
```

## ⚠️ Edge cases

1. **Кольцевая** (`junction=roundabout`) — все полосы концентрические
2. **Перекрёсток X** — полосы прерываются за 5м до центра
3. **Реверсивная полоса** (`oneway=reversible`) — менять направление по `direction` или времени
4. **Парковка вдоль** (`parking:lane`) — добавить как отдельную не-проезжую полосу
5. **Тротуар** (`sidewalk=both/left/right`) — серая лента шириной 2м

## 📏 Стандарты ширины (м)

| Дорога | Ширина полосы |
|---|---|
| Автомагистраль | 3.75 |
| Городская магистраль | 3.5 |
| Городская улица | 3.25 |
| Жилая улица | 3.0 |
| Велополоса | 1.5 |
| Тротуар | 2.0 |

## 🔗 Связанные скилы
- `road-infra-scanner` — поставщик OSM-данных
- `road-3d-engine` — потребитель геометрии
- `sign-detector` — стрелки на разметке коррелируют с знаком 5.15.1
