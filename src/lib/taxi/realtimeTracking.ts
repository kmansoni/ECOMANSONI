/**
 * realtimeTracking — Supabase Realtime-based live driver position tracking.
 *
 * Заменяет mock-polling из api.ts getDriverLocation() на настоящий
 * real-time стриминг через Supabase Broadcast + Postgres Changes.
 *
 * Paттерн из Trippo (Flutter + Firebase Realtime) и mini-uber-microservice
 * (WebSocket location service), адаптирован к Supabase.
 *
 * Architecture:
 *   Водитель: broadcastDriverLocation() → upsert taxi_driver_locations
 *   Пассажир: subscribeToDriverLocation() → Supabase Realtime postgres_changes
 *             на taxi_driver_locations WHERE driver_id = X
 *
 * Throttling:
 *   - Driver client: max 1 update/second (enforced in driverService.ts)
 *   - Passenger subscriber: debounce 200ms to avoid render thrashing
 *
 * Fallback:
 *   If Realtime disconnect detected (CHANNEL_ERROR), falls back to HTTP polling
 *   every 3 seconds until channel reconnects.
 */

import { supabase as _supabase } from "@/lib/supabase";
import type { LatLng } from "@/types/taxi";
import { DRIVER_LOCATION_UPDATE_INTERVAL_MS } from "./constants";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export interface DriverLocationUpdate {
  driverId: string;
  lat: number;
  lng: number;
  heading: number;
  updatedAt: string;
  /** ETA to passenger's pickup, minutes */
  eta: number;
}

type LocationCallback = (update: DriverLocationUpdate) => void;

// ── Subscribe to driver's location ───────────────────────────────────────────

/**
 * Подписаться на местоположение водителя в реальном времени.
 *
 * Использует комбинацию:
 *   1. Supabase Realtime (основной канал — низкая задержка)
 *   2. HTTP polling fallback (3 сек интервал при ошибке канала)
 *
 * @returns unsubscribe function — вызови при unmount компонента
 */
export function subscribeToDriverLocation(
  driverId: string,
  pickupLocation: LatLng,
  onUpdate: LocationCallback
): () => void {
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let realtimeActive = false;
  let cancelled = false;

  // Debounce to prevent render thrashing
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const emit = (update: DriverLocationUpdate) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!cancelled) onUpdate(update);
    }, 200);
  };

  // ── Realtime channel ──────────────────────────────────────────────────
  const channel = supabase
    .channel(`driver_location_${driverId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "taxi_driver_locations",
        filter: `driver_id=eq.${driverId}`,
      },
      (payload: { new: Record<string, unknown> }) => {
        const row = payload.new;
        // Stop polling once we have realtime
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }

        const driverPos = { lat: Number(row.lat), lng: Number(row.lng) };
        emit({
          driverId,
          lat: driverPos.lat,
          lng: driverPos.lng,
          heading: Number(row.heading ?? 0),
          updatedAt: String(row.updated_at ?? new Date().toISOString()),
          eta: estimateEtaMinutes(driverPos, pickupLocation),
        });
      }
    )
    .subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        realtimeActive = true;
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        realtimeActive = false;
        startPolling();
      }
    });

  // ── Polling fallback ───────────────────────────────────────────────────
  const startPolling = () => {
    if (pollTimer || cancelled) return;
    pollTimer = setInterval(async () => {
      if (realtimeActive || cancelled) {
        clearInterval(pollTimer!);
        pollTimer = null;
        return;
      }
      try {
        const { data } = await supabase
          .from("taxi_driver_locations")
          .select("lat, lng, heading, updated_at")
          .eq("driver_id", driverId)
          .maybeSingle();

        if (data && !cancelled) {
          const driverPos = { lat: Number(data.lat), lng: Number(data.lng) };
          emit({
            driverId,
            lat: driverPos.lat,
            lng: driverPos.lng,
            heading: Number(data.heading ?? 0),
            updatedAt: String(data.updated_at ?? ""),
            eta: estimateEtaMinutes(driverPos, pickupLocation),
          });
        }
      } catch {
        // Silent — will retry
      }
    }, DRIVER_LOCATION_UPDATE_INTERVAL_MS);
  };

  // Start polling immediately — Realtime will take over when connected
  startPolling();

  return () => {
    cancelled = true;
    if (pollTimer) clearInterval(pollTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
    void supabase.removeChannel(channel);
  };
}

// ── Passive location watch for driver ────────────────────────────────────────

/**
 * Запустить автоматическую трансляцию GPS-позиции водителя.
 * Использует Geolocation API.
 *
 * @returns Функция остановки наблюдения
 */
export function startDriverLocationWatch(
  driverId: string,
  onError: (err: GeolocationPositionError) => void
): () => void {
  if (!navigator.geolocation) {
    onError({ code: 2, message: "Geolocation not supported" } as GeolocationPositionError);
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const coords: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const heading = pos.coords.heading ?? 0;

      try {
        // broadcastDriverLocation handles rate limiting
        const { broadcastDriverLocation } = await import("./driverService");
        await broadcastDriverLocation(driverId, coords, heading);
      } catch {
        // Non-critical — location will be re-sent next tick
      }
    },
    onError,
    {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 1000,
    }
  );

  return () => navigator.geolocation.clearWatch(watchId);
}

// ── ETA estimation ────────────────────────────────────────────────────────────

/**
 * Простая оценка ETA по расстоянию между двумя точками.
 * Средняя городская скорость 25 км/ч = ~2.4 минуты/км.
 */
function estimateEtaMinutes(from: LatLng, to: LatLng): number {
  const R = 6371;
  const dLat = (to.lat - from.lat) * Math.PI / 180;
  const dLon = (to.lng - from.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from.lat * Math.PI / 180) *
    Math.cos(to.lat * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const etaMin = Math.ceil(distKm * 2.4 * 1.3); // 1.3 — traffic factor
  return Math.max(1, etaMin);
}
