/**
 * usePeopleNearby — хук для обнаружения людей рядом (opt-in геолокация).
 *
 * Приватность:
 *  - isSharing = false по умолчанию
 *  - stopSharing() немедленно скрывает пользователя на сервере
 *  - refreshNearby() не передаёт координаты сервисному ключу — через Edge Function
 *
 * Rate limiting:
 *  - updateMyLocation дедуплицируется: не чаще 1 раза в 30 секунд (cooldown в БД)
 *    клиентский таймер не отправляет раньше 32 секунд
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export interface NearbyUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  distanceMeters: number;
  lastUpdated: string;
}

interface UsePeopleNearbyReturn {
  nearbyUsers: NearbyUser[];
  isSharing: boolean;
  isLoading: boolean;
  error: string | null;
  startSharing: () => Promise<void>;
  stopSharing: () => Promise<void>;
  refreshNearby: (lat: number, lon: number, radius?: number) => Promise<void>;
  updateMyLocation: (lat: number, lon: number) => Promise<void>;
}

const LOCATION_UPDATE_COOLDOWN_MS = 32_000; // 32s (сервер: 30s, +2с буфер)

export function usePeopleNearby(): UsePeopleNearbyReturn {
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastUpdateRef = useRef<number>(0);

  // ---------------------------------------------------------------------------
  // startSharing — включить видимость
  // ---------------------------------------------------------------------------

  const startSharing = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setError("Геолокация недоступна в браузере");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10_000,
        });
      });

      const { lat, lon, accuracy } = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };

      const { error: fnErr } = await supabase.functions.invoke("people-nearby", {
        method: "POST",
        headers: { "x-path": "/update-location" },
        body: { lat, lon, accuracy, visible: true },
      });

      if (fnErr) throw new Error(fnErr.message);

      lastUpdateRef.current = Date.now();
      setIsSharing(true);
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        setError(
          err.code === 1
            ? "Доступ к геолокации запрещён. Разрешите в настройках браузера."
            : "Не удалось определить местоположение",
        );
      } else {
        setError(err instanceof Error ? err.message : "Ошибка геолокации");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // stopSharing — скрыть себя
  // ---------------------------------------------------------------------------

  const stopSharing = useCallback(async () => {
    try {
      await supabase.functions.invoke("people-nearby", {
        method: "POST",
        headers: { "x-path": "/hide" },
        body: {},
      });
    } catch (_) {
      // Не блокируем UI
    }
    setIsSharing(false);
  }, []);

  // ---------------------------------------------------------------------------
  // updateMyLocation — обновить координаты (rate limited)
  // ---------------------------------------------------------------------------

  const updateMyLocation = useCallback(async (lat: number, lon: number) => {
    if (!isSharing) return;

    // Клиентский rate limit
    if (Date.now() - lastUpdateRef.current < LOCATION_UPDATE_COOLDOWN_MS) return;

    try {
      const { error: fnErr } = await supabase.functions.invoke("people-nearby", {
        method: "POST",
        headers: { "x-path": "/update-location" },
        body: { lat, lon, visible: true },
      });

      if (fnErr) {
        logger.warn("[usePeopleNearby] updateMyLocation", { error: fnErr.message });
        return;
      }
      lastUpdateRef.current = Date.now();
    } catch (_) {
      // Сетевые ошибки не блокируют UX
    }
  }, [isSharing]);

  // ---------------------------------------------------------------------------
  // refreshNearby — загрузить список людей рядом
  // ---------------------------------------------------------------------------

  const refreshNearby = useCallback(async (lat: number, lon: number, radius = 5000) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("people-nearby", {
        method: "GET",
        headers: { "x-path": `/find?lat=${lat}&lon=${lon}&radius=${radius}` },
        body: undefined,
      });

      if (fnErr) throw new Error(fnErr.message);

      const result = (data as { users: NearbyUser[] } | null)?.users ?? [];
      setNearbyUsers(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить список");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Cleanup on unmount: скрыть себя
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (isSharing) {
        // fire and forget
        supabase.functions.invoke("people-nearby", {
          method: "POST",
          headers: { "x-path": "/hide" },
          body: {},
        }).catch((err) => { logger.warn("[PeopleNearby] Operation failed", { error: err }); });
      }
    };
     
  }, [isSharing]);

  return {
    nearbyUsers,
    isSharing,
    isLoading,
    error,
    startSharing,
    stopSharing,
    refreshNearby,
    updateMyLocation,
  };
}
