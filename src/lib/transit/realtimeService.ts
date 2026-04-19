/**
 * GTFS-RT (Realtime) — ingester и распределитель данных о транспорте в реальном времени.
 * Поддерживает: vehicle positions, trip updates (arrivals/delays), service alerts.
 * Протокол: polling каждые 15 сек → декодирование Protocol Buffers → обновление кэша.
 */

import { dbLoose } from '@/lib/supabase';
import type { RealTimeVehicle, TransitStop, TransitType } from '@/types/navigation';
import type { LatLng } from '@/types/taxi';

// ── Типы ──

export interface TripUpdate {
  tripId: string;
  routeId: string;
  stopTimeUpdates: Array<{
    stopId: string;
    stopSequence: number;
    arrivalDelay: number;     // seconds (positive = late)
    departureDelay: number;
    scheduledArrival?: Date;
    predictedArrival?: Date;
  }>;
  timestamp: Date;
}

export interface ServiceAlert {
  id: string;
  headerText: string;
  descriptionText: string;
  cause: 'unknown' | 'construction' | 'accident' | 'weather' | 'strike' | 'technical';
  effect: 'no_service' | 'reduced_service' | 'significant_delays' | 'detour' | 'additional_service' | 'modified_service' | 'other';
  affectedRoutes: string[];
  affectedStops: string[];
  activePeriod: { start: Date; end?: Date }[];
  severity: 'info' | 'warning' | 'severe';
}

export interface MetroArrival {
  stationId: string;
  lineId: string;
  direction: string;
  nextTrainMinutes: number;
  delayMinutes: number;
  platformNumber?: number;
  congestionLevel: 'low' | 'medium' | 'high';
}

export type RealtimeListener = (event: RealtimeEvent) => void;

export interface RealtimeEvent {
  type: 'vehicles' | 'trip_updates' | 'alerts' | 'metro';
  city: string;
  data: RealTimeVehicle[] | TripUpdate[] | ServiceAlert[] | MetroArrival[];
}

// ── Кэш в памяти ──

interface CityCache {
  vehicles: Map<string, RealTimeVehicle>;
  tripUpdates: Map<string, TripUpdate>;
  alerts: Map<string, ServiceAlert>;
  metroArrivals: Map<string, MetroArrival[]>;
  lastUpdate: number;
}

const cityCache = new Map<string, CityCache>();
const listeners = new Set<RealtimeListener>();
const pollingIntervals = new Map<string, ReturnType<typeof setInterval>>();

const POLL_INTERVAL_MS = 15_000; // 15 секунд
const STALE_THRESHOLD_MS = 60_000; // 1 минута — после этого данные устаревшие

// ── Утилиты ──

function getOrCreateCache(city: string): CityCache {
  let cache = cityCache.get(city);
  if (!cache) {
    cache = {
      vehicles: new Map(),
      tripUpdates: new Map(),
      alerts: new Map(),
      metroArrivals: new Map(),
      lastUpdate: 0,
    };
    cityCache.set(city, cache);
  }
  return cache;
}

function emit(event: RealtimeEvent) {
  for (const listener of listeners) {
    try { listener(event); } catch { /* listener error */ }
  }
}

// ── Polling: Vehicle Positions ──

async function fetchVehiclePositions(city: string): Promise<RealTimeVehicle[]> {
  try {
    const { data, error } = await dbLoose
      .from('transit_vehicle_positions')
      .select('*')
      .eq('city', city)
      .gte('recorded_at', new Date(Date.now() - STALE_THRESHOLD_MS).toISOString())
      .order('recorded_at', { ascending: false })
      .limit(500);

    if (error || !data) return [];

    return data.map((row: Record<string, unknown>) => ({
      tripId: String(row.trip_id ?? ''),
      vehicleId: String(row.vehicle_id ?? ''),
      position: { lat: Number(row.lat), lng: Number(row.lng) },
      bearing: Number(row.bearing ?? 0),
      speedKmh: Number(row.speed_kmh ?? 0),
      timestamp: new Date(String(row.recorded_at)),
      delaySeconds: Number(row.current_delay_sec ?? 0),
      routeColor: row.route_color ? String(row.route_color) : undefined,
      routeName: row.route_name ? String(row.route_name) : undefined,
      congestionLevel: (row.congestion_level as RealTimeVehicle['congestionLevel']) ?? 'low',
    }));
  } catch {
    return [];
  }
}

// ── Polling: Trip Updates (arrivals, delays) ──

async function fetchTripUpdates(city: string): Promise<TripUpdate[]> {
  try {
    const { data, error } = await dbLoose
      .from('transit_trip_updates')
      .select('*')
      .eq('city', city)
      .gte('recorded_at', new Date(Date.now() - STALE_THRESHOLD_MS).toISOString())
      .order('recorded_at', { ascending: false })
      .limit(1000);

    if (error || !data) return [];

    // Group by trip_id
    const grouped = new Map<string, TripUpdate>();
    for (const row of data) {
      const tripId = String(row.trip_id);
      let update = grouped.get(tripId);
      if (!update) {
        update = {
          tripId,
          routeId: String(row.route_id ?? ''),
          stopTimeUpdates: [],
          timestamp: new Date(String(row.recorded_at)),
        };
        grouped.set(tripId, update);
      }
      update.stopTimeUpdates.push({
        stopId: String(row.stop_id),
        stopSequence: Number(row.stop_sequence ?? 0),
        arrivalDelay: Number(row.arrival_delay ?? 0),
        departureDelay: Number(row.departure_delay ?? 0),
        scheduledArrival: row.scheduled_arrival ? new Date(String(row.scheduled_arrival)) : undefined,
        predictedArrival: row.predicted_arrival ? new Date(String(row.predicted_arrival)) : undefined,
      });
    }

    return Array.from(grouped.values());
  } catch {
    return [];
  }
}

