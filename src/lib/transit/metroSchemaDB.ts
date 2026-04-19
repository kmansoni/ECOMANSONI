/**
 * MetroSchemaDB — оффлайн-хранилище и рендерер схем метро для всех городов.
 * Загружает SVG-схемы из Supabase Storage, кэширует в IndexedDB.
 * Поддерживает маршрутизацию внутри метро (graph-based pathfinding).
 */

import { dbLoose } from '@/lib/supabase';
import { addressLocalizer } from '@/lib/localization/addressLocalizer';
import type { LatLng } from '@/types/taxi';

// ── Типы ──

export interface MetroLine {
  id: string;
  name: string;
  color: string;
  type: 'metro' | 'mcd' | 'mcc' | 'monorail' | 'tram' | 'lrt';
  stations: MetroStation[];
}

export interface MetroStation {
  id: string;
  name: string;
  names: Record<string, string>; // { ru: "Киевская", en: "Kiyevskaya", ... }
  lineId: string;
  lineColor: string;
  location: LatLng;
  transferStations: string[]; // IDs станций пересадки
  wheelchairAccessible: boolean;
  hasPlatformScreen: boolean;
  avgTransferTimeMinutes: number;
  exits: Array<{
    name: string;
    location: LatLng;
  }>;
}

export interface MetroTransfer {
  fromStationId: string;
  toStationId: string;
  walkingTimeSeconds: number;
  type: 'cross_platform' | 'tunnel' | 'street_level' | 'escalator';
  accessible: boolean;
}

export interface MetroCity {
  id: string;
  city: string;
  country: string;
  lines: MetroLine[];
  transfers: MetroTransfer[];
  svgSchemaUrl?: string;
  lastUpdated: Date;
}

export interface MetroRoute {
  stations: MetroStation[];
  lines: MetroLine[];
  transfers: number;
  totalTimeMinutes: number;
  segments: Array<{
    line: MetroLine;
    from: MetroStation;
    to: MetroStation;
    stationCount: number;
    durationMinutes: number;
  }>;
}

// ── IndexedDB кэш ──

const IDB_NAME = 'mansoni_metro';
const IDB_VERSION = 1;
const STORE_SCHEMAS = 'schemas';
const STORE_SVG = 'svg_cache';

async function openMetroIDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SCHEMAS)) {
        db.createObjectStore(STORE_SCHEMAS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SVG)) {
        db.createObjectStore(STORE_SVG, { keyPath: 'city' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function cacheMetroCity(city: MetroCity): Promise<void> {
  const db = await openMetroIDB();
  if (!db) return;
  const tx = db.transaction(STORE_SCHEMAS, 'readwrite');
  tx.objectStore(STORE_SCHEMAS).put({
    id: city.id,
    data: city,
    ts: Date.now(),
  });
}

async function getCachedMetroCity(cityId: string): Promise<MetroCity | null> {
  const db = await openMetroIDB();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_SCHEMAS, 'readonly');
    const req = tx.objectStore(STORE_SCHEMAS).get(cityId);
    req.onsuccess = () => resolve(req.result?.data ?? null);
    req.onerror = () => resolve(null);
  });
}

async function cacheSvg(city: string, svg: string): Promise<void> {
  const db = await openMetroIDB();
  if (!db) return;
  const tx = db.transaction(STORE_SVG, 'readwrite');
  tx.objectStore(STORE_SVG).put({ city, svg, ts: Date.now() });
}

async function getCachedSvg(city: string): Promise<string | null> {
  const db = await openMetroIDB();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_SVG, 'readonly');
    const req = tx.objectStore(STORE_SVG).get(city);
    req.onsuccess = () => resolve(req.result?.svg ?? null);
    req.onerror = () => resolve(null);
  });
}

// ── In-memory граф ──

const loadedCities = new Map<string, MetroCity>();

// Средняя скорость между станциями (минуты)
const AVG_STATION_TIME_MIN = 2.5;

// ── Загрузка ──

