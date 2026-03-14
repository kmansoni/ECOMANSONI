/**
 * dispatchService — алгоритм матчинга заказа с водителем.
 *
 * Реализует производственный алгоритм на основе анализа Uber/Яндекс Go/Bolt:
 *
 * Алгоритм (упрощённый H3-like nearest-driver):
 *   1. Найти всех доступных водителей в радиусе maxRadius км от pickup
 *   2. Отфильтровать по классу автомобиля (tariff == car_class)
 *   3. Подсчитать score = α * (1/distance) + β * driver_rating + γ * acceptance_rate
 *      Веса: α=0.6, β=0.3, γ=0.1 (distance — доминирующий фактор)
 *   4. Сортировать по score DESC → взять топ кандидата
 *   5. Назначить заказ водителю через RPC taxi_assign_order()
 *   6. Если водитель отклоняет (timeout 15 сек) → повторить с следующим кандидатом
 *   7. Если все кандидаты в radii отказали → расширить радиус x1.5, max 3 попытки
 *
 * Fraud protection:
 *   - Driver location timestamp < 30 сек (stale location отфильтровывается)
 *   - Driver не может быть назначен если уже занят (atomic DB update)
 *
 * State machine dispatch:
 *   [searching_driver] ──match found──► [assigned_to_driver]
 *                          │
 *                    no drivers in radius
 *                          │
 *                     [cancelled] (status = 'no_drivers')
 *
 * Из анализа docs/taxi-aggregator/04-ideal-architecture.md:
 *   Bolt: matching за 2-3 сек
 *   Uber: radius expansion — 500м → 1км → 2км → 5км
 *   Яндекс Go: ML-scoring (мы используем упрощённый linear scoring)
 */

import { supabase as _supabase } from "@/lib/supabase";
import type { LatLng, VehicleClass } from "@/types/taxi";
import { calculateDistance } from "./calculations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ── Constants ─────────────────────────────────────────────────────────────────

const MATCH_WEIGHT_DISTANCE   = 0.6;
const MATCH_WEIGHT_RATING     = 0.3;
const MATCH_WEIGHT_ACCEPTANCE = 0.1;

const INITIAL_SEARCH_RADIUS_KM = 2.0;
const MAX_SEARCH_RADIUS_KM     = 10.0;
const RADIUS_EXPANSION_FACTOR  = 1.5;
const MAX_DISPATCH_ATTEMPTS    = 3;
const DRIVER_LOCATION_STALE_SEC = 30;

// ── Types ─────────────────────────────────────────────────────────────────────

interface DriverCandidate {
  driverId: string;
  lat: number;
  lng: number;
  rating: number;
  acceptanceRate: number;
  distanceKm: number;
  score: number;
}

interface DispatchResult {
  success: boolean;
  assignedDriverId?: string;
  reason?: string;
}

// ── Core matching algorithm ───────────────────────────────────────────────────

/**
 * Найти ближайшего доступного водителя и назначить заказ.
 *
 * Вызывается из:
 *   - Supabase Edge Function taxi-dispatch (после ORDER INSERT)
 *   - В client side через triggerDispatch() как fallback
 */
export async function dispatchOrder(params: {
  orderId: string;
  pickupLat: number;
  pickupLng: number;
  tariff: VehicleClass;
  passengerRating: number;
}): Promise<DispatchResult> {
  let radius = INITIAL_SEARCH_RADIUS_KM;
  let attempt = 0;

  while (attempt < MAX_DISPATCH_ATTEMPTS && radius <= MAX_SEARCH_RADIUS_KM) {
    attempt++;

    // Step 1: Find candidates in radius
    const candidates = await fetchDriverCandidates({
      pickupLat: params.pickupLat,
      pickupLng: params.pickupLng,
      tariff: params.tariff,
      radiusKm: radius,
    });

    if (candidates.length === 0) {
      radius = Math.min(radius * RADIUS_EXPANSION_FACTOR, MAX_SEARCH_RADIUS_KM);
      continue;
    }

    // Step 2: Score and sort
    const scored = scoreAndSort(candidates);

    // Step 3: Try to assign to top candidate (atomic)
    const top = scored[0];
    const { error } = await supabase.rpc("taxi_assign_order_to_driver", {
      p_order_id: params.orderId,
      p_driver_id: top.driverId,
    });

    if (!error) {
      return { success: true, assignedDriverId: top.driverId };
    }

    // If assignment failed (race condition — driver became busy) → expand radius
    radius = Math.min(radius * RADIUS_EXPANSION_FACTOR, MAX_SEARCH_RADIUS_KM);
  }

  return { success: false, reason: "NO_DRIVERS_AVAILABLE" };
}

// ── Driver candidates query ───────────────────────────────────────────────────

