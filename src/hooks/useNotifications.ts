import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { fetchUserBriefMap, resolveUserBrief, type UserBriefClient } from "@/lib/users/userBriefs";
import { logger } from "@/lib/logger";

export interface Notification {
  id: string;
  user_id: string;
  type: "like" | "comment" | "follow" | "mention" | "story_reaction" | "live" | "dm" | "system";
  title?: string;
  body: string;
  actor_id?: string;
  target_type?: "post" | "reel" | "story" | "comment" | "profile";
  target_id?: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  actor?: {
    display_name: string;
    avatar_url: string | null;
    username?: string;
  };
}

export interface NotificationSettings {
  user_id?: string;
  likes: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  story_reactions: boolean;
  live_notifications: boolean;
  dm_notifications: boolean;
  pause_all: boolean;
  pause_until?: string | null;
}

const PAGE_SIZE = 20;

type QueryResult<T> = Promise<{ data: T | null; error: unknown; count?: number | null }>;

interface NotificationRow {
  id: string;
  user_id: string;
  type: Notification["type"];
  title?: string | null;
  body?: string | null;
  content?: string | null;
  actor_id?: string | null;
  target_type?: Notification["target_type"];
  target_id?: string | null;
  data?: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationsClient {
  rpc: UserBriefClient["rpc"];
  from(table: "notifications"): {
    select: (columns: string, options?: { count?: "exact"; head?: boolean }) => {
      eq: (column: string, value: string | boolean) => {
        eq?: (column: string, value: string | boolean) => QueryResult<NotificationRow[]>;
        order?: (column: string, options: { ascending: boolean }) => {
          range: (from: number, to: number) => QueryResult<NotificationRow[]>;
        };
      };
      order: (column: string, options: { ascending: boolean }) => {
        range: (from: number, to: number) => QueryResult<NotificationRow[]>;
      };
    };
    update: (payload: { is_read: boolean }) => {
      eq: (column: string, value: string | boolean) => { eq: (column: string, value: string | boolean) => QueryResult<null> };
    };
    delete: () => {
      eq: (column: string, value: string) => { eq: (column: string, value: string) => QueryResult<null> };
    };
  };
  from(table: "notification_settings"): {
    select: (columns: "*") => {
      eq: (column: "user_id", value: string) => { maybeSingle: () => QueryResult<Partial<NotificationSettings>> };
    };
    upsert: (payload: Partial<NotificationSettings> & { user_id: string }, options: { onConflict: string }) => QueryResult<null>;
  };
  from(table: "push_tokens"): {
    upsert: (
      payload: { user_id: string; token: string; platform: "web" | "ios" | "android"; last_used_at: string },
      options: { onConflict: string }
    ) => QueryResult<null>;
  };
}

function normalizeNotificationRow(row: NotificationRow): Notification {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    title: row.title ?? undefined,
    body: row.body ?? row.content ?? "",
    actor_id: row.actor_id ?? undefined,
    target_type: row.target_type ?? undefined,
    target_id: row.target_id ?? undefined,
    data: row.data ?? undefined,
    is_read: row.is_read,
    created_at: row.created_at,
  };
}

export function useNotifications() {
  const sb = supabase;
  const db = sb as unknown as NotificationsClient;
  const briefClient = sb as unknown as UserBriefClient;
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchActors = async (items: NotificationRow[]): Promise<Notification[]> => {
    const actorIds = [...new Set(items.map((n) => n.actor_id).filter(Boolean))] as string[];
    const briefMap = await fetchUserBriefMap(actorIds, briefClient);

    return items.map((row) => {
      const n = normalizeNotificationRow(row);
      return {
        ...n,
        actor: n.actor_id ? resolveUserBrief(String(n.actor_id), briefMap) : undefined,
      };
    });
  };

  const getNotifications = useCallback(async (pageNum = 0) => {
    if (!user) return [];
    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await db
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const rows = (data ?? []) as NotificationRow[];
      const result = await fetchActors(rows);
      setHasMore(rows.length === PAGE_SIZE);
      return result;
    } catch (err) {
      logger.error("[useNotifications] Ошибка загрузки уведомлений", { error: err });
      return [];
    }
  }, [user]);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await getNotifications(0);
      setNotifications(result);
      setPage(0);
      // Fetch unread count
      const { count } = await db
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      setUnreadCount(count || 0);
    } finally {
      setLoading(false);
    }
  }, [user, getNotifications]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    const result = await getNotifications(nextPage);
    setNotifications((prev) => [...prev, ...result]);
    setPage(nextPage);
  }, [page, hasMore, loading, getNotifications]);

  const getUnreadCount = useCallback(async (): Promise<number> => {
    if (!user) return 0;
    const { count } = await db
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    return count || 0;
  }, [user]);

  const markAsRead = useCallback(async (id: string) => {
    if (!user) return;
    await db
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", user.id);

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    await db
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [user]);

  const deleteNotification = useCallback(async (id: string) => {
    if (!user) return;
    const item = notifications.find((n) => n.id === id);
    await db
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (item && !item.is_read) setUnreadCount((prev) => Math.max(0, prev - 1));
  }, [user, notifications]);

  const getNotificationSettings = useCallback(async (): Promise<NotificationSettings> => {
    const defaults: NotificationSettings = {
      likes: true,
      comments: true,
      follows: true,
      mentions: true,
      story_reactions: true,
      live_notifications: true,
      dm_notifications: true,
      pause_all: false,
      pause_until: null,
    };
    if (!user) return defaults;
    const { data } = await db
      .from("notification_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    return data ? { ...defaults, ...data } : defaults;
  }, [user]);

  const updateNotificationSettings = useCallback(async (settings: Partial<NotificationSettings>) => {
    if (!user) return;
    await db
      .from("notification_settings")
      .upsert({ user_id: user.id, ...settings }, { onConflict: "user_id" });
  }, [user]);

  const registerPushToken = useCallback(async (token: string, platform: "web" | "ios" | "android") => {
    if (!user) return;
    await db
      .from("push_tokens")
      .upsert(
        { user_id: user.id, token, platform, last_used_at: new Date().toISOString() },
        { onConflict: "token" }
      );
  }, [user]);

  // Realtime subscription
  const subscribeToNotifications = useCallback(() => {
    if (!user) return () => {};
    const channel = sb
      .channel("notifications-v2-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload: { new: NotificationRow }) => {
          const n = payload.new;
          const result = await fetchActors([n]);
          const notif = result[0];
          setNotifications((prev) => {
            if (prev.some((x) => x.id === notif.id)) return prev;
            return [notif, ...prev];
          });
          if (!notif.is_read) setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    return subscribeToNotifications();
  }, [subscribeToNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    hasMore,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getNotifications,
    getUnreadCount,
    getNotificationSettings,
    updateNotificationSettings,
    registerPushToken,
    refetch: fetchNotifications,
  };
}