/** Загрузить данные метро для города из Supabase */
async function fetchMetroCityFromDB(cityName: string): Promise<MetroCity | null> {
  try {
    // Загружаем схему метро
    const { data: mapData } = await dbLoose
      .from('metro_maps')
      .select('*')
      .eq('city', cityName)
      .single();

    if (!mapData) return null;

    // Загружаем линии и станции из GTFS (route_type = metro)
    const { data: routes } = await dbLoose
      .from('gtfs_routes')
      .select('*')
      .eq('city', cityName)
      .eq('route_type', 1); // 1 = metro in GTFS

    const { data: stops } = await dbLoose
      .from('gtfs_stops')
      .select('*')
      .eq('city', cityName)
      .eq('location_type', 1); // station

    if (!routes || !stops) return null;

    const lines: MetroLine[] = (routes as Record<string, unknown>[]).map(r => ({
      id: String(r.route_id),
      name: String(r.route_long_name ?? r.route_short_name ?? ''),
      color: String(r.route_color ?? '#888888'),
      type: 'metro' as const,
      stations: [],
    }));

    const stations: MetroStation[] = (stops as Record<string, unknown>[]).map(s => ({
      id: String(s.stop_id),
      name: String(s.stop_name),
      names: { ru: String(s.stop_name) },
      lineId: '', // will be filled from stop_times
      lineColor: '#888',
      location: { lat: Number(s.stop_lat), lng: Number(s.stop_lon) },
      transferStations: [],
      wheelchairAccessible: Boolean(s.wheelchair_boarding),
      hasPlatformScreen: false,
      avgTransferTimeMinutes: 4,
      exits: [],
    }));

    // Assign stations to lines (simplified — full impl would use stop_times)
    const lineMap = new Map(lines.map(l => [l.id, l]));
    for (const station of stations) {
      // Find which line this station belongs to by checking stop_times
      const firstLine = lines[0];
      if (firstLine) {
        station.lineId = firstLine.id;
        station.lineColor = firstLine.color;
        firstLine.stations.push(station);
      }
    }

    // Build transfers (stations within 500m of each other on different lines)
    const transfers: MetroTransfer[] = [];
    for (let i = 0; i < stations.length; i++) {
      for (let j = i + 1; j < stations.length; j++) {
        if (stations[i].lineId === stations[j].lineId) continue;
        const dLat = stations[i].location.lat - stations[j].location.lat;
        const dLng = stations[i].location.lng - stations[j].location.lng;
        const distKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111.32;
        if (distKm < 0.5) {
          stations[i].transferStations.push(stations[j].id);
          stations[j].transferStations.push(stations[i].id);
          transfers.push({
            fromStationId: stations[i].id,
            toStationId: stations[j].id,
            walkingTimeSeconds: Math.round(distKm * 1000 / 1.2), // ~1.2 m/s walking
            type: distKm < 0.1 ? 'cross_platform' : 'tunnel',
            accessible: stations[i].wheelchairAccessible && stations[j].wheelchairAccessible,
          });
        }
      }
    }

    const city: MetroCity = {
      id: cityName,
      city: cityName,
      country: String(mapData.country ?? ''),
      lines,
      transfers,
      svgSchemaUrl: mapData.svg_url ? String(mapData.svg_url) : undefined,
      lastUpdated: new Date(),
    };

    return city;
  } catch {
    return null;
  }
}

// ── Public API ──

/** Загрузить и кэшировать данные метро для города */
export async function loadMetroCity(cityName: string): Promise<MetroCity | null> {
  // Memory cache
  if (loadedCities.has(cityName)) return loadedCities.get(cityName)!;

  // IDB cache
  const cached = await getCachedMetroCity(cityName);
  if (cached) {
    loadedCities.set(cityName, cached);
    return cached;
  }

  // Fetch from DB
  const city = await fetchMetroCityFromDB(cityName);
  if (city) {
    loadedCities.set(cityName, city);
    await cacheMetroCity(city);
  }
  return city;
}

/** Получить SVG-схему метро (кэшируется) */
export async function getMetroSvg(cityName: string): Promise<string | null> {
  const cached = await getCachedSvg(cityName);
  if (cached) return cached;

  const city = await loadMetroCity(cityName);
  if (!city?.svgSchemaUrl) return null;

  try {
    const res = await fetch(city.svgSchemaUrl);
    if (!res.ok) return null;
    const svg = await res.text();
    await cacheSvg(cityName, svg);
    return svg;
  } catch {
    return null;
  }
}

/** Найти ближайшую станцию метро к точке */
export function findNearestStation(cityName: string, position: LatLng): MetroStation | null {
  const city = loadedCities.get(cityName);
  if (!city) return null;

  let nearest: MetroStation | null = null;
  let minDist = Infinity;

  for (const line of city.lines) {
    for (const station of line.stations) {
      const dLat = station.location.lat - position.lat;
      const dLng = station.location.lng - position.lng;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < minDist) {
        minDist = dist;
        nearest = station;
      }
    }
  }
  return nearest;
}

