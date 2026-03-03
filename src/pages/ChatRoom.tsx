import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  MoreVertical,
  Send,
  Image as ImageIcon,
  Smile,
  Check,
  CheckCheck,
  Phone,
  Video,
  MapPin,
  Palette,
  BellOff,
  Pencil,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useVanishMode } from '@/hooks/useVanishMode';
import { useVoiceMessage } from '@/hooks/useVoiceMessage';
import { VanishModeIndicator } from '@/components/chat/VanishModeIndicator';
import { VoiceRecorder } from '@/components/chat/VoiceRecorder';
import { VoiceMessageBubble } from '@/components/chat/VoiceMessageBubble';
import { MessageReactions, useMessageReactions } from '@/components/chat/MessageReactions';
import { ReplyPreview, ReplyQuote } from '@/components/chat/ReplyPreview';
import { LocationShareSheet } from '@/components/chat/LocationShareSheet';
import { ChatThemePicker, CHAT_THEMES } from '@/components/chat/ChatThemePicker';
import type { ThemeId } from '@/components/chat/ChatThemePicker';
import { MessageEffect } from '@/components/chat/MessageEffect';
import { toast } from 'sonner';

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  read_at?: string;
  delivered_at?: string;
  media_type?: string;
  media_url?: string;
  reply_to?: string;
  is_vanish?: boolean;
  voice_data?: {
    duration_seconds: number;
    waveform: number[];
  };
}

interface Conversation {
  id: string;
  other_user?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string;
  };
}

