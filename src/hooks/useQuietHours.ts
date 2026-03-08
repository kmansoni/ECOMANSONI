/**
 * useQuietHours — управление расписанием тихих часов (Notification Schedule).
 *
 * Архитектура:
 *  - Данные в таблице `public.notification_schedules` (1 строка на пользователя).
 *  - isInQuietHours вычисляется клиентски каждые 60 сек (не нагружает сервер).
 *  - Timezone: берётся из настроек браузера по умолчанию (Intl.DateTimeFormat).
 *  - Wrap-around логика: 23:00 — 07:00 корректно пересекает полночь.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuietHoursSettings {
  quiet_hours_enabled: boolean;
  quiet_start: string;      // "HH:MM" e.g. "23:00"
  quiet_end: string;        // "HH:MM" e.g. "07:00"
  quiet_days: number[];     // 0=Sun, 1=Mon ... 6=Sat
  timezone: string;         // IANA timezone, e.g. "Europe/Moscow"
  exceptions: string[];     // user_ids that bypass quiet hours
}

const TABLE = "notification_schedules" as const;

const DEFAULT_SETTINGS: QuietHoursSettings = {
  quiet_hours_enabled: false,
  quiet_start: "23:00",
  quiet_end: "07:00",
  quiet_days: [0, 1, 2, 3, 4, 5, 6],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  exceptions: [],
};

// ─── Time helpers ──────────────────────────────────────────────────────────

/** Parse "HH:MM" → { hours, minutes } */
function parseTime(hhmm: string): { hours: number; minutes: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { hours: h ?? 0, minutes: m ?? 0 };
}

/** Total minutes since midnight */
function toMinutes(hhmm: string): number {
  const { hours, minutes } = parseTime(hhmm);
  return hours * 60 + minutes;
}

/**
 * Check if `nowMinutes` falls within \[start, end) with midnight wrap-around.
 * e.g. start=23:00 (1380), end=07:00 (420): quiet if now >= 1380 OR now < 420
 */
function isInRange(nowMinutes: number, startMin: number, endMin: number): boolean {
  if (startMin < endMin) {
    return nowMinutes >= startMin && nowMinutes < endMin;
  }
  // Wrap-around
  return nowMinutes >= startMin || nowMinutes < endMin;
}

/**
 * Compute isInQuietHours purely from settings + current Date.
 * Client-side only; server-side truth is `is_in_quiet_hours(uuid)`.
 */
export function computeIsInQuietHours(settings: QuietHoursSettings, now = new Date()): boolean {
  if (!settings.quiet_hours_enabled) return false;
  if (settings.quiet_days.length === 0) return false;

  // Convert now to user's timezone
  let localNow: Date;
  try {
    // We re-serialize the date in the target timezone to get local time parts
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: settings.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    const parts = formatter.formatToParts(now);
    const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

    const DOW_MAP: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const dow = DOW_MAP[weekdayStr] ?? 0;

    if (!settings.quiet_days.includes(dow)) return false;

    const nowMin = hour * 60 + minute;
    const startMin = toMinutes(settings.quiet_start);
    const endMin = toMinutes(settings.quiet_end);
    return isInRange(nowMin, startMin, endMin);
  } catch {
    // Fallback: UTC-based computation if timezone is invalid
    const dow = now.getUTCDay();
    if (!settings.quiet_days.includes(dow)) return false;
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const startMin = toMinutes(settings.quiet_start);
    const endMin = toMinutes(settings.quiet_end);
    return isInRange(nowMin, startMin, endMin);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useQuietHours() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<QuietHoursSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isInQuietHours, setIsInQuietHours] = useState(false);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Re-evaluate client-side every minute ──────────────────────────────────

  useEffect(() => {
    const evaluate = () => setIsInQuietHours(computeIsInQuietHours(settings));
    evaluate();

    if (tickerRef.current) clearInterval(tickerRef.current);
    tickerRef.current = setInterval(evaluate, 60_000);

    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [settings]);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    if (!user?.id) {
      setSettings(DEFAULT_SETTINGS);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error: fetchErr } = await (supabase as any)
        .from(TABLE)
        .select(
          "quiet_hours_enabled, quiet_start, quiet_end, quiet_days, timezone, exceptions"
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);

      if (!data) {
        setSettings({
          ...DEFAULT_SETTINGS,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        });
      } else {
        setSettings({
          quiet_hours_enabled: data.quiet_hours_enabled ?? false,
          quiet_start: data.quiet_start ?? "23:00",
          quiet_end: data.quiet_end ?? "07:00",
          quiet_days: data.quiet_days ?? [0, 1, 2, 3, 4, 5, 6],
          timezone: data.timezone ?? "UTC",
          exceptions: data.exceptions ?? [],
        });
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  // ── Upsert helper ──────────────────────────────────────────────────────────

  const upsertSettings = useCallback(
    async (patch: Partial<QuietHoursSettings>): Promise<void> => {
      if (!user?.id) throw new Error("Not authenticated");

      const next: QuietHoursSettings = { ...settings, ...patch };
      setSettings(next);  // optimistic

      const { error: upsertErr } = await (supabase as any)
        .from(TABLE)
        .upsert(
          {
            user_id: user.id,
            quiet_hours_enabled: next.quiet_hours_enabled,
            quiet_start: next.quiet_start,
            quiet_end: next.quiet_end,
            quiet_days: next.quiet_days,
            timezone: next.timezone,
            exceptions: next.exceptions,
          },
          { onConflict: "user_id" }
        );

      if (upsertErr) {
        setSettings(settings);
        throw new Error(upsertErr.message);
      }
    },
    [user?.id, settings]
  );

  // ── Public API ─────────────────────────────────────────────────────────────

  const enable = useCallback(async () => {
    await upsertSettings({ quiet_hours_enabled: true });
  }, [upsertSettings]);

  const disable = useCallback(async () => {
    await upsertSettings({ quiet_hours_enabled: false });
  }, [upsertSettings]);

  const updateSettings = useCallback(
    async (patch: Partial<QuietHoursSettings>): Promise<void> => {
      await upsertSettings(patch);
    },
    [upsertSettings]
  );

  return {
    settings,
    isInQuietHours,
    isLoading,
    error,
    enable,
    disable,
    updateSettings,
    refetch: fetchSettings,
  } as const;
}
