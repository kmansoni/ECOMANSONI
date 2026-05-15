/**
 * BotPage — публичная страница бота (/bot/:username)
 * SEO-friendly, адаптивная мобильная вёрстка, с чатом и отзывами.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot as BotIcon, Star, Clock, MessageCircle, Zap, Shield, ExternalLink, Send, Image as ImageIcon, FileText, Smile, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { botApi } from '@/lib/bots/api';
import { useBotSend, useRealtimeBotMessages } from '@/hooks/useBotSend';
import { BotMessageContent } from '@/components/bots/BotMessageContent';
import { supabase } from '@/integrations/supabase/client';

interface BotPageProps {}

const CATEGORY_LABELS: Record<string, string> = {
  productivity: 'Продуктивность',
  entertainment: 'Развлечения',
  education: 'Образование',
  business: 'Бизнес',
  utility: 'Утилиты',
  social: 'Социальные',
  games: 'Игры',
  ai: 'AI',
};

const CATEGORY_COLORS: Record<string, string> = {
  productivity: 'bg-blue-500/20 text-blue-400',
  entertainment: 'bg-purple-500/20 text-purple-400',
  education: 'bg-green-500/20 text-green-400',
  business: 'bg-yellow-500/20 text-yellow-400',
  utility: 'bg-cyan-500/20 text-cyan-400',
  social: 'bg-pink-500/20 text-pink-400',
  games: 'bg-red-500/20 text-red-400',
  ai: 'bg-indigo-500/20 text-indigo-400',
};

export function BotPage({}: BotPageProps) {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();

  const [bot, setBot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const chatContainerRef = React.useRef<HTMLDivElement>(null);

  const { sendMessage, sending } = useBotSend(conversationId || undefined, bot?.id || '');

  // Realtime bot message subscription via dedicated hook
  useRealtimeBotMessages(conversationId || '', bot?.id || '', (newMsg) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === newMsg.id)) return prev;
      return [...prev, newMsg];
    });
  });

  useEffect(() => {
    if (username) void loadBot();
  }, [username]);

  useEffect(() => {
    if (!sending) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, sending]);

  // Показываем кнопку прокрутки при overflow
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const check = () => setShowScrollBtn(el.scrollHeight > el.clientHeight + 100);
    const observer = new ResizeObserver(check);
    observer.observe(el);
    el.addEventListener('scroll', check);
    return () => { observer.disconnect(); el.removeEventListener('scroll', check); };
  }, [messages]);

  async function loadBot() {
    try {
      setLoading(true);
      const data = await botApi.getBotByUsername(username);
      setBot(data);

      // Ищем или создаём conversation
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: conversations } = await supabase
          .from('conversations')
          .select('*')
          .eq('is_bot_chat', true)
          .eq('bot_id', data.id)
          .limit(1);

        if (conversations && conversations.length > 0) {
          setConversationId(conversations[0].id);
          await loadMessages(conversations[0].id);
        } else {
          const { data: conv } = await supabase
            .from('conversations')
            .insert({
              is_bot_chat: true,
              title: data.display_name,
              bot_id: data.id,
              type: 'private',
            })
            .select()
            .single();
          if (conv) {
            setConversationId(conv.id);
            await supabase.from('conversation_participants').insert({
              conversation_id: conv.id,
              user_id: user.id,
            });
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Бот не найден');
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
    } catch {}
  }

  const handleSend = async () => {
    if (!inputText.trim() || !conversationId || !bot) return;

    const text = inputText.trim();
    setInputText('');

    const result = await sendMessage(text);

    // Add user message optimistically — sendMessage already invalidates queries
    if (result?.id) {
      setMessages((prev: any[]) => [
        ...prev,
        {
          id: result.id,
          conversation_id: conversationId,
          sender_id: 'current-user',
          sender_type: 'user',
          content_type: 'text',
          content: { text },
          created_at: new Date().toISOString(),
          metadata: {},
        },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !bot) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 gap-4">
        <div className="text-center max-w-md">
          <BotIcon className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
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

  const avgRating = bot.avg_rating ?? 0;
  const categoryLabel = CATEGORY_LABELS[bot.category as string] || bot.category || 'Другое';
  const categoryColor = CATEGORY_COLORS[bot.category as string] || CATEGORY_COLORS.default;
  const botUrl = `${window.location.origin}/bot/${bot.username}`;

  return (
    <div className="min-h-screen bg-background">
      {/* SEO Head */}
      <title>{bot.display_name} (@{bot.username}) — Bot Marketplace</title>
      <meta name="description" content={bot.description || `Чат-бот ${bot.display_name}`} />
      <meta property="og:title" content={bot.display_name} />
      <meta property="og:description" content={bot.description || `Чат-бот ${bot.display_name}`} />
      {bot.avatar_url && <meta property="og:image" content={bot.avatar_url} />}
      <meta property="og:url" content={botUrl} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={bot.display_name} />
      <meta name="twitter:description" content={bot.description || `Чат-бот ${bot.display_name}`} />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            aria-label="Назад"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold truncate">{bot.display_name}</h1>
          <button
            onClick={() => navigator.clipboard.writeText(botUrl)}
            className="p-2 hover:bg-accent rounded-lg transition-colors ml-auto"
            title="Поделиться"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Profile banner */}
        <div className="bg-card border rounded-2xl p-5 sm:p-6">
          <div className="flex gap-4 sm:gap-5 items-start">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
              {bot.avatar_url ? (
                <img src={bot.avatar_url} alt={bot.display_name} className="w-full h-full object-cover" />
              ) : (
                <BotIcon className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold truncate">{bot.display_name}</h2>
                {bot.is_verified && (
                  <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0">
                    <Zap className="w-3 h-3" /> Верифицирован
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">@{bot.username}</p>
              {bot.description && (
                <p className="text-sm mt-2 leading-relaxed">{bot.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 shrink-0">
                  <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                  {avgRating.toFixed(1)}
                </span>
                {bot.total_reviews != null && (
                  <span className="shrink-0">{bot.total_reviews} отзывов</span>
                )}
                <span className="flex items-center gap-1 shrink-0">
                  <MessageCircle className="w-3.5 h-3.5" />
                  {bot.message_count ?? 0} сообщений
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                  {categoryLabel}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Chat with bot */}
        <div className="bg-card border rounded-2xl overflow-hidden flex flex-col" style={{ height: 'min(550px, 60vh)' }}>
          <div className="px-4 py-3 border-b shrink-0 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <h3 className="text-sm font-medium">Чат с @{bot.username}</h3>
            </div>
          </div>
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 scroll-smooth"
          >
            {messages.length === 0 && !sending && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <BotIcon className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm font-medium">Нет сообщений</p>
                <p className="text-xs">Напишите что-нибудь боту...</p>
              </div>
            )}
            {messages.map((msg: any) => {
              const isBot = msg.sender_type === 'bot';
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-2 max-w-[85%] sm:max-w-[80%] group animate-in fade-in slide-in-from-bottom-2",
                    isBot ? "mr-auto flex-col" : "ml-auto flex-col items-end"
                  )}
                >
                  <div
                    className={cn(
                      "px-3.5 py-2.5 rounded-2xl text-sm break-words max-w-full leading-relaxed",
                      isBot
                        ? "bg-secondary text-secondary-foreground rounded-bl-sm rounded-br-2xl"
                        : "bg-primary text-primary-foreground rounded-br-sm rounded-bl-2xl"
                    )}
                  >
                    <BotMessageContent
                      content={msg.content || {}}
                      contentType={msg.content_type || 'text'}
                      metadata={msg.metadata}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 px-1 select-none">
                    {new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {showScrollBtn && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-16 right-4 p-1.5 rounded-full bg-primary/80 text-primary-foreground shadow-lg hover:bg-primary transition-colors z-10"
              aria-label="Прокрутить вниз"
            >
              <ChevronUp className="w-4 h-4 rotate-180" />
            </button>
          )}

          <div className="p-3 border-t shrink-0 bg-background/95 backdrop-blur-sm">
            {bot.status === 'paused' && (
              <p className="text-xs text-muted-foreground text-center mb-2 italic">
                ⚠️ Бот на паузе — ответы могут быть отложены
              </p>
            )}
            <div className="flex gap-2">
              <input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Написать боту..."
                className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors max-h-24"
              />
              <button
                onClick={handleSend}
                disabled={sending || !inputText.trim()}
                className="rounded-xl bg-primary px-5 py-2.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors text-sm font-medium whitespace-nowrap shadow-sm shadow-primary/20 flex items-center gap-1.5"
              >
                {sending ? (
                  <Send className="w-4 h-4 animate-pulse" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">Отправить</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* About */}
        {bot.about && (
          <div className="bg-card border rounded-2xl p-5 sm:p-6">
            <h3 className="font-semibold mb-2">О боте</h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{bot.about}</p>
          </div>
        )}

        {/* Reviews */}
        {bot.reviews && bot.reviews.length > 0 && (
          <div className="bg-card border rounded-2xl p-5 sm:p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Star className="w-4 h-4 fill-primary text-primary" />
              Отзывы ({bot.reviews.length})
            </h3>
            <div className="space-y-4">
              {bot.reviews.map((review: any, idx: number) => (
                <div key={idx} className="border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          className={cn(
                            "w-3.5 h-3.5",
                            i <= Math.round(review.rating || 0)
                              ? "fill-primary text-primary"
                              : "text-muted"
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-medium">{review.author_name || 'Аноним'}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(review.created_at).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="text-sm text-muted-foreground mt-1">{review.comment}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default BotPage;