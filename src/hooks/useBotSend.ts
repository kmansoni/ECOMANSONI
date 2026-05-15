/**
 * useBotSend — хук отправки сообщений от пользователя в чат с ботом.
 *
 * Последовательность:
 * 1. Вставляем сообщение через RPC (синхронно, await)
 * 2. Триггерим обработку ботом через executeHandler
 * 3. Бот-движок доставляет ответ через deliverMessage → messages table
 * 4. Realtime подхватывает ответ автоматически
 */

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dbLoose } from '@/lib/supabase';
import { botApi } from '@/lib/bots/api';
import type { BotInboundEvent } from '@/lib/bots/protocol';

interface SendMessageResult {
  id: string;
}

export function useBotSend(conversationId: string | undefined, botId: string) {
  const queryClient = useQueryClient();
  const sendingRef = useRef(false);

  const sendMessage = useCallback(async (
    text: string,
  ): Promise<SendMessageResult> => {
    if (!conversationId || !text.trim() || sendingRef.current) {
      return { id: '' };
    }

    sendingRef.current = true;
    let messageId = '';

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');

      // Шаг 1: Вставляем сообщение пользователя синхронно
      const { data: message, error } = await dbLoose.rpc('send_message', {
        p_conversation_id: conversationId,
        p_sender_id: user.id,
        p_content_type: 'text',
        p_content: JSON.stringify({ text: text.trim() }),
        p_metadata: JSON.stringify({ bot_id: botId }),
      });

      if (error) throw error;
      if (message?.id) messageId = message.id;

      // Шаг 2: Триггерим обработку ботом (после подтверждения вставки)
      const inboundEvent: BotInboundEvent = {
        event_id: `${Date.now()}_${crypto.randomUUID()}`,
        timestamp: new Date().toISOString(),
        bot_id: botId,
        user_id: user.id,
        chat_id: conversationId,
        type: 'message',
        content: {
          text: text.trim(),
          message_id: messageId,
        },
        context: {
          platform_user_id: user.id,
          first_name: user.user_metadata?.full_name || '',
          platform: 'web',
          session_variables: {},
          session_state: 'idle',
          bot_language: 'ru',
        },
      };

      await botApi.executeHandler(botId, inboundEvent).catch((err) => {
        console.error('[useBotSend] Bot processing failed:', err);
      });

      // Шаг 3: Аналитика
      await dbLoose.rpc('increment_bot_analytics', {
        p_bot_id: botId,
        p_date: new Date().toISOString().split('T')[0],
        p_messages_received: 1,
      }).catch(() => {});

// Invalidate messages and runs
       queryClient.invalidateQueries({ queryKey: ['bot-messages', conversationId] });
       queryClient.invalidateQueries({ queryKey: ['bot-runs', botId] });

       return { id: messageId };
    } finally {
      sendingRef.current = false;
    }
  }, [conversationId, botId, queryClient]);

  return { sendMessage, sending: sendingRef.current };
}