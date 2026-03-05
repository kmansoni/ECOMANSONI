/**
 * useArchivedChats — хук для архивирования чатов.
 *
 * Архитектурные решения:
 * - Primary storage: Supabase таблица `chat_user_settings` (колонка `is_archived`).
 * - Fallback: localStorage при недоступности Supabase / отсутствии таблицы.
 * - Оптимистичный UI: состояние мгновенно обновляется, reverts при ошибке.
 * - Zero-trust: user_id всегда берётся из auth контекста на сервере (RLS).
 * - Идемпотентность: upsert по (user_id, conversation_id).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { probeSupabase } from "@/lib/supabaseProbe";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ArchivedChatRecord {
  conversation_id: string;
  is_archived: boolean;
  archived_at: string | null;
}

// ─── localStorage fallback ────────────────────────────────────────────────────

const LS_KEY = (userId: string) => `archived_chats_${userId}`;

function lsLoad(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY(userId));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function lsSave(userId: string, ids: Set<string>): void {
  try {
    localStorage.setItem(LS_KEY(userId), JSON.stringify([...ids]));
  } catch {
    // quota exceeded — silent
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseArchivedChatsReturn {
  archivedChatIds: Set<string>;
  archivedCount: number;
  loading: boolean;
  archiveChat: (conversationId: string) => Promise<void>;
  unarchiveChat: (conversationId: string) => Promise<void>;
  isArchived: (conversationId: string) => boolean;
}

export function useArchivedChats(): UseArchivedChatsReturn {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [archivedChatIds, setArchivedChatIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [useLS, setUseLS] = useState(false);

  const isMissingSettingsTableError = useCallback((error: any) => {
    const msg = String(error?.message ?? "");
    return error?.code === "42P01" || error?.code === "PGRST205" || msg.includes("Could not find the table") || msg.includes("does not exist");
  }, []);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadFromSupabase = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("chat_user_settings")
        .select("conversation_id")
        .eq("user_id", userId)
        .eq("is_archived", true);

      if (error) {
        // Table missing → fallback
        if (isMissingSettingsTableError(error)) {
          setUseLS(true);
          setArchivedChatIds(lsLoad(userId));
          return;
        }
        console.error("useArchivedChats load:", error);
        setArchivedChatIds(lsLoad(userId));
        return;
      }

      const ids = new Set<string>(
        (data ?? []).map((r: { conversation_id: string }) => r.conversation_id)
      );
      setArchivedChatIds(ids);
    } finally {
      setLoading(false);
    }
  }, [userId, isMissingSettingsTableError]);

  useEffect(() => {
    if (!userId) {
      setArchivedChatIds(new Set());
      return;
    }
    void (async () => {
      const available = await probeSupabase();
      if (!available) {
        setUseLS(true);
        setArchivedChatIds(lsLoad(userId));
      } else {
        await loadFromSupabase();
      }
    })();
  }, [userId, loadFromSupabase]);

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    if (!userId || useLS) return;

    const channel = supabase
      .channel(`archived_chats:${userId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "chat_user_settings",
          filter: `user_id=eq.${userId}`,
        },
        () => void loadFromSupabase()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, useLS, loadFromSupabase]);

  // ── archiveChat ───────────────────────────────────────────────────────────

  const archiveChat = useCallback(
    async (conversationId: string) => {
      if (!userId) {
        toast.error("Войдите в аккаунт");
        return;
      }

      // Optimistic update
      setArchivedChatIds((prev) => {
        const next = new Set(prev);
        next.add(conversationId);
        return next;
      });

      if (useLS || !(await probeSupabase())) {
        const ids = lsLoad(userId);
        ids.add(conversationId);
        lsSave(userId, ids);
        toast.success("Чат архивирован");
        return;
      }

      const { error } = await (supabase as any)
        .from("chat_user_settings")
        .upsert(
          {
            user_id: userId,
            conversation_id: conversationId,
            is_archived: true,
            archived_at: new Date().toISOString(),
          },
          { onConflict: "user_id,conversation_id" }
        );

      if (error) {
        if (isMissingSettingsTableError(error)) {
          setUseLS(true);
          const ids = lsLoad(userId);
          ids.add(conversationId);
          lsSave(userId, ids);
          toast.success("Чат архивирован");
          return;
        }
        // Revert
        setArchivedChatIds((prev) => {
          const next = new Set(prev);
          next.delete(conversationId);
          return next;
        });
        toast.error("Не удалось архивировать чат");
        console.error("archiveChat:", error);
        return;
      }

      toast.success("Чат архивирован");
    },
    [userId, useLS, isMissingSettingsTableError]
  );

  // ── unarchiveChat ─────────────────────────────────────────────────────────

  const unarchiveChat = useCallback(
    async (conversationId: string) => {
      if (!userId) return;

      // Optimistic update
      setArchivedChatIds((prev) => {
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });

      if (useLS || !(await probeSupabase())) {
        const ids = lsLoad(userId);
        ids.delete(conversationId);
        lsSave(userId, ids);
        toast.success("Чат разархивирован");
        return;
      }

      const { error } = await (supabase as any)
        .from("chat_user_settings")
        .upsert(
          {
            user_id: userId,
            conversation_id: conversationId,
            is_archived: false,
            archived_at: null,
          },
          { onConflict: "user_id,conversation_id" }
        );

      if (error) {
        if (isMissingSettingsTableError(error)) {
          setUseLS(true);
          const ids = lsLoad(userId);
          ids.delete(conversationId);
          lsSave(userId, ids);
          toast.success("Чат разархивирован");
          return;
        }
        // Revert
        setArchivedChatIds((prev) => {
          const next = new Set(prev);
          next.add(conversationId);
          return next;
        });
        toast.error("Не удалось разархивировать чат");
        console.error("unarchiveChat:", error);
        return;
      }

      toast.success("Чат разархивирован");
    },
    [userId, useLS, isMissingSettingsTableError]
  );

  // ── isArchived ────────────────────────────────────────────────────────────

  const isArchived = useCallback(
    (conversationId: string): boolean => archivedChatIds.has(conversationId),
    [archivedChatIds]
  );

  const archivedCount = useMemo(() => archivedChatIds.size, [archivedChatIds]);

  return {
    archivedChatIds,
    archivedCount,
    loading,
    archiveChat,
    unarchiveChat,
    isArchived,
  };
}
