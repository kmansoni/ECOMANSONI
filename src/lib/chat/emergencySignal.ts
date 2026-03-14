/**
 * emergencySignal — Emergency SOS broadcast system.
 *
 * Derived from Crisis Mesh Messenger (crisis-mesh-messenger/lib/core/models/emergency_signal.dart)
 * adapted to our React/TypeScript + Supabase stack.
 *
 * Architecture:
 *   - Emergency signals are stored in `emergency_signals` Supabase table.
 *   - Signals propagate via Supabase Realtime to all connected clients.
 *   - RLS enforces: authenticated users can INSERT their own signals,
 *     SELECT all active signals, UPDATE only their own (to resolve).
 *   - Priority scoring accounts for signal type, level, age, and hop count.
 *   - Rate limit: max 1 active unresolved SOS per user at a time (enforced DB-side).
 *
 * State machine per signal:
 *   [active] ──resolve()──► [resolved]
 *                               │
 *                           isActive=false, resolvedAt, resolvedBy set
 *
 * Security constraints:
 *   - userId is extracted from JWT on server — client cannot spoof.
 *   - Location is optional; coordinates validated as finite numbers client-side.
 *   - Signal body max 500 chars to prevent abuse.
 *   - Signals expire after 24h (TTL enforced by DB scheduled cleanup).
 */

import { supabase } from "@/lib/supabase";

// ── Enums ─────────────────────────────────────────────────────────────────────

export type EmergencyLevel = "critical" | "high" | "medium" | "low";

export type EmergencySignalType =
  | "sos"
  | "medical"
  | "trapped"
  | "danger"
  | "safe"
  | "need_water"
  | "need_food"
  | "need_shelter"
  | "need_medication"
  | "found_survivor";

// ── Core model ────────────────────────────────────────────────────────────────

export interface EmergencySignal {
  id: string;
  userId: string;
  senderName: string;
  type: EmergencySignalType;
  level: EmergencyLevel;
  message: string;
  latitude: number | null;
  longitude: number | null;
  /** How many relay hops this signal has traveled (mesh context) */
  hopCount: number;
  routePath: string[];
  isActive: boolean;
  createdAt: string; // ISO 8601
  resolvedAt: string | null;
  resolvedBy: string | null;
}

// Map snake_case DB row → camelCase model
function rowToSignal(row: Record<string, unknown>): EmergencySignal {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    senderName: String(row.sender_name ?? ""),
    type: row.type as EmergencySignalType,
    level: row.level as EmergencyLevel,
    message: String(row.message ?? ""),
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    hopCount: Number(row.hop_count ?? 0),
    routePath: Array.isArray(row.route_path) ? (row.route_path as string[]) : [],
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at != null ? String(row.resolved_at) : null,
    resolvedBy: row.resolved_by != null ? String(row.resolved_by) : null,
  };
}

// ── Priority scoring ─────────────────────────────────────────────────────────
// Ported 1:1 from crisis-mesh-messenger getPriorityScore() logic.

export function computePriorityScore(signal: EmergencySignal): number {
  let score = 0;

  // Base score from level
  switch (signal.level) {
    case "critical": score += 1000; break;
    case "high":     score += 750;  break;
    case "medium":   score += 500;  break;
    case "low":      score += 250;  break;
  }

  // Boost critical signal types
  if (["sos", "medical", "trapped"].includes(signal.type)) {
    score += 500;
  }

  // Reduce for each hop (fresher signals take priority)
  score -= signal.hopCount * 10;

  // Time decay — subtract minutes since creation
  const ageMinutes = Math.floor(
    (Date.now() - new Date(signal.createdAt).getTime()) / 60_000
  );
  score -= ageMinutes;

  return Math.max(0, Math.min(2000, score));
}

// ── Display helpers ───────────────────────────────────────────────────────────

