/**
 * useHDRoadInfra — React хук для интеграции HD-инфраструктуры в MapLibre.
 *
 * Использование в MapLibre3D.tsx:
 *
 *   useHDRoadInfra(mapRef.current, isReady, {
 *     enabled: hdRoadEnabled,
 *     userPosition,
 *     heading,
 *   });
 *
 * Хук:
 *   - Создаёт HDRoadSceneOrchestrator при включении флага
 *   - Сканирует инфраструктуру при изменении центра карты (debounced)
 *   - Обновляет позицию машины каждый кадр
 *   - Удаляет overlay при размонтировании / выключении флага
 */

import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, MapLibreEvent, MapMouseEvent } from 'maplibre-gl';
import type { LatLng } from '@/types/taxi';
import type { BBox } from '@/types/roadInfra';
import { HDRoadSceneOrchestrator, type HDInfraHit } from '@/lib/navigation/3d';
import { logger } from '@/lib/logger';

interface UseHDRoadInfraOptions {
  enabled: boolean;
  userPosition: LatLng | null;
  heading: number;
  /** Минимальный zoom для HD режима (default 14) */
  minZoom?: number;
  /** Дебаунс рефреша в мс (default 800) */
  refreshDebounceMs?: number;
}

const DEFAULT_MIN_ZOOM = 14;
const DEFAULT_DEBOUNCE = 800;

export function useHDRoadInfra(
  map: MapLibreMap | null,
  isReady: boolean,
  opts: UseHDRoadInfraOptions
): { selectedHit: HDInfraHit | null; clearSelection: () => void } {
  const orchestratorRef = useRef<HDRoadSceneOrchestrator | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedHit, setSelectedHit] = useState<HDInfraHit | null>(null);

  const minZoom = opts.minZoom ?? DEFAULT_MIN_ZOOM;
  const debounceMs = opts.refreshDebounceMs ?? DEFAULT_DEBOUNCE;

  // Создание / уничтожение orchestrator
  useEffect(() => {
    if (!map || !isReady || !opts.enabled) {
      // Cleanup если был
      orchestratorRef.current?.dispose();
      orchestratorRef.current = null;
      return;
    }

    const center = map.getCenter();
    try {
      orchestratorRef.current = new HDRoadSceneOrchestrator(map, {
        centerLng: center.lng,
        centerLat: center.lat,
        withLighting: true,
      });
    } catch (err) {
      logger.error('[useHDRoadInfra] Не удалось создать orchestrator', err);
      return;
    }

    return () => {
      orchestratorRef.current?.dispose();
      orchestratorRef.current = null;
      setSelectedHit(null);
    };
  }, [map, isReady, opts.enabled]);

  // Hit-test по клику на карту
  useEffect(() => {
    if (!map || !isReady || !opts.enabled) return;

    const onClick = (e: MapMouseEvent) => {
      const orch = orchestratorRef.current;
      if (!orch) return;
      const hit = orch.hitTestAt(e.lngLat.lng, e.lngLat.lat, 20);
      if (hit) {
        setSelectedHit(hit);
      }
    };

    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map, isReady, opts.enabled]);

  // Рефреш инфраструктуры при перемещении карты
  useEffect(() => {
    if (!map || !isReady || !opts.enabled || !orchestratorRef.current) return;

    const onMoveEnd = (_e: MapLibreEvent) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        const orch = orchestratorRef.current;
        if (!orch) return;
        const zoom = map.getZoom();
        if (zoom < minZoom) return; // не сканируем на дальних zoom
        const b = map.getBounds();
        const bbox: BBox = {
          south: b.getSouth(),
          west: b.getWest(),
          north: b.getNorth(),
          east: b.getEast(),
        };
        void orch.refreshForBBox(bbox).catch((err) => {
          logger.debug('[useHDRoadInfra] refresh failed', err);
        });
      }, debounceMs);
    };

    map.on('moveend', onMoveEnd);
    // Первичный запуск
    onMoveEnd({} as MapLibreEvent);

    return () => {
      map.off('moveend', onMoveEnd);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [map, isReady, opts.enabled, minZoom, debounceMs]);

  // Обновление позиции машины
  useEffect(() => {
    const orch = orchestratorRef.current;
    if (!orch || !opts.userPosition) return;
    orch.updateVehicle(opts.userPosition.lng, opts.userPosition.lat, opts.heading);
  }, [opts.userPosition, opts.heading]);

  return {
    selectedHit,
    clearSelection: () => setSelectedHit(null),
  };
}