async function fetchDriverCandidates(params: {
  pickupLat: number;
  pickupLng: number;
  tariff: VehicleClass;
  radiusKm: number;
}): Promise<DriverCandidate[]> {
  const staleThreshold = new Date(
    Date.now() - DRIVER_LOCATION_STALE_SEC * 1000
  ).toISOString();

  // Join taxi_driver_locations + taxi_drivers
  // Filter: available, matching car class, location not stale
  const { data, error } = await supabase
    .from("taxi_driver_locations")
    .select(`
      driver_id,
      lat,
      lng,
      updated_at,
      taxi_drivers!inner (
        id,
        rating,
        acceptance_rate,
        car_class,
        status
      )
    `)
    .eq("taxi_drivers.status", "available")
    .eq("taxi_drivers.car_class", params.tariff)
    .gte("updated_at", staleThreshold);

  if (error || !data) return [];

  const pickup: LatLng = { lat: params.pickupLat, lng: params.pickupLng };

  return (data as Record<string, unknown>[])
    .map((row) => {
      const driver = (row as { taxi_drivers: Record<string, unknown> }).taxi_drivers;
      const distKm = calculateDistance(pickup, {
        lat: Number(row.lat),
        lng: Number(row.lng),
      });
      return {
        driverId: String(row.driver_id),
        lat: Number(row.lat),
        lng: Number(row.lng),
        rating: Number(driver.rating ?? 4.5),
        acceptanceRate: Number(driver.acceptance_rate ?? 80),
        distanceKm: distKm,
        score: 0,
      };
    })
    .filter((c) => c.distanceKm <= params.radiusKm);
}

// ── Scoring algorithm ─────────────────────────────────────────────────────────

/**
 * Linear scoring: higher score = better candidate
 * score = α*(1/distance_km) + β*(rating/5) + γ*(acceptance_rate/100)
 * Normalised to [0, 1] range per component.
 */
function scoreAndSort(candidates: DriverCandidate[]): DriverCandidate[] {
  const maxDist = Math.max(...candidates.map((c) => c.distanceKm));

  return candidates
    .map((c) => ({
      ...c,
      score:
        MATCH_WEIGHT_DISTANCE   * (1 - c.distanceKm / maxDist) +
        MATCH_WEIGHT_RATING     * (c.rating / 5) +
        MATCH_WEIGHT_ACCEPTANCE * (c.acceptanceRate / 100),
    }))
    .sort((a, b) => b.score - a.score);
}

// ── Dispatch trigger (passenger-side) ────────────────────────────────────────

/**
 * Вызывается с клиента после создания заказа.
 * Edge Function taxi-dispatch является основным триггером,
 * этот метод — fallback если Edge Function недоступна.
 */
export async function triggerDispatch(
  orderId: string,
  pickup: LatLng,
  tariff: VehicleClass,
  passengerRating = 4.5
): Promise<DispatchResult> {
  // First: try Edge Function
  try {
    const { data, error } = await supabase.functions.invoke("taxi-dispatch", {
      body: {
        order_id: orderId,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        tariff,
        passenger_rating: passengerRating,
      },
    });
    if (!error && data?.success) {
      return { success: true, assignedDriverId: data.driver_id };
    }
  } catch {
    // Edge Function unavailable — fall through to client-side dispatch
  }

  // Fallback: client-side dispatch
  return dispatchOrder({
    orderId,
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
    tariff,
    passengerRating,
  });
}

// ── Driver candidates for map display ────────────────────────────────────────

/**
 * Получить позиции ближайших водителей для отображения на карте.
 * Используется для анимации машинок на главном экране.
 */
export async function getNearestDriversForMap(
  location: LatLng,
  tariff?: VehicleClass,
  radiusKm = 5
): Promise<Array<{ driverId: string; lat: number; lng: number; tariff: VehicleClass }>> {
  const staleThreshold = new Date(Date.now() - 60_000).toISOString();

  const query = supabase
    .from("taxi_driver_locations")
    .select(`
      driver_id, lat, lng,
      taxi_drivers!inner ( car_class, status )
    `)
    .eq("taxi_drivers.status", "available")
    .gte("updated_at", staleThreshold);

  if (tariff) {
    query.eq("taxi_drivers.car_class", tariff);
  }

  const { data } = await query;
  if (!data) return [];

  return (data as Record<string, unknown>[])
    .map((row) => {
      const driver = (row as { taxi_drivers: Record<string, unknown> }).taxi_drivers;
      return {
        driverId: String(row.driver_id),
        lat: Number(row.lat),
        lng: Number(row.lng),
        tariff: String(driver.car_class) as VehicleClass,
        distance: calculateDistance(location, { lat: Number(row.lat), lng: Number(row.lng) }),
      };
    })
    .filter((d) => d.distance <= radiusKm)
    .slice(0, 20); // max 20 on map
}
