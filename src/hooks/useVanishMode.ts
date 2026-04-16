import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';
import { VANISH_DELETE_DELAY_MS } from '@/lib/timing';
import { dbLoose } from "@/lib/supabase";

const VANISH_KEY_PREFIX = 'vanish_mode_';

export function useVanishMode(conversationId: string) {
  const { user } = useAuth();
  const storageKey = `${VANISH_KEY_PREFIX}${conversationId}`;
  const deletingRef = useRef(false);

  const [isVanishMode, setIsVanishMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch (err) {
      logger.warn('[useVanishMode] localStorage read failed', { conversationId, error: err });
      return false;
    }
  });

  const toggleVanishMode = useCallback(() => {
    setIsVanishMode(prev => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, String(next));
      } catch (err) {
        logger.warn('[useVanishMode] localStorage write failed', { storageKey, error: err });
      }
      logger.info('[useVanishMode] Vanish mode toggled', { conversationId, enabled: next });
      return next;
    });
  }, [storageKey, conversationId]);

  // Удаляем прочитанные сообщения если Vanish Mode активен
  useEffect(() => {
    if (!isVanishMode || !user) return;

    const deleteReadMessages = async () => {
      if (deletingRef.current) return;
      deletingRef.current = true;

      try {
        // Получаем сообщения которые прочитаны обоими участниками (read_at не null)
        // и которые отправлены НЕ текущим пользователем (чтобы удалять только прочитанные)
        const { data: messages, error: fetchError } = await dbLoose
          .from('messages')
          .select('id, read_at, sender_id')
          .eq('conversation_id', conversationId)
          .not('read_at', 'is', null);

        if (fetchError) {
          logger.error('[useVanishMode] Ошибка получения сообщений', {
            conversationId,
            code: fetchError.code,
            message: fetchError.message,
          });
          return;
        }

        if (!messages || messages.length === 0) return;

        // Фильтруем: удаляем только действительно прочитанные сообщения
        const readIds = (messages as { id: string; read_at: string | null; sender_id: string }[])
          .filter((m) => m.read_at != null)
          .map((m) => m.id);

        if (readIds.length === 0) return;

        const { error: deleteError } = await dbLoose
          .from('messages')
          .delete()
          .in('id', readIds)
          .eq('conversation_id', conversationId);

        if (deleteError) {
          logger.error('[useVanishMode] Ошибка удаления сообщений', {
            conversationId,
            count: readIds.length,
            code: deleteError.code,
            message: deleteError.message,
          });
          return;
        }

        logger.debug('[useVanishMode] Удалено vanish-сообщений', {
          conversationId,
          count: readIds.length,
        });
      } catch (err) {
        logger.error('[useVanishMode] Unexpected error in deleteReadMessages', {
          conversationId,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        deletingRef.current = false;
      }
    };

    const timer = setTimeout(deleteReadMessages, VANISH_DELETE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isVanishMode, conversationId, user]);

  return {
    isVanishMode,
    toggleVanishMode,
  };
}
