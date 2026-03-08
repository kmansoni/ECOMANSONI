/**
 * useDndStatus — глобальный статус "Не беспокоить" (DND) для пользователя.
 *
 * Архитектура:
 *  - Данные хранятся в таблице `public.user_dnd_settings` (1 строка на пользователя).
 *  - RLS: только владелец читает/пишет своими записями.
 *  - Taймер обновления `timeRemaining` тикает каждые 30 сек.
 *  - При включении DND с временным интервалом: dnd_until устанавливается в UTC.
 *  - При отключении: dnd_enabled=false, dnd_until=null.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DndSettings {
  dnd_enabled: boolean;
  dnd_until: string | null;       // ISO 8601 UTC timestamptz | null = indefinite
  dnd_exceptions: string[];       // user_ids that bypass DND
  dnd_allow_calls: boolean;
  dnd_auto_reply: string | null;
}

export interface EnableDndOptions {
  until?: Date;                   // undefined = indefinite
  exceptions?: string[];
  allowCalls?: boolean;
  autoReply?: string;
}

const TABLE = "user_dnd_settings" as const;

const DEFAULT_SETTINGS: DndSettings = {
  dnd_enabled: false,
  dnd_until: null,
  dnd_exceptions: [],
  dnd_allow_calls: false,
  dnd_auto_reply: null,
};

// ─── Format remaining time ─────────────────────────────────────────────────

function formatTimeRemaining(until: Date): string {
  const diffMs = until.getTime() - Date.now();
  if (diffMs <= 0) return "";

  const totalMinutes = Math.ceil(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}мин`;
  if (minutes === 0) return `${hours}ч`;
  return `${hours}ч ${minutes}мин`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDndStatus() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<DndSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Derived state ──────────────────────────────────────────────────────────

  const dndUntil: Date | null = settings.dnd_until ? new Date(settings.dnd_until) : null;

  const isInDnd: boolean = (() => {
    if (!settings.dnd_enabled) return false;
    if (!dndUntil) return true;             // indefinite
    return dndUntil > new Date();           // timed: check expiry client-side
  })();

  // ── Ticker ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (tickerRef.current) clearInterval(tickerRef.current);

    if (dndUntil && settings.dnd_enabled) {
      const tick = () => {
        if (dndUntil <= new Date()) {
          // DND expired: optimistically update local state
          setSettings((prev) => ({ ...prev, dnd_enabled: false, dnd_until: null }));
          setTimeRemaining("");
          if (tickerRef.current) clearInterval(tickerRef.current);
          return;
        }
        setTimeRemaining(formatTimeRemaining(dndUntil));
      };
      tick();
      tickerRef.current = setInterval(tick, 30_000);
    } else {
      setTimeRemaining(dndUntil ? "" : settings.dnd_enabled ? "∞" : "");
    }

    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [settings.dnd_enabled, settings.dnd_until]); // eslint-disable-line react-hooks/exhaustive-deps

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
        .select("dnd_enabled, dnd_until, dnd_exceptions, dnd_allow_calls, dnd_auto_reply")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);

      if (!data) {
        setSettings(DEFAULT_SETTINGS);
      } else {
        setSettings({
          dnd_enabled: data.dnd_enabled ?? false,
          dnd_until: data.dnd_until ?? null,
          dnd_exceptions: data.dnd_exceptions ?? [],
          dnd_allow_calls: data.dnd_allow_calls ?? false,
          dnd_auto_reply: data.dnd_auto_reply ?? null,
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
    async (patch: Partial<DndSettings>): Promise<void> => {
      if (!user?.id) throw new Error("Not authenticated");

      const next: DndSettings = { ...settings, ...patch };
      setSettings(next);  // optimistic update

      const { error: upsertErr } = await (supabase as any)
        .from(TABLE)
        .upsert(
          {
            user_id: user.id,
            dnd_enabled: next.dnd_enabled,
            dnd_until: next.dnd_until,
            dnd_exceptions: next.dnd_exceptions,
            dnd_allow_calls: next.dnd_allow_calls,
            dnd_auto_reply: next.dnd_auto_reply ?? null,
          },
          { onConflict: "user_id" }
        );

      if (upsertErr) {
        // Rollback optimistic update on failure
        setSettings(settings);
        throw new Error(upsertErr.message);
      }
    },
    [user?.id, settings]
  );

  // ── Public API ─────────────────────────────────────────────────────────────

  const enable = useCallback(
    async (options: EnableDndOptions = {}): Promise<void> => {
      await upsertSettings({
        dnd_enabled: true,
        dnd_until: options.until ? options.until.toISOString() : null,
        dnd_exceptions: options.exceptions ?? settings.dnd_exceptions,
        dnd_allow_calls: options.allowCalls ?? settings.dnd_allow_calls,
        dnd_auto_reply: options.autoReply ?? settings.dnd_auto_reply,
      });
    },
    [upsertSettings, settings]
  );

  const disable = useCallback(async (): Promise<void> => {
    await upsertSettings({
      dnd_enabled: false,
      dnd_until: null,
    });
  }, [upsertSettings]);

  const updateSettings = useCallback(
    async (patch: Partial<DndSettings>): Promise<void> => {
      await upsertSettings(patch);
    },
    [upsertSettings]
  );

  return {
    settings,
    isInDnd,
    dndUntil,
    timeRemaining,
    isLoading,
    error,
    enable,
    disable,
    updateSettings,
    refetch: fetchSettings,
  } as const;
}
