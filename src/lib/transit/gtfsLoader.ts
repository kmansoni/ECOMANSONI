/**
 * GTFS Static Data Loader
 * Loads GTFS data from Supabase tables (pre-imported by Edge Function).
 * Provides in-memory cache for route planning.
 */

import { dbLoose } from '@/lib/supabase';
import type { TransitStop, TransitType } from '@/types/navigation';
import type { LatLng } from '@/types/taxi';

// GTFS route_type → our TransitType
const ROUTE_TYPE_MAP: Record<number, TransitType> = {
  0: 'tram',
  1: 'metro',
  2: 'suburban',  // rail
  3: 'bus',
  4: 'ferry',
  5: 'cable_car',
  7: 'trolleybus', // extended GTFS: trolleybus
  11: 'trolleybus',
  800: 'trolleybus',
};

export interface GTFSRoute {
  id: string;
  routeId: string;
  agencyId: string;
  shortName: string;
  longName: string;
  type: TransitType;
  color: string;
  textColor: string;
  city: string;
}

export interface GTFSTrip {
  id: string;
  tripId: string;
  routeId: string;
  serviceId: string;
  directionId: number;
  headsign: string;
  wheelchairAccessible: boolean;
}

export interface GTFSStopTime {
  tripId: string;
  stopId: string;
  arrivalSeconds: number;
  departureSeconds: number;
  stopSequence: number;
}

export interface GTFSCalendar {
  serviceId: string;
  city: string;
  days: boolean[]; // [mon, tue, wed, thu, fri, sat, sun]
  startDate: string;
  endDate: string;
}

// In-memory caches (loaded on demand, per city)
const routeCache = new Map<string, GTFSRoute[]>();
const stopCache = new Map<string, TransitStop[]>();
const tripCache = new Map<string, GTFSTrip[]>();
const stopTimesCache = new Map<string, GTFSStopTime[]>(); // key: tripId
const calendarCache = new Map<string, GTFSCalendar[]>();

export async function loadGTFSRoutes(city: string): Promise<GTFSRoute[]> {
  if (routeCache.has(city)) return routeCache.get(city)!;

  const { data, error } = await dbLoose
    .from('gtfs_routes')
    .select('*')
    .eq('city', city)
    .eq('is_active', true)
    .order('route_type')
    .order('route_short_name');

  if (error) {
    console.error('[GTFS] Failed to load routes:', error.message);
    return [];
  }

  const routes: GTFSRoute[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    routeId: r.route_id as string,
    agencyId: r.agency_id as string,
    shortName: (r.route_short_name as string) ?? '',
    longName: (r.route_long_name as string) ?? '',
    type: ROUTE_TYPE_MAP[r.route_type as number] ?? 'bus',
    color: (r.route_color as string) ?? '#3B82F6',
    textColor: (r.route_text_color as string) ?? '#FFFFFF',
    city: r.city as string,
  }));

  routeCache.set(city, routes);
  return routes;
}

export async function loadGTFSStops(city: string): Promise<TransitStop[]> {
  if (stopCache.has(city)) return stopCache.get(city)!;

  const { data, error } = await dbLoose
    .from('gtfs_stops')
    .select('*')
    .eq('city', city);

  if (error) {
    console.error('[GTFS] Failed to load stops:', error.message);
    return [];
  }

  const stops: TransitStop[] = (data ?? []).map((s: Record<string, unknown>) => ({
    id: s.id as string,
    stopId: s.stop_id as string,
    name: s.stop_name as string,
    location: { lat: s.lat as number, lng: s.lng as number },
    locationType: (s.location_type as number) ?? 0,
    wheelchairBoarding: s.wheelchair_boarding as boolean | undefined,
    city: s.city as string,
  }));

  stopCache.set(city, stops);
  return stops;
}

export async function loadGTFSTripsForRoute(routeDbId: string): Promise<GTFSTrip[]> {
  if (tripCache.has(routeDbId)) return tripCache.get(routeDbId)!;

  const { data, error } = await dbLoose
    .from('gtfs_trips')
    .select('*')
    .eq('route_id', routeDbId);

  if (error) {
    console.error('[GTFS] Failed to load trips:', error.message);
    return [];
  }

  const trips: GTFSTrip[] = (data ?? []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    tripId: t.trip_id as string,
    routeId: t.route_id as string,
    serviceId: t.service_id as string,
    directionId: (t.direction_id as number) ?? 0,
    headsign: (t.headsign as string) ?? '',
    wheelchairAccessible: (t.wheelchair_accessible as boolean) ?? false,
  }));

  tripCache.set(routeDbId, trips);
  return trips;
}

