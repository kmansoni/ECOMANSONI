import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";

export interface PostReminderItem {
  post_id: string;
  remind_at: string;
  created_at: string;
  notified: boolean;
  post?: {
    id: string;
    content: string | null;
    media?: { media_url: string; media_type: string }[];
    author?: {
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    };
  };
}

interface UsePostRemindersReturn {
  reminders: PostReminderItem[];
  loading: boolean;
  error: string | null;
  deleteReminder: (postId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function usePostReminders(): UsePostRemindersReturn {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<PostReminderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReminders = useCallback(async () => {
    if (!user) {
      setReminders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("post_reminders")
        .select(`
          post_id,
          remind_at,
          created_at,
          notified,
          posts!inner (
            id,
            content,
            post_media (media_url, media_type),
            profiles!inner (
              username,
              display_name,
              avatar_url
            )
          )
        `)
        .eq("user_id", user.id)
        .order("remind_at", { ascending: true });

      if (fetchError) throw fetchError;

      const items: PostReminderItem[] = (data ?? []).map((row: Record<string, unknown>) => {
        const post = row.posts as Record<string, unknown> | null;
        const profile = post?.profiles as Record<string, unknown> | null;
        const media = post?.post_media as { media_url: string; media_type: string }[] | null;

        return {
          post_id: row.post_id as string,
          remind_at: row.remind_at as string,
          created_at: row.created_at as string,
          notified: row.notified as boolean,
          post: post ? {
            id: post.id as string,
            content: post.content as string | null,
            media: media ?? undefined,
            author: profile ? {
              username: profile.username as string | null,
              display_name: profile.display_name as string | null,
              avatar_url: profile.avatar_url as string | null,
            } : undefined,
          } : undefined,
        };
      });

      setReminders(items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка загрузки";
      setError(msg);
      logger.error("[usePostReminders] fetch error", { error: err });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchReminders();
  }, [fetchReminders]);

  const deleteReminder = useCallback(async (postId: string) => {
    if (!user) return;

    try {
      const { error: deleteError } = await supabase
        .from("post_reminders")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      setReminders((prev) => prev.filter((r) => r.post_id !== postId));
    } catch (err) {
      logger.error("[usePostReminders] delete error", { postId, error: err });
      throw err;
    }
  }, [user]);

  return {
    reminders,
    loading,
    error,
    deleteReminder,
    refresh: fetchReminders,
  };
}
