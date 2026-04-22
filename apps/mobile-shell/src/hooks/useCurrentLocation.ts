import { useState, useEffect, useCallback, useRef } from 'react';
import type { UserLocation, LatLng } from '../types';

interface UseCurrentLocationOptions {
  enableHighAccuracy?: boolean;
  maximumAge?: number;
  timeout?: number;
  watchPosition?: boolean;
  autoStart?: boolean;
}

interface UseCurrentLocationResult {
  location: UserLocation | null;
  error: string | null;
  isLoading: boolean;
  startTracking: () => void;
  stopTracking: () => void;
  getCurrentPosition: () => Promise<UserLocation | null>;
}

export function useCurrentLocation(options: UseCurrentLocationOptions = {}): UseCurrentLocationResult {
  const {
    enableHighAccuracy = true,
    maximumAge = 5000,
    timeout = 10000,
    watchPosition = true,
    autoStart = false,
  } = options;

  const [location, setLocation] = useState<UserLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  
  const watchIdRef = useRef<number | null>(null);

  const getCurrentPosition = useCallback(async (): Promise<UserLocation | null> => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported');
      return null;
    }

    setIsLoading(true);
    setError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc: UserLocation = {
            position: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            },
            heading: position.coords.heading || undefined,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };
          setLocation(loc);
          setIsLoading(false);
          resolve(loc);
        },
        (err) => {
          const msg = err.message || 'Unknown geolocation error';
          setError(msg);
          setIsLoading(false);
          resolve(null);
        },
        { enableHighAccuracy, maximumAge, timeout }
      );
    });
  }, [enableHighAccuracy, maximumAge, timeout]);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported');
      return;
    }

    if (watchIdRef.current !== null) {
      return;
    }

    setIsWatching(true);
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const loc: UserLocation = {
          position: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          heading: position.coords.heading || undefined,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        setLocation(loc);
        setError(null);
      },
      (err) => {
        setError(err.message || 'Geolocation error');
      },
      { enableHighAccuracy, maximumAge, timeout }
    );
  }, [enableHighAccuracy, maximumAge, timeout]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setIsWatching(false);
    }
  }, []);

  useEffect(() => {
    if (autoStart) {
      startTracking();
    }
    return () => {
      stopTracking();
    };
  }, [autoStart, startTracking, stopTracking]);

  return {
    location,
    error,
    isLoading: isLoading || isWatching,
    startTracking,
    stopTracking,
    getCurrentPosition,
  };
}