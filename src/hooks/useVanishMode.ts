import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const VANISH_KEY_PREFIX = 'vanish_mode_';

export function useVanishMode(conversationId: string) {
  const { user } = useAuth();
  const storageKey = `${VANISH_KEY_PREFIX}${conversationId}`;

  const [isVanishMode, setIsVanishMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  const toggleVanishMode = useCallback(() => {
    setIsVanishMode(prev => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [storageKey]);

  // Удаляем прочитанные сообщения если Vanish Mode активен
  useEffect(() => {
    if (!isVanishMode || !user) return;

    const deleteReadMessages = async () => {
      try {
        // Получаем сообщения которые прочитаны обоими участниками
        const { data: messages } = await (supabase as any)
          .from('messages')
          .select('id, read_at')
          .eq('conversation_id', conversationId)
          .not('read_at', 'is', null);

        if (!messages || messages.length === 0) return;

        const readIds = (messages as { id: string; read_at: string | null }[])
          .filter((m) => m.read_at != null)
          .map((m) => m.id);

        if (readIds.length > 0) {
          await (supabase as any)
            .from('messages')
            .delete()
            .in('id', readIds)
            .eq('conversation_id', conversationId);
        }
      } catch {
        // ignore — таблица может иметь другую схему
      }
    };

    // Запускаем удаление через 3 секунды после активации
    const timer = setTimeout(deleteReadMessages, 3000);
    return () => clearTimeout(timer);
  }, [isVanishMode, conversationId, user]);

  return {
    isVanishMode,
    toggleVanishMode,
  };
}
