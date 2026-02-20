import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatLastSeen, isOnline as isOnlineFromLastSeen } from "@/hooks/usePresence";
import { getErrorMessage } from "@/lib/utils";

export function useUserPresenceStatus(userId?: string | null) {
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [statusEmoji, setStatusEmoji] = useState<string | null>(null);
  const [statusStickerUrl, setStatusStickerUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    let active = true;
    let interval: number | undefined;

    const fetchLastSeen = async () => {
      const res = await supabase
        .from("profiles")
        .select("last_seen_at, status_emoji, status_sticker_url")
        .eq("user_id", userId)
        .maybeSingle();

      if (!active) return;

      if (res.error) {
        const msg = getErrorMessage(res.error).toLowerCase();
        const looksLikeMissingColumn =
          msg.includes("status_emoji") ||
          msg.includes("status_sticker_url") ||
          msg.includes("does not exist") ||
          msg.includes("column");

        if (looksLikeMissingColumn) {
          const res2 = await supabase
            .from("profiles")
            .select("last_seen_at")
            .eq("user_id", userId)
            .maybeSingle();
          if (!active) return;
          if (res2.error) return;
          setLastSeenAt((res2.data as any)?.last_seen_at ?? null);
          setStatusEmoji(null);
          setStatusStickerUrl(null);
        }

        return;
      }

      setLastSeenAt((res.data as any)?.last_seen_at ?? null);
      setStatusEmoji((res.data as any)?.status_emoji ?? null);
      setStatusStickerUrl((res.data as any)?.status_sticker_url ?? null);
    };

    void fetchLastSeen();
    interval = window.setInterval(fetchLastSeen, 30000);

    const channel = supabase
      .channel(`presence:profile:${userId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const nextLastSeen = payload?.new?.last_seen_at ?? null;
          const nextEmoji = payload?.new?.status_emoji ?? null;
          const nextSticker = payload?.new?.status_sticker_url ?? null;
          setLastSeenAt(nextLastSeen);
          setStatusEmoji(nextEmoji);
          setStatusStickerUrl(nextSticker);
        },
      )
      .subscribe();

    return () => {
      active = false;
      if (interval) window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const isOnline = useMemo(() => isOnlineFromLastSeen(lastSeenAt), [lastSeenAt]);

  const statusText = useMemo(() => {
    if (isOnline) return "в сети";
    if (!lastSeenAt) return "был(а) недавно";
    return formatLastSeen(lastSeenAt);
  }, [isOnline, lastSeenAt]);

  return { lastSeenAt, isOnline, statusText, statusEmoji, statusStickerUrl };
}