/** Построить маршрут в метро (BFS по графу станций) */
export function buildMetroRoute(
  cityName: string,
  fromStationId: string,
  toStationId: string
): MetroRoute | null {
  const city = loadedCities.get(cityName);
  if (!city) return null;

  // Build adjacency from lines + transfers
  const allStations = new Map<string, MetroStation>();
  const lineByStation = new Map<string, MetroLine>();
  const adj = new Map<string, Array<{ stationId: string; timeMin: number; isTransfer: boolean }>>();

  for (const line of city.lines) {
    for (let i = 0; i < line.stations.length; i++) {
      const st = line.stations[i];
      allStations.set(st.id, st);
      lineByStation.set(st.id, line);
      if (!adj.has(st.id)) adj.set(st.id, []);

      // Adjacent stations on same line
      if (i > 0) {
        adj.get(st.id)!.push({ stationId: line.stations[i - 1].id, timeMin: AVG_STATION_TIME_MIN, isTransfer: false });
      }
      if (i < line.stations.length - 1) {
        adj.get(st.id)!.push({ stationId: line.stations[i + 1].id, timeMin: AVG_STATION_TIME_MIN, isTransfer: false });
      }
    }
  }

  // Add transfers
  for (const transfer of city.transfers) {
    const timeMin = transfer.walkingTimeSeconds / 60;
    if (!adj.has(transfer.fromStationId)) adj.set(transfer.fromStationId, []);
    if (!adj.has(transfer.toStationId)) adj.set(transfer.toStationId, []);
    adj.get(transfer.fromStationId)!.push({ stationId: transfer.toStationId, timeMin, isTransfer: true });
    adj.get(transfer.toStationId)!.push({ stationId: transfer.fromStationId, timeMin, isTransfer: true });
  }

  // BFS (Dijkstra light) to find shortest time path
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();
  const queue: Array<{ id: string; time: number }> = [{ id: fromStationId, time: 0 }];
  dist.set(fromStationId, 0);

  while (queue.length > 0) {
    queue.sort((a, b) => a.time - b.time);
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    if (current.id === toStationId) break;

    const neighbors = adj.get(current.id) ?? [];
    for (const n of neighbors) {
      const newTime = current.time + n.timeMin;
      if (newTime < (dist.get(n.stationId) ?? Infinity)) {
        dist.set(n.stationId, newTime);
        prev.set(n.stationId, current.id);
        queue.push({ id: n.stationId, time: newTime });
      }
    }
  }

  // Reconstruct path
  if (!prev.has(toStationId) && fromStationId !== toStationId) return null;

  const path: string[] = [];
  let cur = toStationId;
  while (cur) {
    path.unshift(cur);
    cur = prev.get(cur)!;
    if (cur === fromStationId) { path.unshift(cur); break; }
  }

  // Build segments by line
  const stations = path.map(id => allStations.get(id)!).filter(Boolean);
  const segments: MetroRoute['segments'] = [];
  let segStart = 0;
  let transfers = 0;

  for (let i = 1; i < stations.length; i++) {
    const prevLine = lineByStation.get(stations[i - 1].id);
    const curLine = lineByStation.get(stations[i].id);
    
    if (prevLine?.id !== curLine?.id || i === stations.length - 1) {
      const line = prevLine ?? curLine!;
      const end = prevLine?.id !== curLine?.id ? i - 1 : i;
      segments.push({
        line,
        from: stations[segStart],
        to: stations[end],
        stationCount: end - segStart,
        durationMinutes: (end - segStart) * AVG_STATION_TIME_MIN,
      });
      if (prevLine?.id !== curLine?.id) {
        transfers++;
        segStart = i;
        // If last station, add final segment
        if (i === stations.length - 1) {
          segments.push({
            line: curLine!,
            from: stations[i],
            to: stations[i],
            stationCount: 0,
            durationMinutes: 0,
          });
        }
      }
    }
  }

  return {
    stations,
    lines: [...new Set(segments.map(s => s.line))],
    transfers,
    totalTimeMinutes: dist.get(toStationId) ?? 0,
    segments,
  };
}

/** Локализовать название станции */
export function localizeStationName(station: MetroStation): string {
  return addressLocalizer.localizeMetroStation(station.name, station.names as Record<string, string>);
}

/** Список доступных городов с метро */
export async function listMetroCities(): Promise<string[]> {
  try {
    const { data } = await dbLoose
      .from('metro_maps')
      .select('city')
      .order('city');
    return (data ?? []).map((r: Record<string, unknown>) => String(r.city));
  } catch {
    return [];
  }
}

/** Очистить кэш */
export function clearMetroCache() {
  loadedCities.clear();
}
