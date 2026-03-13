import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export interface PinnedMessage {
  id: string;
  message_id: string;
  conversation_id: string;
  pinned_by: string;
  pin_position: number;
  pinned_at: string;
  // joined from messages
  content?: string;
  media_type?: string | null;
  sender_id?: string;
  created_at?: string;
}

const MAX_PINS = 10;
const supabaseAny = supabase as any;

export function usePinnedMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const supportsJoinRef = useRef(true);
  const tableUnavailableRef = useRef(false);

  const mapRows = useCallback((rows: any[], messagesById?: Map<string, any>) => {
    return (rows ?? []).map((row: any) => {
      const message = row.messages ?? messagesById?.get(row.message_id) ?? null;
      return {
        id: row.id,
        message_id: row.message_id,
        conversation_id: row.conversation_id,
        pinned_by: row.pinned_by,
        pin_position: row.pin_position,
        pinned_at: row.pinned_at,
        content: message?.content ?? '',
        media_type: message?.media_type ?? null,
        sender_id: message?.sender_id ?? '',
        created_at: message?.created_at ?? '',
      } as PinnedMessage;
    });
  }, []);

  const isMissingJoinError = useCallback((error: any) => {
    const msg = String(error?.message ?? '');
    return error?.code === 'PGRST200' || msg.includes('Could not find a relationship');
  }, []);

  const isMissingPinnedMessagesTableError = useCallback((error: any) => {
    const msg = String(error?.message ?? '').toLowerCase();
    const details = String(error?.details ?? '').toLowerCase();
    const code = String(error?.code ?? '');
    const status = Number(error?.status ?? 0);
    return (
      code === '42P01' ||
      code === 'PGRST205' ||
      code === 'PGRST204' ||
      msg.includes('pinned_messages') && (msg.includes('does not exist') || msg.includes('could not find the table') || msg.includes('schema cache')) ||
      details.includes('pinned_messages') && details.includes('schema cache') ||
      status === 404
    );
  }, []);

  const fetchWithoutJoin = useCallback(async () => {
    const { data, error } = await supabaseAny
      .from('pinned_messages')
      .select('id, message_id, conversation_id, pinned_by, pin_position, pinned_at')
      .eq('conversation_id', conversationId)
      .order('pin_position', { ascending: true });

    if (error) throw error;

    const rows = data ?? [];
    const ids = rows
      .map((r: any) => r.message_id)
      .filter((id: string | null | undefined): id is string => Boolean(id));

    let messagesById = new Map<string, any>();
    if (ids.length > 0) {
      const { data: messagesData } = await supabaseAny
        .from('messages')
        .select('id, content, media_type, sender_id, created_at')
        .in('id', ids);
      messagesById = new Map((messagesData ?? []).map((m: any) => [m.id, m]));
    }

    setPinnedMessages(mapRows(rows, messagesById));
  }, [conversationId, mapRows]);

  const fetchPinned = useCallback(async () => {
    if (!conversationId || !user) {
      setPinnedMessages([]);
      return;
    }
    if (tableUnavailableRef.current) {
      setPinnedMessages([]);
      return;
    }
    setLoading(true);
    try {
      if (supportsJoinRef.current) {
        const { data, error } = await supabaseAny
          .from('pinned_messages')
          .select(`
            id,
            message_id,
            conversation_id,
            pinned_by,
            pin_position,
            pinned_at,
            messages (
              content,
              media_type,
              sender_id,
              created_at
            )
          `)
          .eq('conversation_id', conversationId)
          .order('pin_position', { ascending: true });

        if (error) {
          if (isMissingPinnedMessagesTableError(error)) {
            tableUnavailableRef.current = true;
            setPinnedMessages([]);
            return;
          }
          if (isMissingJoinError(error)) {
            supportsJoinRef.current = false;
            await fetchWithoutJoin();
            return;
          }
          throw error;
        }

        setPinnedMessages(mapRows(data ?? []));
        return;
      }

      await fetchWithoutJoin();
    } catch (err) {
      if (isMissingPinnedMessagesTableError(err)) {
        tableUnavailableRef.current = true;
        setPinnedMessages([]);
        return;
      }
      logger.warn('[usePinnedMessages] fetch error', { conversationId, error: err });
    } finally {
      setLoading(false);
    }
  }, [conversationId, user, fetchWithoutJoin, isMissingJoinError, isMissingPinnedMessagesTableError, mapRows]);

  useEffect(() => {
    void fetchPinned();
  }, [fetchPinned]);

  // Realtime подписка
  useEffect(() => {
    if (!conversationId || tableUnavailableRef.current) return;

    const channel = supabase
      .channel(`pinned-messages:${conversationId}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'pinned_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void fetchPinned();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, fetchPinned]);

  const pinMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId || !user) return;
      if (tableUnavailableRef.current) {
        toast.info('Закрепления недоступны в текущей конфигурации чата');
        return;
      }

      if (pinnedMessages.length >= MAX_PINS) {
        toast.error(`Максимум ${MAX_PINS} закреплённых сообщений`);
        return;
      }

      const nextPosition = pinnedMessages.length + 1;

      try {
        const { error } = await supabaseAny
          .from('pinned_messages')
          .upsert(
            {
              message_id: messageId,
              conversation_id: conversationId,
              pinned_by: user.id,
              pin_position: nextPosition,
            },
            { onConflict: 'message_id,conversation_id' }
          );

        if (error) throw error;
        toast.success('Сообщение закреплено');
        await fetchPinned();
      } catch (err) {
        if (isMissingPinnedMessagesTableError(err)) {
          tableUnavailableRef.current = true;
          setPinnedMessages([]);
          toast.info('Закрепления недоступны в текущей конфигурации чата');
          return;
        }
        logger.warn('[usePinnedMessages] pin error', { conversationId, messageId, error: err });
        toast.error('Не удалось закрепить сообщение');
      }
    },
    [conversationId, user, pinnedMessages.length, fetchPinned, isMissingPinnedMessagesTableError]
  );

  const unpinMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;
      if (tableUnavailableRef.current) return;

      try {
        const { error } = await supabaseAny
          .from('pinned_messages')
          .delete()
          .eq('message_id', messageId)
          .eq('conversation_id', conversationId);

        if (error) throw error;
        toast.success('Закрепление снято');
        await fetchPinned();
      } catch (err) {
        if (isMissingPinnedMessagesTableError(err)) {
          tableUnavailableRef.current = true;
          setPinnedMessages([]);
          return;
        }
        logger.warn('[usePinnedMessages] unpin error', { conversationId, messageId, error: err });
        toast.error('Не удалось снять закрепление');
      }
    },
    [conversationId, fetchPinned, isMissingPinnedMessagesTableError]
  );

  const reorderPins = useCallback(
    async (orderedIds: string[]) => {
      if (!conversationId) return;
      if (tableUnavailableRef.current) return;
      try {
        const updates = orderedIds.map((messageId, idx) => ({
          message_id: messageId,
          conversation_id: conversationId,
          pin_position: idx + 1,
        }));

        for (const upd of updates) {
          await supabaseAny
            .from('pinned_messages')
            .update({ pin_position: upd.pin_position })
            .eq('message_id', upd.message_id)
            .eq('conversation_id', conversationId);
        }

        await fetchPinned();
      } catch (err) {
        if (isMissingPinnedMessagesTableError(err)) {
          tableUnavailableRef.current = true;
          setPinnedMessages([]);
          return;
        }
        logger.warn('[usePinnedMessages] reorder error', { conversationId, count: orderedIds.length, error: err });
      }
    },
    [conversationId, fetchPinned, isMissingPinnedMessagesTableError]
  );

  const isPinned = useCallback(
    (messageId: string) => pinnedMessages.some((p) => p.message_id === messageId),
    [pinnedMessages]
  );

  return {
    pinnedMessages,
    loading,
    pinnedCount: pinnedMessages.length,
    pinMessage,
    unpinMessage,
    reorderPins,
    isPinned,
    refresh: fetchPinned,
  };
}
