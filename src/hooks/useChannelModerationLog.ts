import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as SupabaseClient<any>;

type ModerationAction =
  | "member_kicked"
  | "member_banned"
  | "member_unbanned"
  | "role_changed"
  | "message_deleted"
  | "message_pinned"
  | "message_unpinned"
  | "channel_updated"
  | "invite_created";

export interface ModerationLogEntry {
  id: string;
  channel_id: string;
  actor_id: string;
  action: ModerationAction;
  target_user_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  // joined
  actor_name?: string;
  target_name?: string;
}

const PAGE_SIZE = 30;

export function useChannelModerationLog(channelId: string | undefined) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<ModerationLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async (offset = 0) => {
    if (!channelId) return;
    setLoading(true);
    try {
      const { data, error } = await db
        .from("channel_moderation_log")
        .select("*")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;

      const rows = (data ?? []) as ModerationLogEntry[];
      setHasMore(rows.length === PAGE_SIZE);

      if (offset === 0) {
        setEntries(rows);
      } else {
        setEntries(prev => [...prev, ...rows]);
      }
    } catch (e) {
      logger.error("channel-mod-log: load failed", { channelId, error: e });
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  const logAction = useCallback(async (
    action: ModerationAction,
    targetUserId?: string,
    details?: Record<string, unknown>,
  ) => {
    if (!channelId || !user?.id) return;
    try {
      await db.from("channel_moderation_log").insert({
        channel_id: channelId,
        actor_id: user.id,
        action,
        target_user_id: targetUserId ?? null,
        details: details ?? {},
      });
    } catch (e) {
      logger.warn("channel-mod-log: insert failed", { channelId, action, error: e });
    }
  }, [channelId, user?.id]);

  return { entries, loading, hasMore, load, logAction };
}
