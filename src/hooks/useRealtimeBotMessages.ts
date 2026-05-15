/**
 * useRealtimeBotMessages — Realtime подписки на сообщения бота.
 * Слушает insert-события в таблице messages для чата с ботом.
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { botApi } from '@/lib/bots/api';

interface BotMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: string;
  bot_id?: string;
  content_type: string;
  content: Record<string, unknown>;
  created_at: string;
  metadata?: Record<string, unknown>;
}

/**
 * Подписка на новые сообщения в чате с ботом через Supabase Realtime.
 * Вызывает callback при получении нового сообщения от бота.
 */
export function useRealtimeBotMessages(
  conversationId: string | undefined,
  botId: string,
  onNewMessage?: (message: BotMessage) => void
) {
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!conversationId) return;

    // Unsubscribe from previous channel
    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }

    // Subscribe to new messages in this conversation
    const channel = supabase
      .channel(`bot-messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as BotMessage;

          // Only process bot messages (avoid echoing user's own messages)
          if (newMessage.sender_type === 'bot' && newMessage.bot_id === botId) {
            onNewMessage?.(newMessage);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscribed to bot messages for conversation ${conversationId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Channel error for bot messages');
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [conversationId, botId, onNewMessage]);
}

/**
 * useBotConversation — хук для управления полной жизнью чата с ботом.
 */
export function useBotConversation(botId: string) {
   const [conversationId, setConversationId] = useState<string | undefined>();
   const [messages, setMessages] = useState<BotMessage[]>([]);
   const [sending, setSending] = useState(false);

   useEffect(() => {
     loadOrCreateConversation();
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [botId]);

   async function loadOrCreateConversation() {
     // Ищем существующий conversation
     const { data: conversations } = await supabase
       .from('conversations')
       .select('*')
       .eq('is_bot_chat', true)
       .eq('bot_id', botId)
       .limit(1);

     if (conversations && conversations.length > 0) {
       setConversationId(conversations[0].id);

       // Load existing messages
       const { data: msgs } = await supabase
         .from('messages')
         .select('*')
         .eq('conversation_id', conversations[0].id)
         .order('created_at', { ascending: true });

       if (msgs) setMessages(msgs);
     }
   }

   // Realtime подписка
   useRealtimeBotMessages(conversationId, botId, (newMsg) => {
     setMessages((prev) => [...prev, newMsg]);
   });

   const handleSend = async (text: string) => {
     if (!text.trim() || !conversationId || !botId || sending) return;

     setSending(true);
     try {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) throw new Error('No user');

       const trimmedText = text.trim();

       // Шаг 1: Вставляем сообщение пользователя синхронно
       const { data: message, error } = await supabase.rpc('send_message', {
         p_conversation_id: conversationId,
         p_sender_id: user.id,
         p_content_type: 'text',
         p_content: JSON.stringify({ text: trimmedText }),
         p_metadata: JSON.stringify({ bot_id: botId }),
       });

       if (error) throw error;

       // Шаг 2: Триггерим обработку ботом
       const inboundEvent = {
         event_id: `${Date.now()}_${crypto.randomUUID()}`,
         timestamp: new Date().toISOString(),
         bot_id: botId,
         user_id: user.id,
         chat_id: conversationId,
         type: 'message' as const,
         content: { text: trimmedText, message_id: message?.id },
         context: {
           platform_user_id: user.id,
           first_name: user.user_metadata?.full_name || '',
           platform: 'web' as const,
           session_variables: {},
           session_state: 'idle',
           bot_language: 'ru',
         },
       };

       await botApi.executeHandler(botId, inboundEvent).catch((err) => {
         console.error('[useBotConversation] Bot processing failed:', err);
       });

       // Шаг 3: Аналитика
       await supabase.rpc('increment_bot_analytics', {
         p_bot_id: botId,
         p_date: new Date().toISOString().split('T')[0],
         p_messages_received: 1,
       }).catch(() => {});
     } finally {
       setSending(false);
     }
   };

   return {
     conversationId,
     messages,
     sendMessage: handleSend,
     sending,
   };
 }