import React from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import {
  getOrCreateUserSettings,
  subscribeToUserSettings,
  updateUserSettings,
  type UserSettings,
} from "@/lib/user-settings";
import { cleanupInactiveSessions, computeSessionKey, heartbeatMySession, upsertMySession } from "@/lib/sessions";
import { supabase } from "@/integrations/supabase/client";

type UserSettingsContextValue = {
  settings: UserSettings | null;
  loading: boolean;
  refresh: () => Promise<void>;
  update: (patch: Partial<Omit<UserSettings, "user_id" | "created_at" | "updated_at">>) => Promise<void>;
};

const UserSettingsContext = React.createContext<UserSettingsContextValue | null>(null);

function applyRootFlags(settings: UserSettings | null) {
  const root = document.documentElement;
  if (!settings) {
    root.classList.remove("reduce-motion");
    root.classList.remove("high-contrast");
    return;
  }

  root.classList.toggle("reduce-motion", !!settings.reduce_motion);
  root.classList.toggle("high-contrast", !!settings.high_contrast);
}

export function UserSettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { setTheme } = useTheme();

  const [settings, setSettings] = React.useState<UserSettings | null>(null);
  const [loading, setLoading] = React.useState(true);

  const userId = user?.id ?? null;

  // Cancellation token for refresh: every new call increments the counter;
  // a stale in-flight call detects the mismatch and discards its result.
  const refreshTokenRef = React.useRef(0);

  // Register this device/session + keep heartbeat; also enforce auto-terminate policy.
  React.useEffect(() => {
    if (!userId) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const session = data.session;
      if (!session) return;

      await upsertMySession({ userId, session, deviceName: null });
      if (cancelled) return;

      // Cleanup inactive sessions based on current settings (or default 180 days).
      const autoDays = (settings?.sessions_auto_terminate_days ?? 180) || 180;
      await cleanupInactiveSessions({ userId, autoTerminateDays: autoDays });
      if (cancelled) return;

      const myKey = await computeSessionKey(session);
      if (cancelled || !myKey) return;

      channel = supabase
        .channel(`my-session:${userId}`)
        .on(
          "postgres_changes" as any,
          {
            event: "UPDATE",
            schema: "public",
            table: "user_sessions",
            filter: `user_id=eq.${userId}`,
          },
          async (payload: any) => {
            if (cancelled) return;
            const next = payload.new as any;
            if (next?.session_key === myKey && next?.revoked_at) {
              // This device was revoked -> sign out.
              await supabase.auth.signOut();
            }
          },
        )
        .subscribe();

      interval = setInterval(async () => {
        if (cancelled) return;
        try {
          const { data: s } = await supabase.auth.getSession();
          if (!s.session) return;
          await heartbeatMySession({ userId, session: s.session });
        } catch {
          // ignore
        }
      }, 60_000);
    };

    void run();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [settings?.sessions_auto_terminate_days, userId]);

  const refresh = React.useCallback(async () => {
    if (!userId) {
      setSettings(null);
      setLoading(false);
      applyRootFlags(null);
      return;
    }

    // Stamp this call; if a newer call supersedes us we discard our result.
    const token = ++refreshTokenRef.current;
    setLoading(true);
    try {
      const next = await getOrCreateUserSettings(userId);
      if (token !== refreshTokenRef.current) return; // stale — newer call already resolved
      setSettings(next);
      applyRootFlags(next);
      setTheme(next.theme);
    } finally {
      if (token === refreshTokenRef.current) setLoading(false);
    }
  }, [setTheme, userId]);

  const update = React.useCallback(
    async (patch: Partial<Omit<UserSettings, "user_id" | "created_at" | "updated_at">>) => {
      if (!userId) return;
      const next = await updateUserSettings(userId, patch);
      setSettings(next);
      applyRootFlags(next);
      if (patch.theme) {
        setTheme(next.theme);
      }
    },
    [setTheme, userId],
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!userId) return;

    const unsubscribe = subscribeToUserSettings(userId, (next) => {
      setSettings(next);
      applyRootFlags(next);
      setTheme(next.theme);
    });

    return unsubscribe;
  }, [setTheme, userId]);

  const value = React.useMemo<UserSettingsContextValue>(
    () => ({
      settings,
      loading,
      refresh,
      update,
    }),
    [loading, refresh, settings, update],
  );

  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUserSettings() {
  const ctx = React.useContext(UserSettingsContext);
  if (!ctx) {
    throw new Error("useUserSettings must be used within UserSettingsProvider");
  }
  return ctx;
}
