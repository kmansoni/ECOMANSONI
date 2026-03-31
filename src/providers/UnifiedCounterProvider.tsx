import { useEffect, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUnifiedCounterStore } from "@/stores/useUnifiedCounterStore";
import { isChatProtocolV11EnabledForUser } from "@/lib/chat/protocolV11";
import { logger } from "@/lib/logger";

const RESYNC_INTERVAL_MS = 45_000;
const VISIBILITY_RESYNC_THRESHOLD_MS = 15_000;

/* ────────────────────────────────────────────────────────────
 * DB fetch helpers (pure async, no React hooks)
 * ──────────────────────────────────────────────────────────── */

async function fetchNotificationsUnread(userId: string): Promise<number> {
  const { count, error } = await (supabase as any)
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) {
    logger.error("[UnifiedCounter] notifications count fetch error", { error });
    return 0;
  }
  return count ?? 0;
}

async function fetchChatsUnreadV11(userId: string): Promise<number> {
  const { data, error } = await (supabase as any)
    .from("chat_inbox_projection")
    .select("dialog_id, unread_count")
    .eq("user_id", userId);
  if (error) {
    logger.error("[UnifiedCounter] chats v1.1 count fetch error", { error });
    return 0;
  }
  const rows = (Array.isArray(data) ? data : []) as Array<{ dialog_id: string; unread_count: number | null }>;
  return rows.reduce((sum, r) => sum + Number(r.unread_count || 0), 0);
}

async function fetchChatsUnreadLegacy(userId: string): Promise<{ total: number; conversationIds: Set<string> }> {
  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at")
    .eq("user_id", userId);

  if (!participants || participants.length === 0) {
    return { total: 0, conversationIds: new Set() };
  }

  const conversationIds = new Set(participants.map((p) => p.conversation_id));
  let total = 0;

  for (const participant of participants) {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", participant.conversation_id)
      .neq("sender_id", userId)
      .gt("created_at", participant.last_read_at || "1970-01-01");
    total += count || 0;
  }

  return { total, conversationIds };
}

/* ────────────────────────────────────────────────────────────
 * Provider component
 * ──────────────────────────────────────────────────────────── */

export function UnifiedCounterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const store = useUnifiedCounterStore;
  const participantIdsRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!user) {
      store.getState().reset();
      return;
    }

    const userId = user.id;
    const isV11 = isChatProtocolV11EnabledForUser(userId);

    /* ── Initial fetch ──────────────────────────────────────── */
    const resyncAll = async () => {
      if (!isMountedRef.current) return;
      const state = store.getState();

      // Notifications
      if (Date.now() - state.lastSyncAt.notifications > 10_000) {
        const nCount = await fetchNotificationsUnread(userId);
        if (isMountedRef.current) {
          store.getState().setNotificationsUnread(nCount);
        }
      }

      // Chats
      if (Date.now() - state.lastSyncAt.chats > 10_000) {
        if (isV11) {
          const cCount = await fetchChatsUnreadV11(userId);
          if (isMountedRef.current) {
            store.getState().setChatsUnread(cCount);
          }
        } else {
          const { total, conversationIds } = await fetchChatsUnreadLegacy(userId);
          participantIdsRef.current = conversationIds;
          if (isMountedRef.current) {
            store.getState().setChatsUnread(total);
          }
        }
      }
    };

    void resyncAll();

    /* ── Realtime: Notifications ────────────────────────────── */
    const notifChannel = supabase
      .channel("unified-notif-rt")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload: { new: { is_read?: boolean } }) => {
          if (!payload.new.is_read) {
            store.getState().incrementNotifications(1);
          }
        },
      )
      .subscribe();

    /* ── Realtime: Chats ────────────────────────────────────── */
    const chatsChannel = isV11
      ? supabase
          .channel("unified-chats-rt")
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "chat_inbox_projection",
              filter: `user_id=eq.${userId}`,
            },
            () => {
              // Full refetch on any projection change (same as current v1.1 behavior)
              void fetchChatsUnreadV11(userId).then((count) => {
                if (isMountedRef.current) {
                  store.getState().setChatsUnread(count);
                }
              });
            },
          )
          .subscribe()
      : supabase
          .channel("unified-chats-rt")
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
            },
            (payload: { new: { conversation_id?: string; sender_id?: string } }) => {
              const msg = payload.new;
              if (!msg?.conversation_id) return;
              if (!participantIdsRef.current.has(msg.conversation_id)) return;
              if (msg.sender_id !== userId) {
                store.getState().incrementChats(1);
              }
            },
          )
          .subscribe();

    /* ── Periodic resync ────────────────────────────────────── */
    const intervalId = setInterval(resyncAll, RESYNC_INTERVAL_MS);

    /* ── Visibility resync ──────────────────────────────────── */
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const state = store.getState();
      const now = Date.now();
      if (
        now - state.lastSyncAt.notifications > VISIBILITY_RESYNC_THRESHOLD_MS ||
        now - state.lastSyncAt.chats > VISIBILITY_RESYNC_THRESHOLD_MS
      ) {
        void resyncAll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    /* ── Cleanup ────────────────────────────────────────────── */
    return () => {
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(chatsChannel);
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user]);

  return <>{children}</>;
}
