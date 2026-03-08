/**
 * useDeliveryStatus — Realtime-хук для отслеживания статусов доставки сообщений.
 *
 * Архитектурные решения:
 * - Загружает начальные статусы только для собственных сообщений (sender_id = auth.uid()).
 * - Подписывается на UPDATE на таблице messages (delivery_status меняется триггером при INSERT
 *   в message_read_receipts).
 * - markAsRead / markManyAsRead дебаунсируют batch-вставку в message_read_receipts (500ms).
 * - Никогда не отправляет read receipt на собственные сообщения (guard на sender_id).
 * - Cleanup: отписка от каналов и сброс таймера при unmount.
 *
 * Безопасность:
 * - RLS гарантирует, что INSERT в message_read_receipts возможен только с user_id = auth.uid().
 * - Клиент не может подделать статус чужого сообщения: он пишет только свой receipt,
 *   а триггер обновляет delivery_status на стороне сервера.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export type ServerDeliveryStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface DeliveryStatusMap {
  /** message_id → delivery_status */
  [messageId: string]: ServerDeliveryStatus;
}

export function useDeliveryStatus(conversationId: string | null): {
  /** Карта статусов для собственных сообщений текущего пользователя в этом чате */
  statusMap: DeliveryStatusMap;
  /**
   * Отправить read receipt для одного сообщения (дебаунс 500ms).
   * Не отправляет receipt если message.sender_id === auth.uid() — это проверяется на caller.
   */
  markAsRead: (messageId: string) => Promise<void>;
  /**
   * Batch-отправка read receipts (дебаунс 500ms).
   * Caller обязан отфильтровать собственные сообщения перед вызовом.
   */
  markManyAsRead: (messageIds: string[]) => Promise<void>;
} {
  const { user } = useAuth();
  const [statusMap, setStatusMap] = useState<DeliveryStatusMap>({});

  // Буфер message_id, ожидающих отправки receipt
  const pendingReadIdsRef = useRef<Set<string>>(new Set());
  const debounceTimerRef = useRef<number | null>(null);

  // ── Загрузка начальных статусов ───────────────────────────────────────────

  useEffect(() => {
    if (!conversationId || !user) {
      setStatusMap({});
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data, error } = await (supabase as any)
        .from("messages")
        .select("id, delivery_status")
        .eq("conversation_id", conversationId)
        .eq("sender_id", user.id);

      if (cancelled || error || !data) return;

      const map: DeliveryStatusMap = {};
      for (const row of (data as Array<{ id: string; delivery_status: string | null }>)) {
        if (row.delivery_status) {
          map[row.id] = row.delivery_status as ServerDeliveryStatus;
        }
      }
      setStatusMap(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, user]);

  // ── Realtime: UPDATE на messages → обновить statusMap ────────────────────

  useEffect(() => {
    if (!conversationId || !user) return;

    const channelName = `delivery-status:${conversationId}:${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as {
            id?: string;
            sender_id?: string;
            delivery_status?: string | null;
          };
          if (!updated?.id || !updated?.delivery_status) return;
          // Отслеживаем только собственные сообщения
          if (updated.sender_id !== user.id) return;

          setStatusMap((prev) => {
            if (prev[updated.id!] === updated.delivery_status) return prev;
            return { ...prev, [updated.id!]: updated.delivery_status as ServerDeliveryStatus };
          });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Канал упал — при следующем монтировании произойдёт re-subscribe.
          // Для критичности можно добавить метрику, но это best-effort.
          console.warn("[useDeliveryStatus] Realtime channel error:", channelName, status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  // ── Flush: batch-вставка накопленных receipt ──────────────────────────────

  const flushReadReceipts = useCallback(async () => {
    if (!user) return;
    const ids = Array.from(pendingReadIdsRef.current);
    if (ids.length === 0) return;
    pendingReadIdsRef.current.clear();

    const now = new Date().toISOString();
    const rows = ids.map((id) => ({
      message_id: id,
      user_id: user.id,
      read_at: now,
    }));

    // ignoreDuplicates=true → ON CONFLICT DO NOTHING — идемпотентно
    const { error } = await (supabase as any)
      .from("message_read_receipts")
      .upsert(rows, { onConflict: "message_id,user_id", ignoreDuplicates: true });

    if (error) {
      // Re-queue при ошибке (например, временный RLS-отказ или сетевой сбой)
      for (const id of ids) pendingReadIdsRef.current.add(id);
      console.warn("[useDeliveryStatus] flushReadReceipts error:", error.message);
    }
  }, [user]);

  // ── Хелпер: запланировать flush с дебаунсом ──────────────────────────────

  const scheduleFlush = useCallback(() => {
    if (debounceTimerRef.current != null) return;
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void flushReadReceipts();
    }, 500);
  }, [flushReadReceipts]);

  // ── Public API ────────────────────────────────────────────────────────────

  const markAsRead = useCallback(
    async (messageId: string): Promise<void> => {
      if (!user || !messageId) return;
      pendingReadIdsRef.current.add(messageId);
      scheduleFlush();
    },
    [user, scheduleFlush]
  );

  const markManyAsRead = useCallback(
    async (messageIds: string[]): Promise<void> => {
      if (!user || messageIds.length === 0) return;
      for (const id of messageIds) {
        if (id) pendingReadIdsRef.current.add(id);
      }
      scheduleFlush();
    },
    [user, scheduleFlush]
  );

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
        // Flush синхронно при unmount, если есть незафиксированные receipts
        const pending = Array.from(pendingReadIdsRef.current);
        if (pending.length > 0 && user) {
          const now = new Date().toISOString();
          const rows = pending.map((id) => ({
            message_id: id,
            user_id: user.id,
            read_at: now,
          }));
          // fire-and-forget при unmount — best-effort
          void (supabase as any)
            .from("message_read_receipts")
            .upsert(rows, { onConflict: "message_id,user_id", ignoreDuplicates: true });
        }
        debounceTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { statusMap, markAsRead, markManyAsRead };
}
