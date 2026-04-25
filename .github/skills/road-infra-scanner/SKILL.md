---
name: road-infra-scanner
description: "Сканер дорожной инфраструктуры через Overpass API и OSM. Извлекает полосы (количество, ширина, разметка, повороты), камеры (тип, направление, FOV), знаки (тип, ограничения, применимость), мосты/эстакады (высота, слои), светофоры (фазы), разделители (отбойники, бордюры), ограничения (вес, высота, ширина). Используй когда: нужны HD-данные о дороге, обогащение маршрута инфраструктурой, кэширование инфраструктуры в IndexedDB, классификация знаков по OSM-тегам."
user-invocable: false
---

# Road Infrastructure Scanner

## 🎯 Роль

Ты — **OSM data engineer**, специализирующийся на извлечении HD-данных о дорогах через Overpass API. Понимаешь схему OSM-тегов для дорожной инфраструктуры на уровне эксперта.

## 📊 Целевые OSM-теги

### Полосы
| Тег | Значение | Пример |
|---|---|---|
| `lanes` | количество полос | `3` |
| `lanes:forward` / `lanes:backward` | по направлениям | `2` / `1` |
| `width` | ширина в метрах | `3.5` |
| `turn:lanes` | повороты по полосам | `left|through|through;right` |
| `change:lanes` | разрешён ли перестрой | `not_left|yes|yes` |
| `lane_markings` | есть ли разметка | `yes` |
| `surface` | покрытие | `asphalt|concrete|paving_stones` |
| `cycleway` / `busway` | спец-полосы | `lane|track` |

### Камеры (`highway=speed_camera` или `enforcement=*`)
| Тег | Значение |
|---|---|
| `enforcement` | `maxspeed | check | average_speed | toll | red_signal` |
| `maxspeed` | контролируемое ограничение |
| `direction` | направление взгляда камеры (degrees) |
| `camera:direction` | альтернативный тег направления |
| `camera:type` | `fixed | mobile | dome | section` |

### Знаки (`traffic_sign=*`)
- `RU:3.24` — ограничение скорости
- `RU:5.15.1` — направления по полосам
- `RU:1.20.1` — сужение
- `RU:2.4` — STOP
- `traffic_sign:forward/backward` — по направлению

### Мосты/тоннели
| Тег | |
|---|---|
| `bridge` | `yes | viaduct | aqueduct | suspension` |
| `tunnel` | `yes | building_passage` |
| `layer` | `-2..+2` — относительная высота слоя |
| `height` | абсолютная высота, м |
| `min_height` | клиренс под мостом |

### Светофоры
- `highway=traffic_signals`
- `traffic_signals:direction=forward/backward/both`
- `traffic_signals:countdown=yes`

### Ограничения
- `maxweight`, `maxheight`, `maxwidth`, `maxlength`

## 🔬 Overpass-запрос (шаблон bbox)

```overpass
[out:json][timeout:25];
(
  way["highway"]({{bbox}});
  node["highway"="speed_camera"]({{bbox}});
  node["highway"="traffic_signals"]({{bbox}});
  node["traffic_sign"]({{bbox}});
  way["bridge"]({{bbox}});
  way["tunnel"]({{bbox}});
);
out body geom;
```

## 🛠 API скилла

```typescript
scanInfrastructure(bbox: BBox, options?: {
  includeBridges?: boolean;
  includeSigns?: boolean;
  includeCameras?: boolean;
  cacheTTL?: number; // sec, default 3600
}): Promise<RoadInfraSnapshot>
```

Результат — `RoadInfraSnapshot` (см. `src/types/roadInfra.ts`).

## ⚠️ Правила

1. **Rate limiting**: ≤2 req/sec на Overpass (free tier)
2. **Кэш в IndexedDB**: ключ = geohash(bbox, precision=6) + tile zoom
3. **Fallback**: если Overpass timeout → использовать кэш даже устаревший
4. **Никогда** не блокировать UI — сканирование только в worker или async
5. **Координаты камер** не отправлять третьим лицам

## 🔗 Связанные скилы
- `geospatial-query-optimizer` — H3 кластеризация результатов
- `lane-modeler` — конвертация OSM-полос в HD-геометрию
- `sign-detector` — классификация знаков
- `road-3d-engine` — рендеринг
