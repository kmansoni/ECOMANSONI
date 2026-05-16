/**
 * BotChat — компонент чата с ботом (предпросмотр / быстрый чат)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dbLoose as supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { BotIcon, Loader2 } from 'lucide-react';
import { BotMessageContent } from './BotMessageContent';

// ── Types ───────────────────────────────────────────────────────────────────

interface BotChatProps {
  botId: string;
  botName: string;
  botAvatar?: string;
  conversationId?: string;
  className?: string;
  onNewMessage?: (message: any) => void;
}

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

// ── Component ───────────────────────────────────────────────────────────────

export function BotChat({ botId, botName, botAvatar, conversationId: propConversationId, className, onNewMessage }: BotChatProps) {
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(propConversationId || null);
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load/create conversation
  useEffect(() => {
    if (propConversationId) {
      setConversationId(propConversationId);
      loadMessages(propConversationId);
    } else if (botId) {
      findOrCreateConversation();
    }
  }, [botId, propConversationId]);

  async function ensureParticipant(conversationIdValue: string, userId: string) {
    const { error } = await supabase
      .from('conversation_participants')
      .insert({ conversation_id: conversationIdValue, user_id: userId });

    // Игнорируем дубликаты, если участник уже добавлен.
    if (error && error.code !== '23505') {
      throw error;
    }
  }

  async function findOrCreateConversation() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Simple bot chat: just find any existing bot conversation
      const { data: existing, error: existingError } = await supabase
        .from('conversations')
        .select('*')
        .eq('is_bot_chat', true)
        .eq('bot_id', botId)
        .limit(1)
        .single();

      if (existing) {
        setConversationId(existing.id);
        await ensureParticipant(existing.id, user.id);
        loadMessages(existing.id);
        return;
      }

      // Create conversation
      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({
          is_bot_chat: true,
          title: botName,
          bot_id: botId,
          type: 'private',
        })
        .select()
        .single();

      if (error) throw error;

      await ensureParticipant(conv.id, user.id);
      setConversationId(conv.id);
      setMessages([]);
    } catch (err) {
      console.error('[BotChat] Failed to create conversation:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(convId: string) {
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (data) setMessages(data);
    } catch (err) {
      console.error('[BotChat] Failed to load messages:', err);
    }
  }

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`bot-chat-rt:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as BotMessage;
          if (newMsg.sender_type === 'bot' && (!botId || newMsg.bot_id === botId)) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            onNewMessage?.(newMsg);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, botId, onNewMessage]);

const handleCallbackButton = useCallback((text: string, callbackData?: string) => {
     if (!conversationId || !botId || isSending) return;

     const payload = callbackData
       ? { callback_data: callbackData }
       : { text };

     const inboundEvent = {
       event_id: `${Date.now()}_${crypto.randomUUID()}`,
       timestamp: new Date().toISOString(),
       bot_id: botId,
       user_id: 'current-user',
       chat_id: conversationId,
       type: 'callback' as const,
       content: payload,
       context: {
         platform_user_id: 'current-user',
         first_name: '',
         platform: 'web' as const,
         session_variables: {},
         session_state: 'idle',
         bot_language: 'ru',
       },
     };

     // Fire to bot engine
     (async () => {
       const engineUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bot-engine/execute`;
       const { data: { session } } = await supabase.auth.getSession();
       fetch(engineUrl, {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'Authorization': `Bearer ${session?.access_token}`,
         },
         body: JSON.stringify(inboundEvent),
       }).catch((err) => console.error('[BotChat] Callback execution failed:', err));
     })();
   }, [conversationId, botId, isSending]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || !conversationId) return;
    if (isSending) return;

    setIsSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user');

      // Send via RPC
      const { data: message, error } = await supabase.rpc('send_message', {
        p_conversation_id: conversationId,
        p_sender_id: user.id,
        p_content_type: 'text',
        p_content: JSON.stringify({ text: inputText.trim() }),
        p_metadata: JSON.stringify({ bot_id: botId }),
      });

      if (error) throw error;

      // Trigger bot processing
      try {
        const inboundEvent = {
          event_id: `${Date.now()}_${crypto.randomUUID()}`,
          timestamp: new Date().toISOString(),
          bot_id: botId,
          user_id: user.id,
          chat_id: conversationId,
          type: 'message' as const,
          content: { text: inputText.trim(), message_id: message?.id },
          context: {
            platform_user_id: user.id,
            first_name: user.user_metadata?.full_name || '',
            platform: 'web' as const,
            session_variables: {},
            session_state: 'idle',
            bot_language: 'ru',
          },
        };

        // Fire to bot engine
        const engineUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bot-engine/execute`;
        fetch(engineUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify(inboundEvent),
        }).catch((err) => console.error('[BotChat] Bot engine call failed:', err));
      } catch (botErr) {
        console.error('[BotChat] Bot processing trigger failed:', botErr);
      }

      setInputText('');
    } catch (err) {
      console.error('[BotChat] Send failed:', err);
    } finally {
      setIsSending(false);
    }
  }, [inputText, conversationId, botId, queryClient]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center p-8", className)}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b shrink-0">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
          {botAvatar ? (
            <img src={botAvatar} alt={botName} className="w-full h-full object-cover" />
          ) : (
            <BotIcon className="w-5 h-5 text-primary" />
          )}
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{botName}</h3>
          <p className="text-xs text-muted-foreground">бот</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isBot = msg.sender_type === 'bot';
          const fallbackText = (msg.content as Record<string, unknown>)?.text as string || '';

          return (
            <div
              key={msg.id}
              className={cn(
                "flex gap-2 max-w-[80%] group",
                isBot ? "mr-auto" : "ml-auto flex-row-reverse"
              )}
            >
              {!isBot && (
                <div className="w-7 h-7 rounded-full bg-primary/10 shrink-0 flex items-center justify-center text-[10px] font-semibold text-primary">
                  Вы
                </div>
              )}
              <div className="flex flex-col gap-1 max-w-full">
                <div
                  className={cn(
                    "px-4 py-2 rounded-2xl text-sm break-words",
                    isBot
                      ? "bg-secondary text-secondary-foreground rounded-bl-sm"
                      : "bg-primary text-primary-foreground rounded-br-sm"
                  )}
                >
                  <BotMessageContent
                    content={msg.content as Record<string, unknown>}
                    contentType={msg.content_type}
                    metadata={msg.metadata as Record<string, unknown> | undefined}
                    onCallbackButtonClick={handleCallbackButton}
                  />
                </div>
              </div>
              {isBot && (
                <div className="w-7 h-7 rounded-full bg-muted shrink-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <BotIcon className="w-3 h-3 text-muted-foreground" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t shrink-0 bg-background/95 backdrop-blur-sm">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Написать боту..."
            className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors max-h-24"
          />
          <button
            onClick={handleSend}
            disabled={isSending || !inputText.trim()}
            className="rounded-xl bg-primary px-4 py-2.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors text-sm font-semibold shadow-sm shadow-primary/20 shrink-0"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}