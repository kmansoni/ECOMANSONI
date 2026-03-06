import { useState, useEffect, useCallback, useRef } from 'react';
import type { LatLng, Driver } from '@/types/taxi';
import { DRIVER_LOCATION_UPDATE_INTERVAL_MS } from '@/lib/taxi/constants';
import { interpolatePosition } from '@/lib/taxi/calculations';
import { getDriverLocation } from '@/lib/taxi/api';

interface TrackingState {
  driverPosition: LatLng | null;
  driverHeading: number;
  etaMinutes: number;
  progress: number;        // 0..1 прогресс движения по маршруту
  distanceLeft: number;    // км
  isActive: boolean;
}

export function useTaxiTracking() {
  const [state, setState] = useState<TrackingState>({
    driverPosition: null,
    driverHeading: 0,
    etaMinutes: 0,
    progress: 0,
    distanceLeft: 0,
    isActive: false,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const driverIdRef = useRef<string | null>(null);
  const targetRef = useRef<LatLng | null>(null);
  const routeRef = useRef<LatLng[]>([]);
  const stepRef = useRef(0);

  // ─── Запустить трекинг водителя ───────────────────────────────────────────
  const startTracking = useCallback(
    (driver: Driver, targetLocation: LatLng, route: LatLng[] = []) => {
      // Остановить предыдущий трекинг
      if (intervalRef.current) clearInterval(intervalRef.current);

      driverIdRef.current = driver.id;
      targetRef.current = targetLocation;
      routeRef.current = route.length > 1 ? route : [driver.location, targetLocation];
      stepRef.current = 0;

      setState({
        driverPosition: driver.location,
        driverHeading: 0,
        etaMinutes: driver.eta,
        progress: 0,
        distanceLeft: driver.eta * 0.42, // Примерно 25 км/ч → км за ETA мин
        isActive: true,
      });

      // Обновление позиции каждые 3 секунды
      intervalRef.current = setInterval(async () => {
        if (!driverIdRef.current || !targetRef.current) return;

        try {
          const { lat, lng, heading, eta } = await getDriverLocation(
            driverIdRef.current,
            targetRef.current
          );

          const total = routeRef.current.length;
          const nextStep = Math.min(stepRef.current + 1, total - 1);
          stepRef.current = nextStep;
          const progress = total > 1 ? nextStep / (total - 1) : 1;

          // Плавная интерполяция между текущей и следующей точкой маршрута
          const routePoint = routeRef.current[nextStep];
          const smoothLat = lat * 0.7 + (routePoint?.lat ?? lat) * 0.3;
          const smoothLng = lng * 0.7 + (routePoint?.lng ?? lng) * 0.3;

          setState((s) => ({
            ...s,
            driverPosition: { lat: smoothLat, lng: smoothLng },
            driverHeading: heading,
            etaMinutes: Math.max(0, eta),
            progress,
            distanceLeft: Math.max(0, s.distanceLeft - 0.04),
          }));

          // Автозавершение трекинга при прибытии
          if (progress >= 0.98 || eta <= 0) {
            setState((s) => ({
              ...s,
              progress: 1,
              etaMinutes: 0,
              distanceLeft: 0,
            }));
          }
        } catch {
          // Тихая ошибка обновления позиции
        }
      }, DRIVER_LOCATION_UPDATE_INTERVAL_MS);
    },
    []
  );

  // ─── Остановить трекинг ───────────────────────────────────────────────────
  const stopTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    driverIdRef.current = null;
    setState((s) => ({ ...s, isActive: false }));
  }, []);

  // ─── Обновить целевую точку (для in_trip — цель = назначение) ────────────
  const updateTarget = useCallback((target: LatLng, route: LatLng[] = []) => {
    targetRef.current = target;
    if (route.length > 1) {
      routeRef.current = route;
      stepRef.current = 0;
    }
  }, []);

  // ─── Принудительно установить позицию водителя ───────────────────────────
  const setDriverPosition = useCallback((position: LatLng, heading: number = 0) => {
    setState((s) => ({ ...s, driverPosition: position, driverHeading: heading }));
  }, []);

  // ─── Интерполяция между двумя точками (утилита для компонентов) ──────────
  const interpolate = useCallback((from: LatLng, to: LatLng, progress: number): LatLng => {
    return interpolatePosition(from, to, progress);
  }, []);

  // ─── Очистка при размонтировании ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    driverPosition: state.driverPosition,
    driverHeading: state.driverHeading,
    etaMinutes: state.etaMinutes,
    progress: state.progress,
    distanceLeft: state.distanceLeft,
    isActive: state.isActive,

    startTracking,
    stopTracking,
    updateTarget,
    setDriverPosition,
    interpolate,
  };
}
