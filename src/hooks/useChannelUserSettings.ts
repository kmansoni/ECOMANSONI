import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export type ChannelUserSettings = {
  channel_id: string;
  user_id: string;
  notifications_enabled: boolean;
  muted_until: string | null;
};

function isMutedNow(mutedUntil: string | null): boolean {
  if (!mutedUntil) return false;
  if (mutedUntil === "infinity") return true;
  const t = Date.parse(mutedUntil);
  if (Number.isNaN(t)) return true;
  return t > Date.now();
}

export function useChannelUserSettings(channelId: string | null) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ChannelUserSettings | null>(null);
  const [loading, setLoading] = useState(false);

  const muted = useMemo(() => isMutedNow(settings?.muted_until ?? null) || settings?.notifications_enabled === false, [settings]);

  const load = useCallback(async () => {
    if (!channelId || !user?.id) {
      setSettings(null);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("channel_user_settings")
        .select("channel_id,user_id,notifications_enabled,muted_until")
        .eq("channel_id", channelId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      setSettings((data as any) ?? null);
    } catch (e) {
      console.warn("useChannelUserSettings load failed:", e);
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [channelId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const upsert = useCallback(
    async (patch: Partial<Pick<ChannelUserSettings, "notifications_enabled" | "muted_until">>) => {
      if (!channelId || !user?.id) return;

      const payload = {
        channel_id: channelId,
        user_id: user.id,
        notifications_enabled:
          typeof patch.notifications_enabled === "boolean"
            ? patch.notifications_enabled
            : (settings?.notifications_enabled ?? true),
        muted_until:
          patch.muted_until !== undefined
            ? patch.muted_until
            : (settings?.muted_until ?? null),
      };

      const { error } = await supabase
        .from("channel_user_settings")
        .upsert(payload, { onConflict: "channel_id,user_id" });
      if (error) throw error;
      await load();
    },
    [channelId, load, settings?.muted_until, settings?.notifications_enabled, user?.id],
  );

  const setMuted = useCallback(
    async (nextMuted: boolean) => {
      // Backcompat: treat "mute" as "mute forever" and "unmute" as clear mute + enable notifications.
      if (nextMuted) {
        await upsert({ notifications_enabled: true, muted_until: "infinity" });
      } else {
        await upsert({ notifications_enabled: true, muted_until: null });
      }
    },
    [upsert],
  );

  const muteForMs = useCallback(
    async (durationMs: number) => {
      const ms = Math.max(1, Math.min(Number(durationMs) || 0, 365 * 24 * 60 * 60 * 1000));
      const untilIso = new Date(Date.now() + ms).toISOString();
      await upsert({ notifications_enabled: true, muted_until: untilIso });
    },
    [upsert],
  );

  const muteUntil = useCallback(
    async (untilIsoOrInfinity: string | null) => {
      await upsert({ notifications_enabled: true, muted_until: untilIsoOrInfinity });
    },
    [upsert],
  );

  const disableNotifications = useCallback(async () => {
    await upsert({ notifications_enabled: false, muted_until: null });
  }, [upsert]);

  const enableNotifications = useCallback(async () => {
    await upsert({ notifications_enabled: true });
  }, [upsert]);

  return {
    settings,
    loading,
    muted,
    reload: load,
    setMuted,
    muteForMs,
    muteUntil,
    disableNotifications,
    enableNotifications,
  };
}
