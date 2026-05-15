/**
 * BotChatPage — страница чата с ботом по адресу /bot/:username
 *
 * Использует стандартную инфраструктуру чатов приложения.
 * Полностью работает через собственный протокол без зависимости от Telegram API.
 */

import React, { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft, Bot as BotIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { BotWithOwner, BotMessage } from '@/lib/bots/types';
import { botApi } from '@/lib/bots/api';
import { useBotSend } from '@/hooks/useBotSend';
import { BotMessageContent } from '@/components/bots/BotMessageContent';

interface Message extends BotMessage {
  conversation_id: string;
}

export function BotChatPage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [bot, setBot] = useState<BotWithOwner | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { sendMessage, sending } = useBotSend(conversationId || undefined, bot?.id || '');

  useEffect(() => {
    if (username) void loadBot();
  }, [username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadBot() {
    try {
      setLoading(true);
      setError(null);
      const data = await botApi.getBotByUsername(username);
      setBot(data);
      await findOrCreateConversation(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить бота');
    } finally {
      setLoading(false);
    }
  }

  async function findOrCreateConversation(botId: string) {
    try {
      const userData = await supabase.auth.getUser();
      if (!userData.data.user) throw new Error('No user');

      const { data: conversations } = await supabase
        .from('conversations')
        .select('*')
        .eq('is_bot_chat', true)
        .eq('bot_id', botId)
        .limit(1);

      if (conversations && conversations.length > 0) {
        setConversationId(conversations[0].id);
        await loadMessages(conversations[0].id);
        return;
      }

      // Создаём новую беседу
      const { data: conv, error: createError } = await supabase
        .from('conversations')
        .insert({
          is_bot_chat: true,
          title: bot?.display_name || 'Chat with Bot',
          bot_id: botId,
          type: 'private',
        })
        .select()
        .single();

      if (createError) throw createError;

      await supabase.from('conversation_participants').insert({
        conversation_id: conv.id,
        user_id: userData.data.user.id,
      });

      setConversationId(conv.id);
      setMessages([]);
    } catch (err) {
      console.error('Failed to create conversation:', err);
      setError('Не удалось создать беседу');
    }
  }

  async function loadMessages(convId: string) {
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });
      if (data) setMessages(data as Message[]);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }

  // Realtime subscription for bot responses
  useEffect(() => {
    if (!conversationId || !bot) return;

    const channel = supabase
      .channel(`bot-rt:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.sender_type === 'bot') {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, bot]);

  const handleSend = async () => {
    if (!inputText.trim() || !conversationId || !bot || sending) return;

    const text = inputText.trim();
    setInputText('');

    try {
      const result = await sendMessage(text);
      if (!result?.id) {
        // Ручное добавление при неудаче
        setMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            conversation_id: conversationId,
            sender_id: 'user',
            sender_type: 'user',
            content_type: 'text',
            content: { text },
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.error('Send failed:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          conversation_id: conversationId,
          sender_id: 'user',
          sender_type: 'user',
          content_type: 'text',
          content: { text },
          created_at: new Date().toISOString(),
        },
      ]);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !bot) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4 gap-4">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">Бот не найден</h2>
          <p className="text-muted-foreground mb-4">
            {error || 'Бот с таким username не существует или отключён.'}
          </p>
          <button
            onClick={() => navigate('/bots')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            К списку ботов
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b shrink-0 bg-background/95 backdrop-blur-sm">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-accent rounded-lg transition-colors"
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
          {bot.avatar_url ? (
            <img src={bot.avatar_url} alt={bot.display_name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-primary text-lg font-bold">{bot.display_name[0]}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold truncate">{bot.display_name}</h2>
          <p className="text-xs text-muted-foreground">@{bot.username} · бот</p>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <BotIcon className="w-8 h-8 text-primary/60" />
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">
              Начните диалог с <span className="font-medium">@{bot.username}</span>
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-1">
{messages.map((msg) => {
               const isBot = msg.sender_type === 'bot';

               return (
                 <div
                   key={msg.id}
                   className={cn(
                     "flex gap-2 max-w-[80%] group items-end",
                     isBot ? "flex-row" : "flex-row-reverse ml-auto"
                   )}
                 >
                   {!isBot && (
                     <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden text-[10px] font-semibold text-primary">
                       Вы
                     </div>
                   )}
                   <div
                     className={cn(
                       "px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words max-w-full",
                       isBot
                         ? "bg-secondary text-secondary-foreground rounded-bl-sm"
                         : "bg-primary text-primary-foreground rounded-br-sm"
                     )}
                   >
                     <BotMessageContent
                       content={msg.content as Record<string, unknown>}
                       contentType={msg.content_type}
                       metadata={msg.metadata as Record<string, unknown> | undefined}
                     />
                   </div>
                   <div className={cn(
                     "w-7 h-7 rounded-full flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
                     isBot ? "" : "order-first"
                   )}>
                     {isBot ? (
                       <BotIcon className="w-3 h-3 text-muted-foreground" />
                     ) : (
                       <span className="text-[10px] font-semibold text-primary">Вы</span>
                     )}
                   </div>
                 </div>
               );
             })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
<div className="p-3 border-t shrink-0 bg-background/95 backdrop-blur-sm">
         <div className="flex gap-2 items-center">
           <textarea
             ref={inputRef}
             value={inputText}
             onChange={(e) => setInputText(e.target.value)}
             onKeyDown={handleKeyDown}
             placeholder="Написать боту..."
             rows={1}
             className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors max-h-24"
           />
           <button
             onClick={handleSend}
             disabled={sending || !inputText.trim()}
             className="rounded-xl bg-primary px-4 py-2.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all duration-200 flex items-center gap-1.5 shadow-sm shadow-primary/20 shrink-0"
           >
             {sending ? (
               <Loader2 className="w-4 h-4 animate-spin" />
             ) : (
               <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                 <line x1="22" y1="2" x2="11" y2="13" />
                 <polygon points="22 2 15 22 11 13 2 9 22 2" />
               </svg>
             )}
             <span className="text-sm font-medium hidden sm:inline">Отправить</span>
           </button>
         </div>
       </div>
    </div>
  );
}

export default BotChatPage;