/**
 * useEmergencySignals — React hook for Emergency SOS signals.
 *
 * Provides:
 *   - Real-time list of active emergency signals (sorted by priority score)
 *   - Current user's own active signal (if any)
 *   - broadcast() / resolve() actions
 *   - Loading state and error handling
 *
 * Architecture:
 *   - Initial fetch on mount via fetchActiveSignals()
 *   - Supabase Realtime subscription for INSERT / UPDATE events
 *     on the emergency_signals table (filtered to is_active changes)
 *   - On reconnect the hook re-fetches to close any gaps
 *
 * Security:
 *   - No user coordinates are stored in state before user explicitly
 *     grants location (handled at call site — coordinates are optional)
 *   - Resolve action requires signalId + resolvedByUserId — RLS enforces ownership
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  type EmergencySignal,
  type EmergencySignalType,
  broadcastEmergencySignal,
  computePriorityScore,
  fetchActiveSignals,
  getMyActiveSignal,
  resolveEmergencySignal,
} from "@/lib/chat/emergencySignal";

interface UseEmergencySignalsReturn {
  signals: EmergencySignal[];
  mySignal: EmergencySignal | null;
  loading: boolean;
  error: string | null;
  broadcast: (params: {
    senderName: string;
    type: EmergencySignalType;
    message?: string;
    latitude?: number | null;
    longitude?: number | null;
  }) => Promise<void>;
  resolve: (signalId: string, resolvedByUserId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useEmergencySignals(): UseEmergencySignalsReturn {
  const [signals, setSignals] = useState<EmergencySignal[]>([]);
  const [mySignal, setMySignal] = useState<EmergencySignal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const [all, mine] = await Promise.all([
        fetchActiveSignals(),
        getMyActiveSignal(),
      ]);
      if (!mountedRef.current) return;
      setSignals(all);
      setMySignal(mine);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load emergency signals");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("emergency_signals_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "emergency_signals" },
        () => {
          // On any change, re-fetch to get fresh priority-sorted list.
          // We avoid applying partial patches to avoid state inconsistency.
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  // Refetch on reconnect to close gaps during offline periods
  useEffect(() => {
    const handleOnline = () => { void refresh(); };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [refresh]);

  const broadcast = useCallback(
    async (params: {
      senderName: string;
      type: EmergencySignalType;
      message?: string;
      latitude?: number | null;
      longitude?: number | null;
    }) => {
      setError(null);
      try {
        const signal = await broadcastEmergencySignal(params);
        if (!mountedRef.current) return;
        // Optimistic update — don't wait for realtime event
        setSignals((prev) => {
          const filtered = prev.filter((s) => s.id !== signal.id);
          return [signal, ...filtered].sort(
            (a, b) => computePriorityScore(b) - computePriorityScore(a)
          );
        });
        setMySignal(signal);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to broadcast emergency signal");
        throw err;
      }
    },
    []
  );

  const resolve = useCallback(
    async (signalId: string, resolvedByUserId: string) => {
      setError(null);
      try {
        await resolveEmergencySignal(signalId, resolvedByUserId);
        if (!mountedRef.current) return;
        // Optimistic update
        setSignals((prev) => prev.filter((s) => s.id !== signalId));
        setMySignal((prev) => (prev?.id === signalId ? null : prev));
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to resolve signal");
        throw err;
      }
    },
    []
  );

  return { signals, mySignal, loading, error, broadcast, resolve, refresh };
}