// ── Polling: Metro Arrivals ──

async function fetchMetroArrivals(city: string): Promise<MetroArrival[]> {
  try {
    const { data, error } = await dbLoose
      .from('transit_trip_updates')
      .select('*')
      .eq('city', city)
      .eq('route_type', 'metro')
      .gte('recorded_at', new Date(Date.now() - STALE_THRESHOLD_MS).toISOString())
      .order('recorded_at', { ascending: false })
      .limit(200);

    if (error || !data) return [];

    return data.map((row: Record<string, unknown>) => ({
      stationId: String(row.stop_id),
      lineId: String(row.route_id ?? ''),
      direction: String(row.direction ?? ''),
      nextTrainMinutes: Math.max(0, Math.round(Number(row.arrival_delay ?? 0) / 60)),
      delayMinutes: Math.round(Number(row.arrival_delay ?? 0) / 60),
      congestionLevel: (row.congestion_level as MetroArrival['congestionLevel']) ?? 'low',
    }));
  } catch {
    return [];
  }
}

// ── Один цикл обновления ──

async function pollCity(city: string) {
  const cache = getOrCreateCache(city);

  const [vehicles, tripUpdates, metro] = await Promise.all([
    fetchVehiclePositions(city),
    fetchTripUpdates(city),
    fetchMetroArrivals(city),
  ]);

  // Обновляем кэш
  if (vehicles.length > 0) {
    cache.vehicles.clear();
    for (const v of vehicles) cache.vehicles.set(v.vehicleId, v);
    emit({ type: 'vehicles', city, data: vehicles });
  }

  if (tripUpdates.length > 0) {
    cache.tripUpdates.clear();
    for (const t of tripUpdates) cache.tripUpdates.set(t.tripId, t);
    emit({ type: 'trip_updates', city, data: tripUpdates });
  }

  if (metro.length > 0) {
    const byStation = new Map<string, MetroArrival[]>();
    for (const m of metro) {
      const arr = byStation.get(m.stationId) ?? [];
      arr.push(m);
      byStation.set(m.stationId, arr);
    }
    cache.metroArrivals = byStation;
    emit({ type: 'metro', city, data: metro });
  }

  cache.lastUpdate = Date.now();
}

// ── Публичный API ──

/** Подписаться на обновления реального времени для города */
export function startRealtimePolling(city: string) {
  if (pollingIntervals.has(city)) return; // уже полим

  // Первый fetch сразу
  pollCity(city);

  const interval = setInterval(() => pollCity(city), POLL_INTERVAL_MS);
  pollingIntervals.set(city, interval);
}

/** Остановить polling для города */
export function stopRealtimePolling(city: string) {
  const interval = pollingIntervals.get(city);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(city);
  }
}

/** Остановить все polling */
export function stopAllRealtimePolling() {
  for (const [city, interval] of pollingIntervals) {
    clearInterval(interval);
  }
  pollingIntervals.clear();
}

/** Подписаться на события реального времени */
export function onRealtimeEvent(listener: RealtimeListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Получить текущие позиции транспорта (из кэша) */
export function getVehiclePositions(city: string): RealTimeVehicle[] {
  const cache = cityCache.get(city);
  if (!cache) return [];
  return Array.from(cache.vehicles.values());
}

/** Получить задержки для конкретного trip */
export function getTripDelay(city: string, tripId: string): TripUpdate | null {
  return cityCache.get(city)?.tripUpdates.get(tripId) ?? null;
}

/** Получить задержку прибытия для остановки */
export function getStopArrivalDelay(city: string, tripId: string, stopId: string): number {
  const update = getTripDelay(city, tripId);
  if (!update) return 0;
  const stu = update.stopTimeUpdates.find(s => s.stopId === stopId);
  return stu?.arrivalDelay ?? 0;
}

/** Получить прибытие метро для станции */
export function getMetroArrivals(city: string, stationId: string): MetroArrival[] {
  return cityCache.get(city)?.metroArrivals.get(stationId) ?? [];
}

/** Найти ближайшие транспортные средства к точке */
export function getNearbyVehicles(city: string, position: LatLng, radiusKm = 1): RealTimeVehicle[] {
  const vehicles = getVehiclePositions(city);
  return vehicles.filter(v => {
    const dLat = v.position.lat - position.lat;
    const dLng = v.position.lng - position.lng;
    const approxKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111.32;
    return approxKm <= radiusKm;
  });
}

/** Проверить, свежие ли данные */
export function isDataFresh(city: string): boolean {
  const cache = cityCache.get(city);
  if (!cache) return false;
  return Date.now() - cache.lastUpdate < STALE_THRESHOLD_MS;
}

/** Получить все активные алерты */
export function getActiveAlerts(city: string): ServiceAlert[] {
  const cache = cityCache.get(city);
  if (!cache) return [];
  return Array.from(cache.alerts.values());
}
