import React from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import {
  getOrCreateUserSettings,
  subscribeToUserSettings,
  updateUserSettings,
  type UserSettings,
  type ThemePreference,
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

function mapThemePreference(pref: ThemePreference): "light" | "dark" | "system" {
  return pref;
}

export function UserSettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { setTheme } = useTheme();

  const [settings, setSettings] = React.useState<UserSettings | null>(null);
  const [loading, setLoading] = React.useState(true);

  const userId = user?.id ?? null;

  // Register this device/session + keep heartbeat; also enforce auto-terminate policy.
  React.useEffect(() => {
    if (!userId) return;

    let interval: any = null;
    let channel: any = null;
    let cancelled = false;

    const run = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) return;

      await upsertMySession({ userId, session, deviceName: null });

      // Cleanup inactive sessions based on current settings (or default 180 days).
      const autoDays = (settings?.sessions_auto_terminate_days ?? 180) || 180;
      await cleanupInactiveSessions({ userId, autoTerminateDays: autoDays });

      const myKey = await computeSessionKey(session);
      if (!myKey) return;

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

    setLoading(true);
    try {
      const next = await getOrCreateUserSettings(userId);
      setSettings(next);
      applyRootFlags(next);
      setTheme(mapThemePreference(next.theme));
    } finally {
      setLoading(false);
    }
  }, [setTheme, userId]);

  const update = React.useCallback(
    async (patch: Partial<Omit<UserSettings, "user_id" | "created_at" | "updated_at">>) => {
      if (!userId) return;
      const next = await updateUserSettings(userId, patch);
      setSettings(next);
      applyRootFlags(next);
      if (patch.theme) {
        setTheme(mapThemePreference(next.theme));
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
      setTheme(mapThemePreference(next.theme));
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

export function useUserSettings() {
  const ctx = React.useContext(UserSettingsContext);
  if (!ctx) {
    throw new Error("useUserSettings must be used within UserSettingsProvider");
  }
  return ctx;
}
