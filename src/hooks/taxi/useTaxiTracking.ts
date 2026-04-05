import { useState, useEffect, useCallback, useRef } from 'react';
import type { LatLng, Driver } from '@/types/taxi';
import { interpolatePosition } from '@/lib/taxi/calculations';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface TrackingState {
  driverPosition: LatLng | null;
  driverHeading: number;
  etaMinutes: number;
  progress: number;
  distanceLeft: number;
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

  const channelRef = useRef<RealtimeChannel | null>(null);
  const driverIdRef = useRef<string | null>(null);
  const targetRef = useRef<LatLng | null>(null);
  const routeRef = useRef<LatLng[]>([]);
  const stepRef = useRef(0);
  const initialEtaRef = useRef(0);

  const startTracking = useCallback(
    (driver: Driver, targetLocation: LatLng, route: LatLng[] = []) => {
      // Остановить предыдущий трекинг
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      driverIdRef.current = driver.id;
      targetRef.current = targetLocation;
      routeRef.current = route.length > 1 ? route : [driver.location, targetLocation];
      stepRef.current = 0;
      initialEtaRef.current = driver.eta;

      setState({
        driverPosition: driver.location,
        driverHeading: 0,
        etaMinutes: driver.eta,
        progress: 0,
        distanceLeft: driver.eta * 0.42,
        isActive: true,
      });

      // Realtime подписка на обновления позиции водителя
      const ch = supabase
        .channel(`taxi-tracking-${driver.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'taxi_driver_locations',
            filter: `driver_id=eq.${driver.id}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            const lat = row.lat as number;
            const lng = row.lng as number;
            const heading = (row.heading as number) ?? 0;

            const total = routeRef.current.length;
            const nextStep = Math.min(stepRef.current + 1, total - 1);
            stepRef.current = nextStep;
            const progress = total > 1 ? nextStep / (total - 1) : 1;

            const routePoint = routeRef.current[nextStep];
            const smoothLat = lat * 0.7 + (routePoint?.lat ?? lat) * 0.3;
            const smoothLng = lng * 0.7 + (routePoint?.lng ?? lng) * 0.3;
            const eta = Math.max(0, Math.round(initialEtaRef.current * (1 - progress)));

            setState((s) => ({
              ...s,
              driverPosition: { lat: smoothLat, lng: smoothLng },
              driverHeading: heading,
              etaMinutes: eta,
              progress,
              distanceLeft: Math.max(0, s.distanceLeft - 0.04),
            }));

            if (progress >= 0.98 || eta <= 0) {
              setState((s) => ({ ...s, progress: 1, etaMinutes: 0, distanceLeft: 0 }));
            }
          }
        )
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') {
            logger.warn('[taxi-tracking] subscription status:', status);
          }
        });

      channelRef.current = ch;
    },
    []
  );

  const stopTracking = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    driverIdRef.current = null;
    setState((s) => ({ ...s, isActive: false }));
  }, []);

  const updateTarget = useCallback((target: LatLng, route: LatLng[] = []) => {
    targetRef.current = target;
    if (route.length > 1) {
      routeRef.current = route;
      stepRef.current = 0;
    }
  }, []);

  const setDriverPosition = useCallback((position: LatLng, heading = 0) => {
    setState((s) => ({ ...s, driverPosition: position, driverHeading: heading }));
  }, []);

  const interpolate = useCallback((from: LatLng, to: LatLng, progress: number): LatLng => {
    return interpolatePosition(from, to, progress);
  }, []);

  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
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
