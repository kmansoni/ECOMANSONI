import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const UPDATE_INTERVAL = 15000; // 15 seconds
const ONLINE_WINDOW_MS = 45000; // 45 seconds

export function usePresence() {
  const { user } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const updatePresence = useCallback(async () => {
    if (!user) return;

    try {
      await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("user_id", user.id);
    } catch (error) {
      console.error("Error updating presence:", error);
    }
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

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleActivity);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleActivity);
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
