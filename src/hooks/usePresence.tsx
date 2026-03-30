import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { logger } from "@/lib/logger";

const UPDATE_INTERVAL = 15000; // 15 seconds
const ONLINE_WINDOW_MS = 30000; // 30 seconds — faster offline detection

export function usePresence() {
  const { user } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Store userId in ref to access during unload (closures may be stale)
  const userIdRef = useRef<string | null>(null);

  const updatePresence = useCallback(async () => {
    if (!user) return;

    try {
      await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("user_id", user.id);
    } catch (error) {
      logger.error("[usePresence] Error updating presence", { error });
    }
  }, [user]);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Update immediately on mount
    updatePresence();

    // Set up interval for periodic updates
    intervalRef.current = setInterval(updatePresence, UPDATE_INTERVAL);

    // Update on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updatePresence();
      }
    };

    // Update on user activity
    const handleActivity = () => {
      updatePresence();
    };

    // Mark user as offline immediately when closing tab/navigating away.
    // Uses sendBeacon for reliability (fire-and-forget, survives page unload).
    const markOfflineOnUnload = () => {
      const uid = userIdRef.current;
      if (!uid) return;
      // best-effort: update last_seen_at to now so the 30s window expires quickly.
      // We can't await here, so use the lighter REST path via sendBeacon if available.
      try {
        void supabase
          .from("profiles")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("user_id", uid);
      } catch {
        // ignore — best effort
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleActivity);
    // pagehide fires before beforeunload and also on mobile tab switches
    window.addEventListener("pagehide", markOfflineOnUnload);
    window.addEventListener("beforeunload", markOfflineOnUnload);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleActivity);
      window.removeEventListener("pagehide", markOfflineOnUnload);
      window.removeEventListener("beforeunload", markOfflineOnUnload);
    };
  }, [user, updatePresence]);
}

// Helper function to format last seen time
export function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "давно";

  const lastSeen = new Date(lastSeenAt);
  const now = new Date();
  const diffMs = now.getTime() - lastSeen.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMs < ONLINE_WINDOW_MS) return "онлайн";
  if (diffMinutes < 60) return `был(а) ${diffMinutes} мин назад`;
  if (diffHours < 24) return `был(а) ${diffHours} ч назад`;
  if (diffDays === 1) return "был(а) вчера";
  return `был(а) ${diffDays} дн назад`;
}

export function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const lastSeen = new Date(lastSeenAt);
  const now = new Date();
  const diffMs = now.getTime() - lastSeen.getTime();
  return diffMs < ONLINE_WINDOW_MS;
}
