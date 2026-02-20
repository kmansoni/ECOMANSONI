import { useCallback, useEffect, useMemo, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type NotificationCategory = "dm" | "group" | "channel" | "stories" | "reactions";

export type NotificationCategorySetting = {
  id: string;
  user_id: string;
  category: NotificationCategory;
  is_enabled: boolean;
  sound_id: string | null;
  vibrate: boolean | null;
  show_text: boolean | null;
  show_sender: boolean | null;
  created_at: string;
  updated_at: string;
};

export type NotificationException = {
  id: string;
  user_id: string;
  item_kind: "dm" | "group" | "channel";
  item_id: string;
  is_muted: boolean;
  sound_id: string | null;
  vibrate: boolean | null;
  show_text: boolean | null;
  show_sender: boolean | null;
  created_at: string;
  updated_at: string;
};

const CATEGORY_KEYS: NotificationCategory[] = ["dm", "group", "channel", "stories", "reactions"];
const supabaseAny = supabase as any;

export function useNotificationPreferences() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<NotificationCategorySetting[]>([]);
  const [exceptions, setExceptions] = useState<NotificationException[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user?.id) {
      setCategories([]);
      setExceptions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: catData, error: catError } = await supabaseAny
        .from("notification_category_settings")
        .select("id, user_id, category, is_enabled, sound_id, vibrate, show_text, show_sender, created_at, updated_at")
        .eq("user_id", user.id)
        .order("category", { ascending: true });
      if (catError) throw catError;

      const existing = (catData ?? []) as NotificationCategorySetting[];
      const existingKeys = new Set(existing.map((row) => row.category));
      const missing = CATEGORY_KEYS.filter((key) => !existingKeys.has(key));

      let nextCategories = existing;
      if (missing.length) {
        await supabaseAny
          .from("notification_category_settings")
          .upsert(
            missing.map((category) => ({
              user_id: user.id,
              category,
              is_enabled: true,
            })),
            { onConflict: "user_id,category" },
          );

        const { data: afterInsert, error: afterError } = await supabaseAny
          .from("notification_category_settings")
          .select("id, user_id, category, is_enabled, sound_id, vibrate, show_text, show_sender, created_at, updated_at")
          .eq("user_id", user.id)
          .order("category", { ascending: true });
        if (afterError) throw afterError;
        nextCategories = (afterInsert ?? []) as NotificationCategorySetting[];
      }

      const { data: exData, error: exError } = await supabaseAny
        .from("notification_exceptions")
        .select("id, user_id, item_kind, item_id, is_muted, sound_id, vibrate, show_text, show_sender, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (exError) throw exError;

      setCategories(nextCategories);
      setExceptions((exData ?? []) as NotificationException[]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!user?.id) return;

    let ch: RealtimeChannel | null = null;
    ch = supabase
      .channel(`notification-prefs:${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "notification_category_settings", filter: `user_id=eq.${user.id}` },
        () => void fetchAll(),
      )
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "notification_exceptions", filter: `user_id=eq.${user.id}` },
        () => void fetchAll(),
      )
      .subscribe();

    return () => {
      if (ch) supabase.removeChannel(ch);
    };
  }, [fetchAll, user?.id]);

  const categoriesByKey = useMemo(() => {
    const map = new Map<NotificationCategory, NotificationCategorySetting>();
    for (const row of categories) {
      map.set(row.category, row);
    }
    return map;
  }, [categories]);

  const upsertCategory = useCallback(
    async (category: NotificationCategory, patch: Partial<Omit<NotificationCategorySetting, "id" | "user_id" | "category" | "created_at" | "updated_at">>) => {
      if (!user?.id) return;
      await supabaseAny
        .from("notification_category_settings")
        .upsert(
          {
            user_id: user.id,
            category,
            ...(patch as any),
          },
          { onConflict: "user_id,category" },
        );
    },
    [user?.id],
  );

  const upsertException = useCallback(
    async (item_kind: "dm" | "group" | "channel", item_id: string, patch: Partial<Omit<NotificationException, "id" | "user_id" | "item_kind" | "item_id" | "created_at" | "updated_at">>) => {
      if (!user?.id) return;
      await supabaseAny
        .from("notification_exceptions")
        .upsert(
          {
            user_id: user.id,
            item_kind,
            item_id,
            ...(patch as any),
          },
          { onConflict: "user_id,item_kind,item_id" },
        );
    },
    [user?.id],
  );

  const removeException = useCallback(
    async (item_kind: "dm" | "group" | "channel", item_id: string) => {
      if (!user?.id) return;
      await supabaseAny
        .from("notification_exceptions")
        .delete()
        .eq("user_id", user.id)
        .eq("item_kind", item_kind)
        .eq("item_id", item_id);
    },
    [user?.id],
  );

  return {
    categories,
    categoriesByKey,
    exceptions,
    loading,
    refetch: fetchAll,
    upsertCategory,
    upsertException,
    removeException,
  };
}
