import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { fetchUserBriefMap, resolveUserBrief } from "@/lib/users/userBriefs";

export interface Notification {
  id: string;
  user_id: string;
  type: "like" | "comment" | "follow" | "mention" | "story_reaction" | "live" | "dm" | "system";
  title?: string;
  body: string;
  actor_id?: string;
  target_type?: "post" | "reel" | "story" | "comment" | "profile";
  target_id?: string;
  data?: Record<string, any>;
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

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchActors = async (items: any[]): Promise<Notification[]> => {
    const actorIds = [...new Set(items.map((n: any) => n.actor_id).filter(Boolean))] as string[];
    const briefMap = await fetchUserBriefMap(actorIds, supabase as any);

    return items.map((n: any) => ({
      ...n,
      actor: n.actor_id ? resolveUserBrief(String(n.actor_id), briefMap) : undefined,
    }));
  };

  const getNotifications = useCallback(async (pageNum = 0) => {
    if (!user) return [];
    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await (supabase as any)
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const result = await fetchActors(data || []);
      setHasMore((data || []).length === PAGE_SIZE);
      return result;
    } catch (err) {
      console.error("Ошибка загрузки уведомлений:", err);
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
      const { count } = await (supabase as any)
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
    const { count } = await (supabase as any)
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    return count || 0;
  }, [user]);

  const markAsRead = useCallback(async (id: string) => {
    if (!user) return;
    await (supabase as any)
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
    await (supabase as any)
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
    await (supabase as any)
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
    const { data } = await (supabase as any)
      .from("notification_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    return data ? { ...defaults, ...data } : defaults;
  }, [user]);

  const updateNotificationSettings = useCallback(async (settings: Partial<NotificationSettings>) => {
    if (!user) return;
    await (supabase as any)
      .from("notification_settings")
      .upsert({ user_id: user.id, ...settings }, { onConflict: "user_id" });
  }, [user]);

  const registerPushToken = useCallback(async (token: string, platform: "web" | "ios" | "android") => {
    if (!user) return;
    await (supabase as any)
      .from("push_tokens")
      .upsert(
        { user_id: user.id, token, platform, last_used_at: new Date().toISOString() },
        { onConflict: "token" }
      );
  }, [user]);

  // Realtime subscription
  const subscribeToNotifications = useCallback(() => {
    if (!user) return () => {};
    const channel = (supabase as any)
      .channel("notifications-v2-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload: any) => {
          const n = payload.new as any;
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
