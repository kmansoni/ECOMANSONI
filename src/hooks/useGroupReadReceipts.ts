/**
 * src/hooks/useGroupReadReceipts.ts
 *
 * Хук для per-message read receipts в групповых чатах.
 * Показывает кто именно прочитал конкретное сообщение.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase, dbLoose } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { logger } from "@/lib/logger";

// ── Типы ─────────────────────────────────────────────────────────────

export interface SeenByEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  seenAt: string;
}

type UnknownRecord = Record<string, unknown>;

function str(obj: UnknownRecord, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

function strNull(obj: UnknownRecord, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

// ── Хук: загрузка списка прочитавших ─────────────────────────────────

export function useGroupReadReceipts(messageId: string | null) {
  const { user } = useAuth();
  const [seenBy, setSeenBy] = useState<SeenByEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!messageId || !user) {
      setSeenBy([]);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // Загрузить read receipts
        const { data: reads, error: readsErr } = await dbLoose
          .from("group_message_reads")
          .select("user_id, read_at")
          .eq("message_id", messageId)
          .limit(200);

        if (cancelled) return;

        if (readsErr) {
          logger.error("[useGroupReadReceipts] Ошибка загрузки read receipts", {
            messageId,
            error: readsErr,
          });
          setLoading(false);
          return;
        }

        const rows = (reads ?? []) as UnknownRecord[];
        if (rows.length === 0) {
          setSeenBy([]);
          setLoading(false);
          return;
        }

        // Получить профили пользователей
        const userIds = rows.map((r) => str(r, "user_id")).filter(Boolean);

        const { data: profiles, error: profilesErr } = await dbLoose
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds)
          .limit(200);

        if (cancelled) return;

        if (profilesErr) {
          logger.error("[useGroupReadReceipts] Ошибка загрузки профилей", { error: profilesErr });
        }

        const profileMap = new Map<string, { displayName: string; avatarUrl: string | null }>();
        for (const p of (profiles ?? []) as UnknownRecord[]) {
          const id = str(p, "id");
          if (id) {
            profileMap.set(id, {
              displayName: str(p, "display_name") || "Пользователь",
              avatarUrl: strNull(p, "avatar_url"),
            });
          }
        }

        const entries: SeenByEntry[] = rows.map((r) => {
          const userId = str(r, "user_id");
          const profile = profileMap.get(userId);
          return {
            userId,
            displayName: profile?.displayName ?? "Пользователь",
            avatarUrl: profile?.avatarUrl ?? null,
            seenAt: str(r, "read_at"),
          };
        });

        // Сортировка по времени прочтения (новые сверху)
        entries.sort((a, b) => {
          const ta = new Date(a.seenAt).getTime();
          const tb = new Date(b.seenAt).getTime();
          return tb - ta;
        });

        setSeenBy(entries);
      } catch (e) {
        if (!cancelled) {
          logger.error("[useGroupReadReceipts] Непредвиденная ошибка", { error: e });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [messageId, user]);

  // Пометить сообщение как прочитанное текущим пользователем
  const markAsRead = useCallback(
    async (msgId: string) => {
      if (!user) return;
      try {
        const { error } = await dbLoose
          .from("group_message_reads")
          .upsert(
            { message_id: msgId, user_id: user.id, read_at: new Date().toISOString() },
            { onConflict: "message_id,user_id" },
          );

        if (error) {
          logger.error("[useGroupReadReceipts] Ошибка записи read receipt", { msgId, error });
        }
      } catch (e) {
        logger.error("[useGroupReadReceipts] Ошибка записи read receipt", { error: e });
      }
    },
    [user],
  );

  return { seenBy, loading, markAsRead } as const;
}