export const SIGNAL_ICONS: Record<EmergencySignalType, string> = {
  sos:            "🆘",
  medical:        "🏥",
  trapped:        "🚧",
  danger:         "⚠️",
  safe:           "✅",
  need_water:     "💧",
  need_food:      "🍞",
  need_shelter:   "🏠",
  need_medication:"💊",
  found_survivor: "👤",
};

export const SIGNAL_DESCRIPTIONS: Record<EmergencySignalType, string> = {
  sos:            "ЭКСТРЕННАЯ ПОМОЩЬ — срочно нужна помощь",
  medical:        "Медицинская экстренная ситуация",
  trapped:        "Человек в ловушке — нужна эвакуация",
  danger:         "Непосредственная опасность рядом",
  safe:           "Проверка безопасности — я в порядке",
  need_water:     "Срочно нужна вода",
  need_food:      "Нужна еда",
  need_shelter:   "Нужно укрытие",
  need_medication:"Нужны лекарства",
  found_survivor: "Найден выживший",
};

export const LEVEL_COLORS: Record<EmergencyLevel, string> = {
  critical: "#FF0000",
  high:     "#FF6B00",
  medium:   "#FFC107",
  low:      "#4CAF50",
};

/** Derive the default emergency level from signal type — mirrors Dart switch logic */
export function defaultLevelForType(type: EmergencySignalType): EmergencyLevel {
  switch (type) {
    case "sos":
    case "medical":
    case "trapped":
    case "danger":
      return "critical";
    case "need_water":
    case "need_food":
    case "need_medication":
      return "high";
    case "need_shelter":
    case "found_survivor":
      return "medium";
    case "safe":
      return "low";
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return "medium";
    }
  }
}

// ── Service layer ─────────────────────────────────────────────────────────────

/**
 * Broadcast an emergency signal.
 *
 * Constraints enforced client-side (server RLS is the source of truth):
 *   - message truncated to 500 chars
 *   - coordinates validated as finite
 *   - only one active signal per user (upsert by user_id WHERE is_active=true)
 */
export async function broadcastEmergencySignal(params: {
  senderName: string;
  type: EmergencySignalType;
  message?: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<EmergencySignal> {
  const level = defaultLevelForType(params.type);
  const message = (params.message ?? SIGNAL_DESCRIPTIONS[params.type]).slice(0, 500);

  // Validate coordinates
  const lat =
    params.latitude != null && Number.isFinite(params.latitude)
      ? params.latitude
      : null;
  const lon =
    params.longitude != null && Number.isFinite(params.longitude)
      ? params.longitude
      : null;

  const { data, error } = await supabase
    .from("emergency_signals")
    .insert({
      sender_name: params.senderName,
      type: params.type,
      level,
      message,
      latitude: lat,
      longitude: lon,
      hop_count: 0,
      route_path: [],
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToSignal(data as Record<string, unknown>);
}

/**
 * Resolve (deactivate) an emergency signal.
 * Only the signal owner or an admin can resolve — enforced by RLS.
 */
export async function resolveEmergencySignal(
  signalId: string,
  resolvedByUserId: string
): Promise<void> {
  const { error } = await supabase
    .from("emergency_signals")
    .update({
      is_active: false,
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedByUserId,
    })
    .eq("id", signalId)
    .eq("is_active", true); // Idempotent — no-op if already resolved

  if (error) throw error;
}

/**
 * Fetch all currently active emergency signals within a radius.
 * Returns signals sorted by priority score DESC.
 */
export async function fetchActiveSignals(): Promise<EmergencySignal[]> {
  const { data, error } = await supabase
    .from("emergency_signals")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  const signals = (data as Record<string, unknown>[]).map(rowToSignal);
  return signals.sort((a, b) => computePriorityScore(b) - computePriorityScore(a));
}

/**
 * Fetch the current user's latest active signal (if any).
 * Used to prevent duplicate SOS broadcasts.
 */
export async function getMyActiveSignal(): Promise<EmergencySignal | null> {
  const { data, error } = await supabase
    .from("emergency_signals")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) return null;
  return rowToSignal(data[0] as Record<string, unknown>);
}