export async function loadStopTimesForTrip(tripDbId: string): Promise<GTFSStopTime[]> {
  if (stopTimesCache.has(tripDbId)) return stopTimesCache.get(tripDbId)!;

  const { data, error } = await dbLoose
    .from('gtfs_stop_times')
    .select('trip_id, stop_id, arrival_seconds, departure_seconds, stop_sequence')
    .eq('trip_id', tripDbId)
    .order('stop_sequence');

  if (error) {
    console.error('[GTFS] Failed to load stop_times:', error.message);
    return [];
  }

  const times: GTFSStopTime[] = (data ?? []).map((st: Record<string, unknown>) => ({
    tripId: st.trip_id as string,
    stopId: st.stop_id as string,
    arrivalSeconds: st.arrival_seconds as number,
    departureSeconds: st.departure_seconds as number,
    stopSequence: st.stop_sequence as number,
  }));

  stopTimesCache.set(tripDbId, times);
  return times;
}

export async function loadGTFSCalendar(city: string): Promise<GTFSCalendar[]> {
  if (calendarCache.has(city)) return calendarCache.get(city)!;

  const { data, error } = await dbLoose
    .from('gtfs_calendar')
    .select('*')
    .eq('city', city);

  if (error) {
    console.error('[GTFS] Failed to load calendar:', error.message);
    return [];
  }

  const calendars: GTFSCalendar[] = (data ?? []).map((c: Record<string, unknown>) => ({
    serviceId: c.service_id as string,
    city: c.city as string,
    days: [
      c.monday as boolean, c.tuesday as boolean, c.wednesday as boolean,
      c.thursday as boolean, c.friday as boolean, c.saturday as boolean,
      c.sunday as boolean,
    ],
    startDate: c.start_date as string,
    endDate: c.end_date as string,
  }));

  calendarCache.set(city, calendars);
  return calendars;
}

/**
 * Find nearby stops using Supabase RPC (Haversine in SQL)
 */
export async function findNearbyStops(
  center: LatLng,
  radiusKm: number = 1.0
): Promise<Array<{ stop: TransitStop; distKm: number }>> {
  const { data, error } = await dbLoose.rpc('transit_stops_near', {
    p_lat: center.lat,
    p_lng: center.lng,
    p_radius_km: radiusKm,
  });

  if (error) {
    console.error('[GTFS] Failed to find nearby stops:', error.message);
    return [];
  }

  return (data ?? []).map((s: Record<string, unknown>) => {
    const stop: TransitStop = {
      id: s.id as string,
      stopId: s.stop_id as string,
      name: s.stop_name as string,
      location: { lat: s.lat as number, lng: s.lng as number },
      locationType: (s.location_type as number) ?? 0,
      wheelchairBoarding: s.wheelchair_boarding as boolean | undefined,
      city: s.city as string,
    };
    const dlat = (center.lat - (s.lat as number)) * 111.32;
    const dlng = (center.lng - (s.lng as number)) * 111.32 * Math.cos(center.lat * Math.PI / 180);
    const distKm = Math.sqrt(dlat * dlat + dlng * dlng);
    return { stop, distKm };
  }).sort((a: { distKm: number }, b: { distKm: number }) => a.distKm - b.distKm);
}

/**
 * Check if a GTFS service runs on a given date
 */
export function isServiceActiveOnDate(calendar: GTFSCalendar, date: Date): boolean {
  const dayOfWeek = date.getDay(); // 0=sun, 1=mon...
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // convert to mon=0...sun=6
  if (!calendar.days[dayIndex]) return false;

  const dateStr = date.toISOString().split('T')[0];
  return dateStr >= calendar.startDate && dateStr <= calendar.endDate;
}

/**
 * Convert seconds since midnight to HH:MM string
 */
export function secondsToTimeString(seconds: number): string {
  const h = Math.floor(seconds / 3600) % 24;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Current seconds since midnight
 */
export function currentDaySeconds(): number {
  const now = new Date();
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

/**
 * Clear all GTFS caches (useful when switching cities)
 */
export function clearGTFSCache(): void {
  routeCache.clear();
  stopCache.clear();
  tripCache.clear();
  stopTimesCache.clear();
  calendarCache.clear();
}
