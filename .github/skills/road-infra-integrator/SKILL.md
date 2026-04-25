---
name: road-infra-integrator
description: "Интегратор HD-инфраструктуры в существующий навигатор Mansoni без поломки кода. Расширяет типы в src/types/navigation.ts, рефакторит road3DRenderer.ts с делегацией в Three.js pipeline, добавляет новые слои в navigationLayers.ts, расширяет MapLibre3D.tsx подключением ThreeOverlay, добавляет UI-переключатель 2D/3D режима, панель информации о знаках/камерах. Используй когда: финальная сборка road-infra-* модулей в проект, создание PR с минимальными изменениями существующего кода, проверка обратной совместимости."
user-invocable: false
---

# Road Infrastructure Integrator

## 🎯 Роль

Ты — **integration engineer**. Твоя задача — **точечно** внедрить HD-инфраструктуру в работающий навигатор так, чтобы:
1. Существующий код продолжил работать (обратная совместимость)
2. Новые возможности включались **флагом** (feature flag)
3. tsc → 0 ошибок после каждого изменения
4. Никаких breaking changes в публичных API

## 🗺 Карта существующего кода (НЕ ломать)

| Файл | Текущая роль | Действие |
|---|---|---|
| `src/types/navigation.ts` | Типы навигации | **Расширить** новыми интерфейсами |
| `src/lib/navigation/road3DRenderer.ts` | Amap-style полосы | **Рефактор** — делегировать в Three.js при флаге |
| `src/lib/navigation/laneGraph.ts` | Граф полос OSM | **Использовать** как источник для lane-modeler |
| `src/lib/navigation/speedCameras.ts` | Маркеры камер | **Расширить** данными из infra-scanner |
| `src/lib/navigation/speedLimitProvider.ts` | Лимиты скорости | **Использовать** infra-scanner как источник |
| `src/lib/map/navigationLayers.ts` | MapLibre layers | **Добавить** скрытие старых layers при 3D-режиме |
| `src/lib/map/mapStyles.ts` | Темы карты | **Расширить** освещение для 3D |
| `src/components/navigation/MapLibre3D.tsx` | Главная карта | **Подключить** ThreeOverlay по флагу |
| `src/components/navigation/NavigatorMap.tsx` | Wrapper UI | **Добавить** переключатель режима |

## 📦 Новые модули (создавать)

```
src/lib/navigation/infra/
  ├── overpassScanner.ts       // road-infra-scanner
  ├── infraCache.ts            // IndexedDB кэш
  ├── signClassifier.ts        // sign-detector логика
  └── bridgeElevation.ts       // высоты мостов

src/lib/navigation/3d/
  ├── threeOverlay.ts          // CustomLayer
  ├── roadMeshBuilder.ts       // road-3d-engine
  ├── signModels.ts            // InstancedMesh знаков
  ├── cameraModels.ts          // Камеры + FOV
  ├── vehicleModel.ts          // GLTF машина
  ├── lightingSystem.ts        // День/ночь
  └── lodManager.ts            // LOD

src/lib/navigation/lanes/
  ├── hdLaneBuilder.ts         // lane-modeler
  ├── markingRenderer.ts       // Разметка
  └── laneSplitMerge.ts        // Развязки

src/types/roadInfra.ts         // Новые типы
```

## 🚦 Feature flag

```typescript
// src/lib/featureFlags.ts (или extend existing)
export const FEATURES = {
  HD_ROAD_3D: import.meta.env.VITE_HD_ROAD_3D === 'true',
} as const;

// Использование:
if (FEATURES.HD_ROAD_3D) {
  // Three.js pipeline
} else {
  // Существующий GeoJSON pipeline
}
```

## 🔧 Шаблон рефакторинга

### road3DRenderer.ts
```typescript
// ДО: монолитная функция renderLanes(map, route)
// ПОСЛЕ: 
export function renderLanes(map, route) {
  if (FEATURES.HD_ROAD_3D) {
    return delegateToThreeOverlay(map, route);
  }
  return renderLanesLegacy(map, route);  // старый код
}
```

## ✅ Чеклист интеграции (по каждому модулю)

- [ ] tsc --noEmit → 0 ошибок
- [ ] Существующие тесты не сломаны
- [ ] Feature flag работает (off → старое поведение)
- [ ] Нет циклических импортов
- [ ] Нет дублирования с существующими утилитами
- [ ] Нет console.log в production коде
- [ ] Все async в try/catch
- [ ] memory leak проверен (unmount → dispose)

## 🚨 ЖЕЛЕЗНЫЕ ПРАВИЛА (из CLAUDE.md)

1. **Закон 3 (anti-duplicate)**: перед созданием нового файла → grep + file_search
2. **Закон 4**: tsc после каждого изменения
3. **Закон 6**: 0 заглушек, 0 fake success, 0 пустых onClick
4. Компонент >400 строк → декомпозировать
5. Все Supabase queries с `.limit()`
6. Атомарные коммиты на русском (`feat:`, `fix:`, `refactor:`)

## 🔗 Связанные скилы
- `road-infra-scanner`, `road-3d-engine`, `lane-modeler`, `sign-detector`
- `performance-profiler-navigation` — после интеграции профилировать
- `navigator-tester-enhanced` — регресс-тесты
