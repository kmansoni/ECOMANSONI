import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Edit3, Archive } from 'lucide-react';
import { supabase, dbLoose } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useE2EEncryption } from '@/hooks/useE2EEncryption';
import type { EncryptedPayload } from '@/hooks/useE2EEncryption';
import { NotesBar } from '@/components/chat/NotesBar';

interface ChatItem {
  id: string;
  other_user: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string;
    is_online?: boolean;
  };
  last_message?: {
    content: string;
    media_type?: string;
    created_at: string;
    sender_id: string;
  };
  unread_count: number;
}

interface ParticipantRow {
  conversation_id: string;
}

interface MessageRow {
  conversation_id: string;
  content?: string | null;
  media_type?: string | null;
  created_at?: string | null;
  sender_id?: string | null;
}

interface ProfileRow {
  id: string;
  username: string;
  full_name: string;
  avatar_url?: string;
}

interface ConversationParticipantRow {
  conversation_id: string;
  profiles?: ProfileRow | null;
}

function parseEncryptedPayload(content: unknown): EncryptedPayload | null {
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<EncryptedPayload>;
    const isValid = (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.v === 'number' &&
      typeof parsed.iv === 'string' &&
      typeof parsed.ct === 'string' &&
      typeof parsed.tag === 'string' &&
      typeof parsed.epoch === 'number' &&
      typeof parsed.kid === 'string'
    );
    return isValid ? (parsed as EncryptedPayload) : null;
  } catch (_err) {
    return null;
  }
}

function getLastMessagePreview(msg?: ChatItem['last_message'], currentUserId?: string, fallbackText?: string) {
  if (!msg) return 'Начните переписку';
  const prefix = msg.sender_id === currentUserId ? 'Вы: ' : '';
  switch (msg.media_type) {
    case 'voice': return `${prefix}🎤 Голосовое`;
    case 'image': return `${prefix}📷 Фото`;
    case 'video': return `${prefix}🎬 Видео`;
    case 'gif': return `${prefix}GIF`;
    default: return `${prefix}${fallbackText ?? msg.content ?? 'Начните переписку'}`;
  }
}

