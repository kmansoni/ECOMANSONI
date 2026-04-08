/**
 * Типобезопасные утилиты для декодирования Supabase Realtime и RPC ответов.
 * Общие для useChat, useChannels, useGroupChats — исключает дублирование.
 */

type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export function parseJsonRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getStringField(source: UnknownRecord, key: string): string | null {
  const value = source[key];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getNullableStringField(source: UnknownRecord, key: string): string | null | undefined {
  const value = source[key];
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value;
}

export function getNumberField(source: UnknownRecord, key: string): number | null {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getBooleanField(source: UnknownRecord, key: string): boolean | null {
  const value = source[key];
  return typeof value === "boolean" ? value : null;
}

export function getRecordField(source: UnknownRecord, key: string): UnknownRecord | null {
  const value = source[key];
  return isRecord(value) ? value : null;
}

export function getArrayField(source: UnknownRecord, key: string): unknown[] {
  const value = source[key];
  return Array.isArray(value) ? value : [];
}

export function toRecordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function decodeRealtimeRow(payload: unknown): UnknownRecord | null {
  if (!isRecord(payload)) return null;
  const candidate = payload.new ?? payload.old;
  return isRecord(candidate) ? candidate : null;
}

/**
 * Безопасно извлекает числовой счётчик из nullable/unknown значения.
 * Гарантирует ≥ 0. NaN/null/undefined → 0.
 */
export function clampCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
