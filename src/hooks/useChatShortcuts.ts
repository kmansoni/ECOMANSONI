import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { dbLoose } from "@/lib/supabase";

// DB types not yet regenerated Ã¢ use `any` until `supabase gen types` runs
// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢
// Domain types
// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

export type ShortcutChatType = "dm" | "group" | "channel" | "bot";

export interface ChatShortcut {
  id: string;
  user_id: string;
  chat_id: string;
  chat_type: ShortcutChatType;
  label: string;
  icon_url: string | null;
  sort_order: number;
  created_at: string;
}

// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢
// Hook
// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

export function useChatShortcuts() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ã¢Ã¢ Fetch all shortcuts ordered by sort_order Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

  const getShortcuts = useCallback(async (): Promise<ChatShortcut[]> => {
    if (!user?.id) return [];
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await dbLoose
        .from("chat_shortcuts")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });

      if (qErr) throw qErr;
      return data ?? [];
    } catch (err: any) {
      setError(err?.message ?? "Failed to load shortcuts");
      return [];
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Ã¢Ã¢ Add a shortcut Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

  const addShortcut = useCallback(
    async (
      chatId: string,
      chatType: ShortcutChatType,
      label: string,
      iconUrl?: string
    ): Promise<ChatShortcut | null> => {
      if (!user?.id) return null;
      setLoading(true);
      setError(null);
      try {
        // Determine max sort_order for this user
        const { data: existing } = await dbLoose
          .from("chat_shortcuts")
          .select("sort_order")
          .eq("user_id", user.id)
          .order("sort_order", { ascending: false })
          .limit(1);

        const nextOrder =
          existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

        const { data, error: insErr } = await dbLoose
          .from("chat_shortcuts")
          .insert({
            user_id: user.id,
            chat_id: chatId,
            chat_type: chatType,
            label: label.trim(),
            icon_url: iconUrl ?? null,
            sort_order: nextOrder,
          })
          .select()
          .single();

        if (insErr) throw insErr;
        return data;
      } catch (err: any) {
        // PK violation (user_id, chat_id) = already added, not a fatal error
        if (err?.code === "23505") {
          setError("This chat is already in shortcuts");
          return null;
        }
        setError(err?.message ?? "Failed to add shortcut");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // Ã¢Ã¢ Remove a shortcut Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

  const removeShortcut = useCallback(
    async (chatId: string): Promise<boolean> => {
      if (!user?.id) return false;
      setLoading(true);
      setError(null);
      try {
        const { error: delErr } = await dbLoose
          .from("chat_shortcuts")
          .delete()
          .eq("user_id", user.id)
          .eq("chat_id", chatId);

        if (delErr) throw delErr;
        return true;
      } catch (err: any) {
        setError(err?.message ?? "Failed to remove shortcut");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // Ã¢Ã¢ Batch reorder shortcuts Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢
  // Accepts an array of {id, sort_order} pairs and does a batch upsert.
  // Atomicity: each update is independent; partial failure leaves consistent state
  // because each record is independently valid.

  const reorderShortcuts = useCallback(
    async (
      shortcuts: { id: string; sort_order: number }[]
    ): Promise<boolean> => {
      if (!user?.id || shortcuts.length === 0) return true;
      setLoading(true);
      setError(null);
      try {
        // Build promises for each update
        const updates = shortcuts.map(({ id, sort_order }) =>
          dbLoose
            .from("chat_shortcuts")
            .update({ sort_order })
            .eq("id", id)
            .eq("user_id", user.id) // Safety: RLS + extra guard
        );

        const results = await Promise.all(updates);
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;

        return true;
      } catch (err: any) {
        setError(err?.message ?? "Failed to reorder shortcuts");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // Ã¢Ã¢ Check if chat is already a shortcut Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

  const isShortcut = useCallback(
    async (chatId: string): Promise<boolean> => {
      if (!user?.id) return false;
      try {
        const { data } = await dbLoose
          .from("chat_shortcuts")
          .select("id")
          .eq("user_id", user.id)
          .eq("chat_id", chatId)
          .maybeSingle();

        return !!data;
      } catch {
        return false;
      }
    },
    [user?.id]
  );

  return {
    loading,
    error,
    getShortcuts,
    addShortcut,
    removeShortcut,
    reorderShortcuts,
    isShortcut,
  };
}
