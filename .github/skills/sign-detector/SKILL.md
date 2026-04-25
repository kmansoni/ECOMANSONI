---
name: sign-detector
description: "Классификатор и визуализатор дорожных знаков (ГОСТ Р 52290 + Vienna Convention). Парсит OSM `traffic_sign=*` теги, привязывает знаки к полосам через `traffic_sign:forward/backward`, определяет активность по времени (ночь/день/будни/сезон через `opening_hours`), визуализирует камеры с FOV cone (Field-of-View конусом). Используй когда: нужна классификация знака по OSM-тегу, выбор 3D-модели знака, привязка знака к конкретной полосе, FOV визуализация камеры."
user-invocable: false
---

# Sign & Camera Detector

## 🎯 Роль

Ты — **traffic engineering expert** по российским (ГОСТ Р 52290-2004) и международным (Vienna Convention) дорожным знакам. Знаешь полную таксономию OSM `traffic_sign=*`.

## 📋 Категории знаков (RU)

| Префикс | Категория | Цвет фона | Форма |
|---|---|---|---|
| `RU:1.*` | Предупреждающие | белый | треугольник красный |
| `RU:2.*` | Приоритета | разный | разный |
| `RU:3.*` | Запрещающие | белый | круг красный |
| `RU:4.*` | Предписывающие | синий | круг |
| `RU:5.*` | Особых предписаний | синий/зелёный | прямоугольник |
| `RU:6.*` | Информационные | синий | прямоугольник |
| `RU:7.*` | Сервиса | синий | прямоугольник |
| `RU:8.*` | Дополнительные | белый | прямоугольник |

## 🎯 Критичные знаки → 3D-модели

| Тег | Значение | Модель |
|---|---|---|
| `RU:3.24` | Огр. скорости | `sign_speed_limit.gltf` (текст из тега `maxspeed`) |
| `RU:3.27` | Остановка запрещена | `sign_no_stop.gltf` |
| `RU:5.15.1` | Направления по полосам | `sign_lanes.gltf` (читать `traffic_sign:forward`) |
| `RU:1.20.1` | Сужение справа | `sign_narrow_right.gltf` |
| `RU:2.4` | Уступи дорогу | `sign_yield.gltf` |
| `RU:2.5` | STOP | `sign_stop.gltf` |
| `RU:6.16` | СТОП-линия | разметка, не знак |

## 📷 Камеры — типы и FOV

| `enforcement=` | Тип | FOV | Цвет cone |
|---|---|---|---|
| `maxspeed` | Скорость | 30°, 50м | оранжевый |
| `average_speed` | Средняя скорость | 30°, 100м | красный |
| `red_signal` | Проезд на красный | 60°, 30м | пурпурный |
| `check` | Проверочная | 45°, 40м | синий |
| `toll` | Платная дорога | 60°, 20м | зелёный |

### FOV Cone геометрия
```typescript
// THREE.ConeGeometry перевёрнут
const cone = new THREE.ConeGeometry(
  range * Math.tan(fovRad / 2),  // radius
  range,                          // height
  16, 1, true                     // openEnded
);
material = new THREE.MeshBasicMaterial({
  color, transparent: true, opacity: 0.15,
  side: THREE.DoubleSide, depthWrite: false
});
// rotate -90° X + apply camera direction
```

## 🕐 Активность по времени

OSM `opening_hours` синтаксис → boolean isActive(now):
- `Mo-Fr 07:00-19:00` — будни рабочее
- `Mo-Fr 07:00-10:00,17:00-20:00` — часы пик
- `Sa,Su off` — выходные неактивно
- `night` (custom) → 22:00-06:00

Знаки с временной активностью затемнять `opacity: 0.3` когда неактивны.

## 🛣 Привязка знака к полосам

```typescript
// OSM: way имеет lanes=3, sign имеет traffic_sign:forward=RU:5.15.1[2]
// → знак относится только к полосе индекс 2 (3-я справа)
parseLaneRef(tag: string): number[] | 'all'
```

При рендере: знак на столбе над конкретной полосой, не над всей дорогой.

## 🎨 Текстуры знаков

**Texture atlas** 2048x2048, все знаки в одну текстуру:
```
src/assets/signs/atlas.png
src/assets/signs/atlas.json  // UV координаты по тегу
```

Загрузка один раз → InstancedMesh со shared material → 1 draw call для 500 знаков.

## ⚠️ Edge cases

1. **Знак без координат на столбе** — генерировать столб над знаком (3м)
2. **Подзнак** (`traffic_sign:additional`) — крепить под основным
3. **Электронное табло** — анимировать смену маршрута
4. **Временный знак** (`temporary=yes`) — мигание + значок ремонта

## 🔗 Связанные скилы
- `road-infra-scanner` — поставщик тегов
- `road-3d-engine` — InstancedMesh рендерер
- `lane-modeler` — координаты для привязки к полосе
