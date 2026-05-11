import { useEffect, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUnifiedCounterStore } from "@/stores/useUnifiedCounterStore";
import { logger } from "@/lib/logger";
import { dbLoose } from "@/lib/supabase";

const RESYNC_INTERVAL_MS = 45_000;
const VISIBILITY_RESYNC_THRESHOLD_MS = 15_000;

/* ────────────────────────────────────────────────────────────
 * DB fetch helpers (pure async, no React hooks)
 * ──────────────────────────────────────────────────────────── */

async function fetchNotificationsUnread(userId: string): Promise<number> {
  const { count, error } = await dbLoose
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
  const rpc = supabase as unknown as { rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: unknown }> };
  const { data, error } = await rpc.rpc<unknown[]>("chat_get_inbox_v11", { p_limit: 500, p_cursor: null });
  if (error) {
    logger.error("[UnifiedCounter] chats v1.1 inbox rpc error", { error });
    return 0;
  }
  const rows = Array.isArray(data) ? data : [];
  let total = 0;
  for (const row of rows) {
    if (row && typeof row === "object" && "unread_count" in row) {
      total += Number((row as { unread_count: number | null }).unread_count) || 0;
    }
  }
  return total;
}

/* ────────────────────────────────────────────────────────────
 * Provider component
 * ──────────────────────────────────────────────────────────── */

export function UnifiedCounterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const store = useUnifiedCounterStore;
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

     /* ── Initial fetch ──────────────────────────────────────── */
     const resyncAll = async () => {
       if (!isMountedRef.current) return;
       const state = store.getState();
       const now = Date.now();

       // Notifications
       if (now - state.lastSyncAt.notifications > 10_000) {
         const fetchStarted = Date.now();
         const nCount = await fetchNotificationsUnread(userId);
         if (isMountedRef.current) {
           store.getState().setNotificationsUnread(nCount, fetchStarted);
         }
       }

       // Chats — v11 path only
       if (now - state.lastSyncAt.chats > 10_000) {
         const fetchStarted = Date.now();
         const cCount = await fetchChatsUnreadV11(userId);
         if (isMountedRef.current) {
           store.getState().setChatsUnread(cCount, fetchStarted);
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
     let chatDebounceTimer: ReturnType<typeof setTimeout> | null = null;
     let chatLastRpcFetchAt = 0;
     const CHAT_RPC_THROTTLE_MS = 2_000;

     const debouncedChatsResync = () => {
       if (chatDebounceTimer) clearTimeout(chatDebounceTimer);
       chatDebounceTimer = setTimeout(() => {
         const fetchStarted = Date.now();
         // Throttle actual RPC call to avoid hammering DB on rapid message bursts
         if (fetchStarted - chatLastRpcFetchAt < CHAT_RPC_THROTTLE_MS) {
           return;
         }
         chatLastRpcFetchAt = fetchStarted;
         void fetchChatsUnreadV11(userId).then((count) => {
           if (isMountedRef.current) {
             store.getState().setChatsUnread(count, fetchStarted);
           }
         });
       }, 200);
     };

	    // Subscribe to chat_inbox_projection UPDATE events (B-138 compliant)
	    // This triggers on unread_count changes, which is more efficient than
	    // subscribing to every message INSERT
	    const chatsChannel = supabase
	      .channel("unified-chats-rt")
	      .on(
	        "postgres_changes",
	        {
	          event: "UPDATE",
	          schema: "public",
	          table: "chat_inbox_projection",
	          filter: `user_id=eq.${userId}`,
	        },
	        () => {
	          debouncedChatsResync();
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
      if (chatDebounceTimer) clearTimeout(chatDebounceTimer);
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(chatsChannel);
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user]);

  return <>{children}</>;
}