function ChatListPreview({ chat, currentUserId }: { chat: ChatItem; currentUserId?: string }) {
  const encryptedPayload = parseEncryptedPayload(chat.last_message?.content);
  const senderId = chat.last_message?.sender_id;
  const { decryptContent } = useE2EEncryption(chat.id);
  const [decryptedText, setDecryptedText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDecryptedText(null);

    if (!encryptedPayload || !senderId) return;

    const run = async () => {
      const plain = await decryptContent(encryptedPayload, senderId);
      if (!cancelled) {
        setDecryptedText(plain && plain.trim() ? plain : 'Зашифрованное сообщение');
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [decryptContent, encryptedPayload, senderId]);

  const fallback = encryptedPayload
    ? (decryptedText || 'Зашифрованное сообщение')
    : (chat.last_message?.content || 'Начните переписку');

  return <>{getLastMessagePreview(chat.last_message, currentUserId, fallback)}</>;
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const dayMs = 86400000;

  if (diff < dayMs && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  } else if (diff < 2 * dayMs) {
    return 'вчера';
  } else {
    return date.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
  }
}

function ChatListItem({
  chat,
  onPress,
  onArchive,
}: {
  chat: ChatItem;
  onPress: () => void;
  onArchive: () => void;
}) {
  const { user } = useAuth();
  const [dragX, setDragX] = useState(0);

  return (
    <div className="relative overflow-hidden">
      {/* Фон свайпа */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end px-4 bg-red-500/20">
        <button
          onClick={onArchive}
          className="flex items-center gap-1 text-red-400 text-sm"
        >
          <Archive className="w-4 h-4" />
        </button>
      </div>

      <motion.div
        drag="x"
        dragConstraints={{ left: -80, right: 0 }}
        dragElastic={0.1}
        onDragEnd={(_, info) => {
          if (info.offset.x < -60) onArchive();
          setDragX(0);
        }}
        animate={{ x: dragX }}
        onClick={onPress}
        className="relative flex items-center gap-3 px-4 py-3 bg-zinc-950 hover:bg-zinc-900 active:bg-zinc-800 cursor-pointer transition-colors"
        style={{ touchAction: 'pan-y' }}
      >
        {/* Аватар с онлайн-индикатором */}
        <div className="relative flex-shrink-0">
          {chat.other_user.avatar_url ? (
            <img
              src={chat.other_user.avatar_url}
              alt=""
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white font-semibold text-lg">
              {chat.other_user.username?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          {chat.other_user.is_online && (
            <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-zinc-950" />
          )}
        </div>

        {/* Инфо */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-white font-medium text-sm truncate">
              {chat.other_user.full_name || chat.other_user.username}
            </p>
            {chat.last_message && (
              <span className="text-zinc-500 text-xs flex-shrink-0 ml-2">
                {formatTime(chat.last_message.created_at)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-zinc-500 text-xs truncate flex-1">
              <ChatListPreview chat={chat} currentUserId={user?.id} />
            </p>
            {chat.unread_count > 0 && (
              <span className="flex-shrink-0 ml-2 min-w-[18px] h-[18px] rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                {chat.unread_count > 99 ? '99+' : chat.unread_count}
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function ChatPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadChats = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Получаем разговоры пользователя
      const { data: participants } = await dbLoose
        .from('conversation_participants')
        .select(`
          conversation_id,
          conversations(id, updated_at),
          profiles!conversation_participants_user_id_fkey(
            id, username, full_name, avatar_url
          )
        `)
        .eq('user_id', user.id)
        .order('conversation_id');

      if (!participants) {
        setIsLoading(false);
        return;
      }

      // Получаем второго участника каждого разговора
      const conversationIds = (participants as unknown as ParticipantRow[]).map((p) => p.conversation_id);

      if (conversationIds.length === 0) {
        setChats([]);
        setIsLoading(false);
        return;
      }

      // Получаем всех участников
      const { data: allParticipants } = await dbLoose
        .from('conversation_participants')
        .select('conversation_id, user_id, profiles(id, username, full_name, avatar_url)')
        .in('conversation_id', conversationIds)
        .neq('user_id', user.id);

      // Получаем последние сообщения
      const { data: lastMessages } = await dbLoose
        .from('messages')
        .select('conversation_id, content, media_type, created_at, sender_id')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false });

      // Считаем непрочитанные
      const { data: unreadData } = await dbLoose
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', conversationIds)
        .neq('sender_id', user.id)
        .is('read_at', null);

      const unreadMap: Record<string, number> = {};
      if (unreadData) {
        for (const m of unreadData as { conversation_id: string }[]) {
          unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] ?? 0) + 1;
        }
      }

      const lastMsgMap: Record<string, MessageRow> = {};
      if (lastMessages) {
        for (const m of lastMessages as unknown as MessageRow[]) {
          if (!lastMsgMap[m.conversation_id]) {
            lastMsgMap[m.conversation_id] = m;
          }
        }
      }

      const otherUserMap: Record<string, ProfileRow> = {};
      if (allParticipants) {
        for (const p of allParticipants as unknown as ConversationParticipantRow[]) {
          if (!otherUserMap[p.conversation_id] && p.profiles) {
            otherUserMap[p.conversation_id] = p.profiles;
          }
        }
      }

      const chatItems: ChatItem[] = conversationIds
        .filter((cid: string) => otherUserMap[cid])
        .map((cid: string) => {
          const rawMessage = lastMsgMap[cid];
          const normalizedMessage = rawMessage
            ? {
                content: String(rawMessage.content ?? ""),
                media_type: rawMessage.media_type ? String(rawMessage.media_type) : undefined,
                created_at: String(rawMessage.created_at ?? ""),
                sender_id: String(rawMessage.sender_id ?? ""),
              }
            : undefined;

          return {
            id: cid,
            other_user: {
              ...otherUserMap[cid],
              is_online: false,
            },
            last_message: normalizedMessage,
            unread_count: unreadMap[cid] ?? 0,
          };
        });

      // Сортируем по дате последнего сообщения
      chatItems.sort((a, b) => {
        const ta = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : 0;
        const tb = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : 0;
        return tb - ta;
      });

      setChats(chatItems);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Realtime обновление списка
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('chats-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () =>
        loadChats()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, loadChats]);

  const filteredChats = search
    ? chats.filter((c) =>
        c.other_user.username?.toLowerCase().includes(search.toLowerCase()) ||
        c.other_user.full_name?.toLowerCase().includes(search.toLowerCase())
      )
    : chats;

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3">
        <h1 className="text-white text-xl font-bold">Сообщения</h1>
        <button
          onClick={() => navigate('/chats/new')}
          className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
        >
          <Edit3 className="w-5 h-5" />
        </button>
      </div>

      {/* Поиск */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5">
          <Search className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск"
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-zinc-500"
          />
          <AnimatePresence>
            {search && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setSearch('')}
                className="text-zinc-500 hover:text-white text-xs"
              >
                ✕
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Notes bar */}
      <NotesBar chatUserIds={chats.map(c => c.other_user.id)} />

      {/* Список чатов */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="w-12 h-12 rounded-full bg-zinc-800 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-zinc-800 rounded animate-pulse w-1/3" />
                  <div className="h-3 bg-zinc-800 rounded animate-pulse w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 pb-20">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
              <Edit3 className="w-7 h-7 text-zinc-600" />
            </div>
            <p className="text-zinc-500 text-sm text-center">
              {search ? 'Ничего не найдено' : 'Нет сообщений.\nНачните переписку!'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {filteredChats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                onPress={() => navigate(`/chat/${chat.id}`)}
                onArchive={() => {
                  // Архивировать / удалить
                  setChats((prev) => prev.filter((c) => c.id !== chat.id));
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
