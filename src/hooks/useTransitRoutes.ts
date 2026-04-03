/**
 * useTransitRoutes — хук для работы с маршрутами общественного транспорта.
 *
 * - routes — список маршрутов ОТ
 * - searchRoutes(query) — поиск по номеру маршрута
 * - getRouteStops(routeId) — остановки маршрута
 * - nearbyRoutes(lat, lng) — маршруты рядом (по данным stops)
 * - loading, error
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { dbLoose } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { LatLng } from '@/types/taxi';

// ─── Типы ────────────────────────────────────────────────────────────────────

export type TransitType = 'bus' | 'trolleybus' | 'tram' | 'metro' | 'suburban';

export interface TransitStop {
  id: string;
  name: string;
  location: LatLng;
  order: number;
}

export interface TransitRoute {
  id: string;
  route_number: string;
  route_type: TransitType;
  name: string;
  stops: TransitStop[];
  schedule: Record<string, unknown>;
  color: string;
  is_active: boolean;
  updated_at: string;
}

const PAGE_SIZE = 50;

// ─── Маппинг строки DB → TransitRoute ────────────────────────────────────────

function rowToTransitRoute(row: Record<string, unknown>): TransitRoute {
  return {
    id: row.id as string,
    route_number: row.route_number as string,
    route_type: row.route_type as TransitType,
    name: row.name as string,
    stops: (row.stops as TransitStop[]) ?? [],
    schedule: (row.schedule as Record<string, unknown>) ?? {},
    color: (row.color as string) ?? '#3B82F6',
    is_active: row.is_active as boolean,
    updated_at: row.updated_at as string,
  };
}

// ─── Расчёт расстояния (Haversine, км) ──────────────────────────────────────

function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ─── Хук ─────────────────────────────────────────────────────────────────────

export function useTransitRoutes() {
  const [routes, setRoutes] = useState<TransitRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── Загрузить все активные маршруты ────────────────────────────────────

  const loadRoutes = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);

    try {
      const { data, error: dbErr } = await dbLoose
        .from('transit_routes')
        .select('id, route_number, route_type, name, stops, schedule, color, is_active, updated_at')
        .eq('is_active', true)
        .order('route_type')
        .order('route_number')
        .limit(PAGE_SIZE);

      if (ac.signal.aborted) return;

      if (dbErr) {
        logger.error('[useTransitRoutes] Ошибка загрузки маршрутов', { error: dbErr });
        setError('Не удалось загрузить маршруты');
        toast.error('Не удалось загрузить маршруты ОТ');
        return;
      }

      const mapped = (data ?? []).map((row: Record<string, unknown>) => rowToTransitRoute(row));
      setRoutes(mapped);
    } catch (e) {
      if (ac.signal.aborted) return;
      logger.error('[useTransitRoutes] Неожиданная ошибка', { error: e });
      setError('Произошла ошибка при загрузке маршрутов');
    } finally {
      if (!ac.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadRoutes();
    return () => { abortRef.current?.abort(); };
  }, [loadRoutes]);

  // ─── Поиск по номеру маршрута ──────────────────────────────────────────

  const searchRoutes = useCallback(async (query: string): Promise<TransitRoute[]> => {
    const trimmed = query.trim();
    if (!trimmed) return routes;

    try {
      const { data, error: dbErr } = await dbLoose
        .from('transit_routes')
        .select('id, route_number, route_type, name, stops, schedule, color, is_active, updated_at')
        .eq('is_active', true)
        .ilike('route_number', `%${trimmed}%`)
        .order('route_number')
        .limit(20);

      if (dbErr) {
        logger.error('[useTransitRoutes] Ошибка поиска маршрутов', { query: trimmed, error: dbErr });
        return [];
      }

      return (data ?? []).map((row: Record<string, unknown>) => rowToTransitRoute(row));
    } catch (e) {
      logger.error('[useTransitRoutes] Неожиданная ошибка поиска', { error: e });
      return [];
    }
  }, [routes]);

  // ─── Остановки конкретного маршрута ────────────────────────────────────

  const getRouteStops = useCallback((routeId: string): TransitStop[] => {
    const route = routes.find((r) => r.id === routeId);
    if (!route) return [];
    return [...route.stops].sort((a, b) => a.order - b.order);
  }, [routes]);

  // ─── Маршруты рядом с координатой (по данным stops) ────────────────────

  const nearbyRoutes = useCallback((lat: number, lng: number, radiusKm = 1): TransitRoute[] => {
    const origin: LatLng = { lat, lng };

    return routes.filter((route) =>
      route.stops.some((stop) => haversineKm(origin, stop.location) <= radiusKm)
    );
  }, [routes]);

  return {
    routes,
    loading,
    error,
    searchRoutes,
    getRouteStops,
    nearbyRoutes,
    refresh: loadRoutes,
  };
}
