/**
 * surgePricing — автоматический расчёт surge-мультипликатора.
 *
 * Реализует динамическое ценообразование по паттерну Uber/Яндекс Go/Bolt:
 *
 * Факторы surge (из анализа docs/taxi-aggregator/04-ideal-architecture.md):
 *   1. Geo-зоны SURGE_ZONES из constants.ts (уже определены, но не использовались)
 *   2. Time-of-day pattern (утренний/вечерний час пик)
 *   3. Supply/demand ratio — соотношение заказов к доступным водителям
 *   4. Weather events (заглушка, расширяем позже)
 *
 * Алгоритм:
 *   base_multiplier = max(geo_zone_multiplier, time_multiplier)
 *   demand_boost = clamp(active_orders / available_drivers, 1.0, 2.0)
 *   final_surge = base_multiplier * demand_boost
 *   Clamp: [1.0, 3.5] — не превышаем Uber Russia cap
 *
 * Использование:
 *   const multiplier = await getSurgeMultiplier(pickupCoords);
 *   // Передаётся в estimateAllTariffs()
 *
 * До этого в расчётах использовался generateSurgeMultiplier() (random) из calculations.ts.
 * Эта функция ЗАМЕНЯЕТ random mock.
 */

import type { LatLng } from "@/types/taxi";
import { SURGE_ZONES } from "./constants";
import { calculateDistance } from "./calculations";
import { dbLoose } from "@/lib/supabase";

const supabase = dbLoose;

// ── Constants ─────────────────────────────────────────────────────────────────

const SURGE_MIN = 1.0;
const SURGE_MAX = 3.5;

// Time-of-day surge patterns (Moscow timezone hours)
const TIME_SURGE_RULES: Array<{ fromHour: number; toHour: number; multiplier: number }> = [
  { fromHour: 7,  toHour: 9,  multiplier: 1.4 }, // Morning rush
  { fromHour: 17, toHour: 20, multiplier: 1.6 }, // Evening rush
  { fromHour: 0,  toHour: 5,  multiplier: 1.2 }, // Night surcharge
  { fromHour: 23, toHour: 24, multiplier: 1.3 }, // Late night
];

// ── Main API ───────────────────────────────────────────────────────────────────

/**
 * Compute the surge multiplier for a given pickup location.
 *
 * Priority:
 *   1. Check if location falls within a defined SURGE_ZONE
 *   2. Apply time-of-day factor
 *   3. Apply demand/supply factor (requires DB query)
 *
 * @returns Promise<number> — surge multiplier, range [1.0, 3.5]
 */
export async function getSurgeMultiplier(
  pickup: LatLng,
  tariff?: string
): Promise<number> {
  // Geo zone check
  const geoMultiplier = getGeoZoneMultiplier(pickup);

  // Time of day
  const timeMultiplier = getTimeOfDayMultiplier();

  // Demand/supply ratio from DB (best-effort, ignores errors)
  const demandMultiplier = await getDemandMultiplier(pickup).catch(() => 1.0);

  const combined = Math.max(geoMultiplier, timeMultiplier) * demandMultiplier;
  const clamped = Math.max(SURGE_MIN, Math.min(SURGE_MAX, combined));

  // Round to nearest 0.1 for clean UI display
  return Math.round(clamped * 10) / 10;
}

// ── Geo zone surge ────────────────────────────────────────────────────────────

/**
 * Check if pickup falls within any predefined SURGE_ZONE.
 * Uses Haversine distance from zone center.
 */
export function getGeoZoneMultiplier(pickup: LatLng): number {
  let maxMultiplier = 1.0;

  for (const zone of SURGE_ZONES) {
    const distKm = calculateDistance(pickup, zone.center);
    if (distKm <= zone.radiusKm) {
      maxMultiplier = Math.max(maxMultiplier, zone.multiplier);
    }
  }

  return maxMultiplier;
}

// ── Time-of-day surge ─────────────────────────────────────────────────────────

export function getTimeOfDayMultiplier(): number {
  const nowMoscow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" })
  );
  const hour = nowMoscow.getHours();

  for (const rule of TIME_SURGE_RULES) {
    if (hour >= rule.fromHour && hour < rule.toHour) {
      return rule.multiplier;
    }
  }

  return 1.0;
}

// ── Demand/supply ratio ───────────────────────────────────────────────────────

/**
 * Calculate demand boost from active_orders / available_drivers ratio.
 *
 * Query: count searching_driver orders + count available drivers
 * within ~5km radius of pickup point.
 *
 * Result:
 *   ratio <= 0.5 → 1.0 (more drivers than demand)
 *   ratio 0.5-1  → 1.0–1.3
 *   ratio 1-2    → 1.3–1.8
 *   ratio >2     → 1.8–2.0 (cap)
 */
async function getDemandMultiplier(pickup: LatLng): Promise<number> {
  // Count available drivers in ~5km bounding box
  const latDelta = 0.045; // ~5km
  const lngDelta = 0.06;

  const [ordersRes, driversRes] = await Promise.all([
    supabase
      .from("taxi_rides")
      .select("id", { count: "exact", head: true })
      .eq("status", "searching_driver"),
    supabase
      .from("taxi_driver_locations")
      .select("driver_id", { count: "exact", head: true })
      .gte("lat", pickup.lat - latDelta)
      .lte("lat", pickup.lat + latDelta)
      .gte("lng", pickup.lng - lngDelta)
      .lte("lng", pickup.lng + lngDelta)
      .gte("updated_at", new Date(Date.now() - 60_000).toISOString()),
  ]);

  const orders = ordersRes.count ?? 0;
  const drivers = Math.max(1, driversRes.count ?? 1);
  const ratio = orders / drivers;

  // Smooth step interpolation
  if (ratio <= 0.5) return 1.0;
  if (ratio <= 1.0) return 1.0 + (ratio - 0.5) * 0.6; // 1.0 → 1.3
  if (ratio <= 2.0) return 1.3 + (ratio - 1.0) * 0.5; // 1.3 → 1.8
  return Math.min(2.0, 1.8 + (ratio - 2.0) * 0.1);
}

// ── Surge label for UI ────────────────────────────────────────────────────────

export interface SurgeInfo {
  multiplier: number;
  label: string;
  color: string;
  isActive: boolean;
  reason?: string;
}

export function formatSurgeInfo(multiplier: number): SurgeInfo {
  const isActive = multiplier > 1.05;

  if (!isActive) {
    return { multiplier: 1.0, label: "Нормальная цена", color: "text-green-400", isActive: false };
  }
  if (multiplier < 1.5) {
    return { multiplier, label: `×${multiplier.toFixed(1)} — небольшой спрос`, color: "text-yellow-400", isActive: true, reason: "Повышенный спрос" };
  }
  if (multiplier < 2.0) {
    return { multiplier, label: `×${multiplier.toFixed(1)} — высокий спрос`, color: "text-orange-400", isActive: true, reason: "Высокий спрос" };
  }
  return { multiplier, label: `×${multiplier.toFixed(1)} — очень высокий спрос`, color: "text-red-400", isActive: true, reason: "Пиковое время" };
}

/**
 * Enrich tariff estimates with real surge multipliers.
 * Replaces random generateSurgeMultiplier() from calculations.ts.
 */
export async function enrichTariffsWithSurge<T extends { surgeMultiplier: number }>(
  tariffs: T[],
  pickup: LatLng
): Promise<T[]> {
  const surge = await getSurgeMultiplier(pickup);
  return tariffs.map((t) => ({ ...t, surgeMultiplier: surge }));
}
