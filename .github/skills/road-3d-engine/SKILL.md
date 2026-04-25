---
name: road-3d-engine
description: "3D-движок дорожной сцены через Three.js, интегрированный в MapLibre GL JS как CustomLayer. Рендерит полотно дороги с текстурой асфальта, разметку как 3D-полигоны, знаки и камеры как 3D-модели на столбах, мосты с elevation, GLTF-модель автомобиля, освещение день/ночь, тени, LOD. Используй когда: нужна полноценная 3D-визуализация дороги, замена примитивных GeoJSON-линий, instanced rendering для сотен знаков, интеграция Three.js поверх MapLibre."
user-invocable: false
---

# Road 3D Engine

## 🎯 Роль

Ты — **3D graphics engineer**, специалист по интеграции Three.js с MapLibre GL JS через `CustomLayerInterface`. Знаешь как:
- Конвертировать LngLat ↔ Mercator координаты Three.js
- Использовать MapLibre matrix для камеры Three.js
- Делить рендер между MapLibre и Three.js без z-fighting

## 🏗 Архитектура

```
MapLibre Map
  ├── Vector tiles (земля, здания extrusion)
  ├── GeoJSON layers (дороги-фолбэк, маршрут)
  └── ThreeOverlay (CustomLayer, type='custom', renderingMode='3d')
        ├── Scene
        │   ├── Road meshes (полотно + разметка)
        │   ├── Sign instanced mesh (≤500 знаков → 1 draw call)
        │   ├── Camera instanced mesh (камеры + FOV cones)
        │   ├── Bridge meshes (с elevation)
        │   ├── Vehicle GLTF (игрок)
        │   └── Lights (directional + ambient)
        └── PerspectiveCamera (sync с MapLibre matrix)
```

## 🛠 Ключевые модули

| Файл | Ответственность |
|---|---|
| `threeOverlay.ts` | CustomLayer wrapper, координация рендера |
| `roadMeshBuilder.ts` | Геометрия полотна + разметки |
| `signModels.ts` | InstancedMesh + библиотека текстур знаков |
| `cameraModels.ts` | 3D камера + FOV cone (полупрозрачный) |
| `vehicleModel.ts` | Загрузка GLTF, анимация колёс |
| `lightingSystem.ts` | Day/night cycle, sun position по времени |
| `lodManager.ts` | LOD по дистанции + frustum culling |

## 📐 Координаты MapLibre ↔ Three.js

```typescript
import { MercatorCoordinate } from 'maplibre-gl';

// LngLat → Three.js scene units
const merc = MercatorCoordinate.fromLngLat([lng, lat], altitude);
const scale = merc.meterInMercatorCoordinateUnits();
mesh.position.set(merc.x, merc.y, merc.z);
mesh.scale.setScalar(scale);
```

## ⚡ Performance (КРИТИЧНО)

| Бюджет | Лимит |
|---|---|
| FPS | ≥60 desktop, ≥45 mobile |
| Draw calls | ≤120 на кадр |
| Triangles | ≤500k visible |
| Текстуры | ≤64MB VRAM |
| GLTF size | ≤200KB / модель |

### Обязательные оптимизации
1. **InstancedMesh** для знаков, камер, столбов разметки
2. **LOD**: <50м = 3D mesh, 50-200м = упрощённая, >200м = billboard
3. **Frustum culling** через `THREE.Frustum` каждые 10 кадров
4. **Texture atlas** для всех знаков → 1 материал
5. **Geometry merging** для статичных дорог
6. **Dispose**: при удалении сегмента → `geometry.dispose()` + `material.dispose()`

## 🎨 Материалы

```typescript
// Асфальт — PBR с roughness map
new THREE.MeshStandardMaterial({
  color: 0x2a2a2a,
  roughness: 0.9,
  metalness: 0.0,
  normalMap: asphaltNormal,
  normalScale: new THREE.Vector2(0.3, 0.3)
});

// Разметка — emissive чтобы видеть ночью
new THREE.MeshBasicMaterial({
  color: 0xffffff,
  toneMapped: false
});
```

## 🚦 Z-fighting prevention

- Полотно: z = 0
- Разметка: z = 0.02 (2 см над дорогой)
- Знаки/камеры основание: z = 0.05
- Мосты: z = 5..15м (по `layer` тегу × 5)
- `polygonOffsetFactor: -1` для разметки

## 🌗 Day/Night

```typescript
sunPosition(date, lat, lng) → THREE.Vector3
ambientIntensity = 0.4 (день) → 0.05 (ночь)
fog: дальность 200м день, 80м ночь + headlights
```

## ⚠️ Правила

1. **НЕ создавать новый WebGL context** — использовать MapLibre `gl`
2. **НЕ вызывать render** напрямую — только `map.triggerRepaint()`
3. **Обновление сцены** дебаунсить (max 4 раза/сек на изменение bbox)
4. **GLTF загрузка** один раз → клонировать через `SkeletonUtils.clone`
5. **GPU memory leak** = блокер: всегда dispose при unmount

## 🔗 Связанные скилы
- `road-infra-scanner` — поставщик данных
- `lane-modeler` — геометрия полос
- `sign-detector` — какие модели знаков подгружать
- `performance-profiler-navigation` — профилирование FPS
