/**
 * usePinnedChats — хук для закрепления чатов вверху списка.
 *
 * Архитектурные решения:
 * - Лимит: 5 закреплённых чатов (аналогично Telegram).
 * - Primary storage: Supabase таблица `user_chat_settings` (колонка `is_pinned`, `pin_order`).
 * - Fallback: localStorage при недоступности Supabase.
 * - Оптимистичный UI с revert при ошибке.
 * - Идемпотентность: upsert по (user_id, conversation_id).
 * - Порядок закреплённых: pin_order ASC (0-based index из массива pinnedOrder).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { probeSupabase } from "@/lib/supabaseProbe";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export const MAX_PINNED_CHATS = 5;

// ─── localStorage fallback ────────────────────────────────────────────────────

const LS_KEY = (userId: string) => `pinned_chats_${userId}`;

interface PinnedRecord {
  id: string;
  order: number;
}

function lsLoad(userId: string): PinnedRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY(userId));
    return raw ? (JSON.parse(raw) as PinnedRecord[]) : [];
  } catch (error) {
    logger.warn("pinned_chats.ls_load_failed", { error, userId });
    return [];
  }
}

function lsSave(userId: string, records: PinnedRecord[]): void {
  try {
    localStorage.setItem(LS_KEY(userId), JSON.stringify(records));
  } catch (error) {
    logger.warn("pinned_chats.ls_save_failed", { error, userId, count: records.length });
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UsePinnedChatsReturn {
  pinnedChatIds: Set<string>;
  pinnedOrder: string[]; // ordered array for rendering
  loading: boolean;
  pinChat: (conversationId: string) => Promise<void>;
  unpinChat: (conversationId: string) => Promise<void>;
  isPinned: (conversationId: string) => boolean;
  reorderPinned: (orderedIds: string[]) => Promise<void>;
}

export function usePinnedChats(): UsePinnedChatsReturn {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // pinnedOrder = conversation IDs sorted by pin_order asc
  const [pinnedOrder, setPinnedOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [useLS, setUseLS] = useState(false);

  const isMissingSettingsTableError = useCallback((error: any) => {
    const msg = String(error?.message ?? "").toLowerCase();
    const details = String(error?.details ?? "").toLowerCase();
    const code = String(error?.code ?? "");
    const status = Number(error?.status ?? 0);
    const mentionsSettingsTable =
      msg.includes("chat_user_settings") ||
      msg.includes("user_chat_settings") ||
      details.includes("chat_user_settings") ||
      details.includes("user_chat_settings");
    return (
      code === "42P01" ||
      code === "PGRST205" ||
      code === "PGRST204" ||
      mentionsSettingsTable && (msg.includes("could not find the table") || msg.includes("does not exist") || msg.includes("schema cache")) ||
      mentionsSettingsTable && details.includes("schema cache") ||
      status === 404
    );
  }, []);

  const pinnedChatIds = useMemo(() => new Set(pinnedOrder), [pinnedOrder]);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadFromSupabase = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("user_chat_settings")
        .select("conversation_id, pin_order")
        .eq("user_id", userId)
        .eq("is_pinned", true)
        .order("pin_order", { ascending: true });

      if (error) {
        if (isMissingSettingsTableError(error)) {
          setUseLS(true);
          const ls = lsLoad(userId);
          setPinnedOrder(
            ls.sort((a, b) => a.order - b.order).map((r) => r.id)
          );
          return;
        }
        logger.error("pinned_chats.load_failed", { error, userId });
        const ls = lsLoad(userId);
        setPinnedOrder(ls.sort((a, b) => a.order - b.order).map((r) => r.id));
        return;
      }

      const sorted = (data ?? []) as Array<{
        conversation_id: string;
        pin_order: number;
      }>;
      setPinnedOrder(sorted.map((r) => r.conversation_id));
    } finally {
      setLoading(false);
    }
  }, [userId, isMissingSettingsTableError]);

  useEffect(() => {
    if (!userId) {
      setPinnedOrder([]);
      return;
    }
    void (async () => {
      const available = await probeSupabase();
      if (!available) {
        setUseLS(true);
        const ls = lsLoad(userId);
        setPinnedOrder(ls.sort((a, b) => a.order - b.order).map((r) => r.id));
      } else {
        await loadFromSupabase();
      }
    })();
  }, [userId, loadFromSupabase]);

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    if (!userId || useLS) return;

    const channel = supabase
      .channel(`pinned_chats:${userId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "user_chat_settings",
          filter: `user_id=eq.${userId}`,
        },
        () => void loadFromSupabase()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, useLS, loadFromSupabase]);

  // ── pinChat ───────────────────────────────────────────────────────────────

  const pinChat = useCallback(
    async (conversationId: string) => {
      if (!userId) {
        toast.error("Войдите в аккаунт");
        return;
      }

      if (pinnedOrder.includes(conversationId)) {
        toast.info("Чат уже закреплён");
        return;
      }

      if (pinnedOrder.length >= MAX_PINNED_CHATS) {
        toast.error(`Можно закрепить не более ${MAX_PINNED_CHATS} чатов`);
        return;
      }

      const newOrder = [...pinnedOrder, conversationId];

      // Optimistic update
      setPinnedOrder(newOrder);

      if (useLS || !(await probeSupabase())) {
        lsSave(
          userId,
          newOrder.map((id, i) => ({ id, order: i }))
        );
        toast.success("Чат закреплён");
        return;
      }

      const { error } = await (supabase as any)
        .from("user_chat_settings")
        .upsert(
          {
            user_id: userId,
            conversation_id: conversationId,
            is_pinned: true,
            pin_order: newOrder.length - 1,
          },
          { onConflict: "user_id,conversation_id" }
        );

      if (error) {
        if (isMissingSettingsTableError(error)) {
          setUseLS(true);
          lsSave(
            userId,
            newOrder.map((id, i) => ({ id, order: i }))
          );
          toast.success("Чат закреплён");
          return;
        }
        // Revert
        setPinnedOrder(pinnedOrder);
        toast.error("Не удалось закрепить чат");
        logger.error("pinned_chats.pin_failed", { error, userId, conversationId });
        return;
      }

      toast.success("Чат закреплён");
    },
    [userId, pinnedOrder, useLS, isMissingSettingsTableError]
  );

  // ── unpinChat ─────────────────────────────────────────────────────────────

  const unpinChat = useCallback(
    async (conversationId: string) => {
      if (!userId) return;

      const prevOrder = pinnedOrder;
      const newOrder = pinnedOrder.filter((id) => id !== conversationId);

      // Optimistic update
      setPinnedOrder(newOrder);

      if (useLS || !(await probeSupabase())) {
        lsSave(
          userId,
          newOrder.map((id, i) => ({ id, order: i }))
        );
        toast.success("Чат откреплён");
        return;
      }

      const { error } = await (supabase as any)
        .from("user_chat_settings")
        .upsert(
          {
            user_id: userId,
            conversation_id: conversationId,
            is_pinned: false,
            pin_order: null,
          },
          { onConflict: "user_id,conversation_id" }
        );

      if (error) {
        if (isMissingSettingsTableError(error)) {
          setUseLS(true);
          lsSave(
            userId,
            newOrder.map((id, i) => ({ id, order: i }))
          );
          toast.success("Чат откреплён");
          return;
        }
        // Revert
        setPinnedOrder(prevOrder);
        toast.error("Не удалось открепить чат");
        logger.error("[usePinnedChats] unpinChat error", { error });
        return;
      }

      toast.success("Чат откреплён");
    },
    [userId, pinnedOrder, useLS, isMissingSettingsTableError]
  );

  // ── reorderPinned ─────────────────────────────────────────────────────────

  const reorderPinned = useCallback(
    async (orderedIds: string[]) => {
      if (!userId) return;

      const prevOrder = pinnedOrder;
      setPinnedOrder(orderedIds);

      if (useLS || !(await probeSupabase())) {
        lsSave(
          userId,
          orderedIds.map((id, i) => ({ id, order: i }))
        );
        return;
      }

      // Batch upsert all pinned items with new orders
      const upserts = orderedIds.map((conversationId, idx) => ({
        user_id: userId,
        conversation_id: conversationId,
        is_pinned: true,
        pin_order: idx,
      }));

      const { error } = await (supabase as any)
        .from("user_chat_settings")
        .upsert(upserts, { onConflict: "user_id,conversation_id" });

      if (error) {
        if (isMissingSettingsTableError(error)) {
          setUseLS(true);
          lsSave(
            userId,
            orderedIds.map((id, i) => ({ id, order: i }))
          );
          return;
        }
        setPinnedOrder(prevOrder);
        logger.error("[usePinnedChats] reorderPinned error", { error });
      }
    },
    [userId, pinnedOrder, useLS, isMissingSettingsTableError]
  );

  // ── isPinned ──────────────────────────────────────────────────────────────

  const isPinned = useCallback(
    (conversationId: string): boolean => pinnedChatIds.has(conversationId),
    [pinnedChatIds]
  );

  return {
    pinnedChatIds,
    pinnedOrder,
    loading,
    pinChat,
    unpinChat,
    isPinned,
    reorderPinned,
  };
}