function MessageBubble({
  message,
  isOwn,
  replyMessage,
  voiceState,
}: {
  message: Message;
  isOwn: boolean;
  replyMessage?: Message | null;
  voiceState: ReturnType<typeof useVoiceMessage>;
}) {
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const { reactions, showPicker, setShowPicker, loadReactions } = useMessageReactions(message.id);

  useEffect(() => {
    loadReactions();
  }, [loadReactions]);

  const handleTouchStart = () => {
    const t = setTimeout(() => setShowPicker(true), 600);
    setLongPressTimer(t);
  };

  const handleTouchEnd = () => {
    if (longPressTimer) clearTimeout(longPressTimer);
    setLongPressTimer(null);
  };

  const isVoice = message.media_type === 'voice';

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1`}>
      <div className="relative max-w-[75%]">
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseUp={handleTouchEnd}
          onMouseLeave={handleTouchEnd}
          className={`relative rounded-2xl px-3 py-2 ${
            isOwn
              ? 'bg-blue-600 rounded-br-sm'
              : 'bg-zinc-800 rounded-bl-sm'
          }`}
        >
          {/* Цитата */}
          {replyMessage && (
            <ReplyQuote
              replyTo={{
                id: replyMessage.id,
                content: replyMessage.content,
                senderName: isOwn ? 'Вы' : 'Собеседник',
                mediaType: replyMessage.media_type,
              }}
            />
          )}

          {/* Контент сообщения */}
          {isVoice && message.voice_data ? (
            <VoiceMessageBubble
              audioUrl={message.media_url!}
              duration={message.voice_data.duration_seconds}
              waveform={message.voice_data.waveform}
              isOwnMessage={isOwn}
              isListened={!!message.read_at}
              isPlaying={
                voiceState.isPlaying && voiceState.currentPlayingId === message.id
              }
              playbackProgress={
                voiceState.currentPlayingId === message.id
                  ? voiceState.playbackProgress
                  : 0
              }
              onPlay={() => voiceState.playVoiceMessage(message.media_url!, message.id)}
              onPause={voiceState.pauseVoiceMessage}
            />
          ) : (
            <div className="flex items-end gap-2 flex-wrap">
              <p className="text-white text-sm leading-relaxed break-words">{message.content}</p>
              <div className="flex items-center gap-0.5 ml-auto mt-0.5 flex-shrink-0">
                <span className="text-white/50 text-[10px]">
                  {new Date(message.created_at).toLocaleTimeString('ru', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {isOwn && (
                  message.read_at ? (
                    <CheckCheck className="w-3.5 h-3.5 text-blue-300" />
                  ) : message.delivered_at ? (
                    <CheckCheck className="w-3.5 h-3.5 text-white/40" />
                  ) : (
                    <Check className="w-3.5 h-3.5 text-white/40" />
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {/* Реакции */}
        <MessageReactions
          messageId={message.id}
          reactions={reactions}
          showPicker={showPicker}
          onPickerClose={() => setShowPicker(false)}
          onReactionChange={loadReactions}
        />
      </div>
    </div>
  );
}

export default function ChatRoom() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const { isVanishMode, toggleVanishMode } = useVanishMode(conversationId ?? '');
  const voiceState = useVoiceMessage();
  const [showLocationSheet, setShowLocationSheet] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [chatTheme, setChatTheme] = useState<ThemeId>('default');
  const [chatEmoji, setChatEmoji] = useState('❤️');
  const [activeEffect, setActiveEffect] = useState<'confetti' | 'fire' | 'hearts' | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isSilent, setIsSilent] = useState(false);

  // Загрузка беседы
  useEffect(() => {
    if (!conversationId || !user) return;

    const loadConversation = async () => {
      const { data } = await (supabase as any)
        .from('conversations')
        .select(`
          id,
          conversation_participants!inner(
            user_id,
            profiles(id, username, full_name, avatar_url)
          )
        `)
        .eq('id', conversationId)
        .single();

      if (data) {
        const participants = (data as any).conversation_participants ?? [];
        const other = participants.find((p: any) => p.user_id !== user.id);
        setConversation({
          id: data.id,
          other_user: other?.profiles,
        });
      }
    };

    loadConversation();
  }, [conversationId, user]);

  // Загрузка сообщений
  const loadMessages = useCallback(async () => {
    if (!conversationId) return;

    const { data } = await (supabase as any)
      .from('messages')
      .select('*, voice_messages(duration_seconds, waveform)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (data) {
      const msgs = (data as any[]).map((m) => ({
        ...m,
        voice_data: m.voice_messages?.[0] ?? null,
      }));
      setMessages(msgs);
    }
  }, [conversationId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Realtime подписка на новые сообщения
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => loadMessages()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, loadMessages]);

  // Typing indicator через Realtime
  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = supabase.channel(`typing:${conversationId}`);
    typingChannelRef.current = channel;

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        if (payload.user_id !== user.id) {
          setOtherTyping(true);
          setTimeout(() => setOtherTyping(false), 3000);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  // Прокрутка вниз при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleTextChange = (val: string) => {
    setText(val);
    // Отправляем typing event
    if (typingChannelRef.current && user) {
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: user.id },
      });
    }
  };

  const sendMessage = useCallback(async () => {
    if (!text.trim() || !conversationId || !user) return;

    const content = text.trim();
    setText('');

    await (supabase as any).from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      reply_to: replyTo?.id ?? null,
      is_vanish: isVanishMode,
    });

    setReplyTo(null);
  }, [text, conversationId, user, replyTo, isVanishMode]);

  const handleVoiceStop = useCallback(async () => {
    if (!conversationId) return;
    const result = await voiceState.stopRecording();
    await voiceState.sendVoiceMessage(
      conversationId,
      result.blob,
      result.duration,
      result.waveform
    );
    await loadMessages();
  }, [conversationId, voiceState, loadMessages]);

  const getReplyMessage = (msg: Message) => {
    if (!msg.reply_to) return null;
    return messages.find((m) => m.id === msg.reply_to) ?? null;
  };

  const editMessage = useCallback(async (msgId: string, newContent: string) => {
    await (supabase as any)
      .from('messages')
      .update({ content: newContent, edited_at: new Date().toISOString() })
      .eq('id', msgId);
    setEditingMessageId(null);
    setEditText('');
    await loadMessages();
  }, [loadMessages]);

  const themeObj = CHAT_THEMES.find(t => t.id === chatTheme) ?? CHAT_THEMES[0];
  const vanishBg = isVanishMode
    ? 'bg-gradient-to-b from-violet-950 via-zinc-950 to-black'
    : `bg-gradient-to-b ${themeObj.gradient}`;

  return (
    <div className={`flex flex-col h-screen ${vanishBg} transition-colors duration-500`}>
      <MessageEffect type={activeEffect} onComplete={() => setActiveEffect(null)} />
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b ${isVanishMode ? 'border-violet-500/20 bg-violet-950/40' : 'border-zinc-800 bg-zinc-900'} transition-colors duration-500`}>
        <button
          onClick={() => navigate(-1)}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="relative">
            {conversation?.other_user?.avatar_url ? (
              <img
                src={conversation.other_user.avatar_url}
                alt=""
                className="w-9 h-9 rounded-full object-cover"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-white text-sm font-medium">
                {conversation?.other_user?.username?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            {isOnline && (
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-zinc-900" />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate">
              {conversation?.other_user?.full_name ||
                conversation?.other_user?.username ||
                'Загрузка...'}
            </p>
            <p className="text-xs text-zinc-400 truncate">
              {otherTyping ? (
                <span className="text-green-400">печатает...</span>
              ) : isOnline ? (
                'в сети'
              ) : (
                '@' + (conversation?.other_user?.username ?? '')
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="text-zinc-400 hover:text-white transition-colors">
            <Phone className="w-5 h-5" />
          </button>
          <button className="text-zinc-400 hover:text-white transition-colors">
            <Video className="w-5 h-5" />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            <AnimatePresence>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
                  <motion.div
                    className="absolute right-0 top-full mt-1 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-40 overflow-hidden"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                  >
                    <button
                      onClick={() => {
                        toggleVanishMode();
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2"
                    >
                      {isVanishMode ? '👁 Выключить Vanish Mode' : '👁‍🗨 Vanish Mode'}
                    </button>
                    <button
                      onClick={() => { setShowThemePicker(true); setShowMenu(false); }}
                      className="w-full text-left px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2"
                    >
                      <Palette className="w-4 h-4" /> Тема чата
                    </button>
                    <button
                      onClick={() => { setIsSilent(s => !s); setShowMenu(false); }}
                      className="w-full text-left px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2"
                    >
                      <BellOff className="w-4 h-4" /> {isSilent ? 'Обычный режим' : 'Тихий режим'}
                    </button>
                    <button className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-zinc-700">
                      Очистить чат
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Vanish Mode индикатор */}
      <VanishModeIndicator isActive={isVanishMode} onToggle={toggleVanishMode} />

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm">Начните переписку</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.sender_id === user?.id}
            replyMessage={getReplyMessage(msg)}
            voiceState={voiceState}
          />
        ))}

        {/* Typing indicator */}
        <AnimatePresence>
          {otherTyping && (
            <motion.div
              className="flex justify-start mb-1"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-zinc-400"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className={`border-t ${isVanishMode ? 'border-violet-500/20 bg-violet-950/30' : 'border-zinc-800 bg-zinc-900'} transition-colors duration-500`}>
        {/* Reply preview */}
        <ReplyPreview
          replyTo={
            replyTo
              ? {
                  id: replyTo.id,
                  content: replyTo.content,
                  senderName:
                    replyTo.sender_id === user?.id ? 'Вы' : conversation?.other_user?.username ?? '',
                  mediaType: replyTo.media_type,
                }
              : null
          }
          onCancel={() => setReplyTo(null)}
        />

        <div className="flex items-end gap-2 px-3 py-2">
          {/* Медиакнопка */}
          <button className="flex-shrink-0 mb-1 text-zinc-400 hover:text-white transition-colors">
            <ImageIcon className="w-5 h-5" />
          </button>
          {/* Location button */}
          <button
            onClick={() => setShowLocationSheet(true)}
            className="flex-shrink-0 mb-1 text-zinc-400 hover:text-white transition-colors"
          >
            <MapPin className="w-5 h-5" />
          </button>

          {/* Поле ввода или запись голоса */}
          {voiceState.isRecording ? (
            <div className="flex-1">
              <VoiceRecorder
                isRecording={voiceState.isRecording}
                duration={voiceState.duration}
                waveform={voiceState.waveform}
                onStart={voiceState.startRecording}
                onStop={handleVoiceStop}
                onCancel={voiceState.cancelRecording}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-end gap-2 bg-zinc-800 rounded-2xl px-3 py-2">
              <textarea
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={isVanishMode ? '👻 Vanish Mode...' : 'Сообщение...'}
                rows={1}
                className="flex-1 bg-transparent text-white text-sm resize-none outline-none placeholder:text-zinc-500 max-h-32"
                style={{ lineHeight: '1.4' }}
              />
              <button className="flex-shrink-0 text-zinc-400 hover:text-white transition-colors">
                <Smile className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Кнопка отправки или микрофон */}
          {text.trim() ? (
            <motion.button
              onClick={sendMessage}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-400 text-white transition-colors"
              whileTap={{ scale: 0.9 }}
            >
              <Send className="w-4 h-4" />
            </motion.button>
          ) : !voiceState.isRecording ? (
            <VoiceRecorder
              isRecording={false}
              duration={0}
              waveform={[]}
              onStart={voiceState.startRecording}
              onStop={handleVoiceStop}
              onCancel={voiceState.cancelRecording}
            />
          ) : null}
        </div>
      </div>

      {/* Location share sheet */}
      {conversationId && (
        <LocationShareSheet
          isOpen={showLocationSheet}
          onClose={() => setShowLocationSheet(false)}
          conversationId={conversationId}
          onSent={loadMessages}
        />
      )}

      {/* Chat theme picker */}
      {conversationId && (
        <ChatThemePicker
          isOpen={showThemePicker}
          onClose={() => setShowThemePicker(false)}
          conversationId={conversationId}
          currentTheme={chatTheme}
          currentEmoji={chatEmoji}
          onThemeChange={(theme, emoji) => { setChatTheme(theme); setChatEmoji(emoji); }}
        />
      )}
    </div>
  );
}
