import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '@/types/taxi';

interface GeolocationState {
  position: LatLng | null;
  heading: number;
  speed: number; // km/h
  accuracy: number;
  error: string | null;
  isTracking: boolean;
}

const MOSCOW: LatLng = { lat: 55.7558, lng: 37.6173 };

function getDefaultCenter(): LatLng {
  try {
    const raw = localStorage.getItem('nav_last_center');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') return parsed;
    }
  } catch { /* corrupted */ }
  return MOSCOW;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    heading: 0,
    speed: 0,
    accuracy: 0,
    error: null,
    isTracking: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const prevPositionRef = useRef<LatLng | null>(null);
  const prevTimeRef = useRef<number>(0);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      // Desktop fallback: use default center
      setState((s) => ({
        ...s,
        position: getDefaultCenter(),
        isTracking: true,
        error: null,
      }));
      return;
    }

    setState((s) => ({ ...s, isTracking: true, error: null }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos: LatLng = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        let heading = state.heading;
        let speed = 0;

        // Use GPS heading/speed if available
        if (pos.coords.heading != null && !isNaN(pos.coords.heading)) {
          heading = pos.coords.heading;
        } else if (prevPositionRef.current) {
          heading = calculateBearing(prevPositionRef.current, newPos);
        }

        if (pos.coords.speed != null && pos.coords.speed >= 0) {
          speed = pos.coords.speed * 3.6; // m/s → km/h
        } else if (prevPositionRef.current && prevTimeRef.current) {
          const dt = (pos.timestamp - prevTimeRef.current) / 1000;
          if (dt > 0) {
            const dist = haversineM(prevPositionRef.current, newPos);
            speed = (dist / dt) * 3.6;
          }
        }

        prevPositionRef.current = newPos;
        prevTimeRef.current = pos.timestamp;

        setState({
          position: newPos,
          heading,
          speed: Math.max(0, speed),
          accuracy: pos.coords.accuracy,
          error: null,
          isTracking: true,
        });
      },
      (err) => {
        setState((s) => ({
          ...s,
          error: err.message,
          position: s.position ?? getDefaultCenter(),
          isTracking: true,
        }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      }
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState((s) => ({ ...s, isTracking: false }));
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return { ...state, startTracking, stopTracking };
}

function calculateBearing(from: LatLng, to: LatLng): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
