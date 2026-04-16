import { useCallback, useRef, useEffect, useState } from 'react';
import { supabase, dbLoose } from "@/lib/supabase";
import { useAuth } from './useAuth';

export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

interface MessageStatusMap {
  [messageId: string]: DeliveryStatus;
}

export function useReadReceipts(conversationId: string | null) {
  const { user } = useAuth();
  const [statusMap, setStatusMap] = useState<MessageStatusMap>({});
  const batchReadQueue = useRef<Set<string>>(new Set());
  const batchTimerRef = useRef<number | null>(null);
  // Загружаем статусы при монтировании
  useEffect(() => {
    if (!conversationId || !user) return;

    const loadStatuses = async () => {
      try {
        const { data, error } = await dbLoose
          .from('messages')
          .select('id, delivery_status')
          .eq('conversation_id', conversationId)
          .eq('sender_id', user.id)
          .not('delivery_status', 'is', null);

        if (error) return;
        const map: MessageStatusMap = {};
        for (const row of data ?? []) {
          map[row.id] = (row.delivery_status as DeliveryStatus) ?? 'sent';
        }
        setStatusMap(map);
      } catch {
        // ignore
      }
    };

    void loadStatuses();
  }, [conversationId, user]);

  // Realtime подписка на изменения статусов
  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = supabase
      .channel(`read-receipts:${conversationId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (!row?.id || !row?.delivery_status) return;
          // Only track our own messages' status changes
          if (row.sender_id === user.id) {
            setStatusMap((prev) => ({
              ...prev,
              [row.id]: row.delivery_status as DeliveryStatus,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  // Пометить сообщения как доставленные
  const markAsDelivered = useCallback(
    async (messageIds: string[]) => {
      if (!messageIds.length) return;
      try {
        await dbLoose
          .from('messages')
          .update({
            delivery_status: 'delivered',
            delivered_at: new Date().toISOString(),
          })
          .in('id', messageIds)
          .neq('sender_id', user?.id ?? '')
          .eq('conversation_id', conversationId);
      } catch {
        // ignore
      }
    },
    [conversationId, user]
  );

  // Пакетная отправка read events каждые 500ms
  const flushReadBatch = useCallback(async () => {
    if (!batchReadQueue.current.size) return;
    const ids = [...batchReadQueue.current];
    batchReadQueue.current.clear();

    try {
      await dbLoose
        .from('messages')
        .update({
          delivery_status: 'read',
          read_at: new Date().toISOString(),
          is_read: true,
        })
        .in('id', ids)
        .neq('sender_id', user?.id ?? '')
        .eq('conversation_id', conversationId);
    } catch {
      // ignore
    }
  }, [conversationId, user]);

  // Добавить сообщение в очередь прочитанных.
  // Батчинг на 2s: в активной переписке пользователь читает десятки
  // сообщений за секунды — окно 2s объединяет их в один UPDATE и
  // снимает нагрузку с Realtime (один broadcast вместо десятков).
  const markAsRead = useCallback(
    (messageId: string) => {
      batchReadQueue.current.add(messageId);

      if (batchTimerRef.current) {
        window.clearTimeout(batchTimerRef.current);
      }
      batchTimerRef.current = window.setTimeout(() => {
        void flushReadBatch();
        batchTimerRef.current = null;
      }, 2000);
    },
    [flushReadBatch]
  );

  // Получить статус конкретного сообщения
  const getMessageStatus = useCallback(
    (messageId: string): DeliveryStatus => {
      return statusMap[messageId] ?? 'sent';
    },
    [statusMap]
  );

  // Установить оптимистичный статус (sending → sent)
  const setLocalStatus = useCallback(
    (messageId: string, status: DeliveryStatus) => {
      setStatusMap((prev) => ({ ...prev, [messageId]: status }));
    },
    []
  );

  // Очистка при размонтировании. Окно 2s может оставить не-flushed ids,
  // поэтому при уходе из чата делаем финальный сброс, чтобы read receipts
  // не потерялись до следующего открытия чата.
  useEffect(() => {
    return () => {
      if (batchTimerRef.current) {
        window.clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
      if (batchReadQueue.current.size > 0) {
        void flushReadBatch();
      }
    };
    // flushReadBatch зависит от conversationId/user — при их смене сбросим
    // именно для уходящего чата, что является корректным поведением.
  }, [flushReadBatch]);

  return { markAsDelivered, markAsRead, getMessageStatus, setLocalStatus };
}
