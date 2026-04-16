import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, UserPlus, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCollabs } from '@/hooks/useCollabs';
import { toast } from 'sonner';

interface UserResult {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
}

interface CollabInviteProps {
  postId: string;
  onClose: () => void;
}

export function CollabInvite({ postId, onClose }: CollabInviteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const { inviteCollab, loading } = useCollabs();

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, username')
        .ilike('display_name', `%${q}%`)
        .limit(10);
      setResults((data ?? []) as UserResult[]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (!value.trim()) setResults([]);
    else searchUsers(value);
  };

  const handleInvite = async (user: UserResult) => {
    try {
      await inviteCollab(postId, user.id);
      setInvitedIds(prev => new Set([...prev, user.id]));
      toast.success(`Приглашение отправлено ${user.display_name ?? user.id}`);
    } catch {
      toast.error('Не удалось отправить приглашение');
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-4 pb-8"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-lg">Пригласить соавтора</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              onInput={e => searchUsers((e.target as HTMLInputElement).value)}
              placeholder="Поиск по имени..."
              className="w-full bg-zinc-800 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 transition-colors"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 animate-spin" />
            )}
          </div>

          {/* Results */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {results.length === 0 && query.trim() && !searching && (
              <p className="text-zinc-500 text-sm text-center py-4">Пользователи не найдены</p>
            )}
            {results.map(user => {
              const isInvited = invitedIds.has(user.id);
              return (
                <div
                  key={user.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <img loading="lazy"
                    src={user.avatar_url ?? `https://i.pravatar.cc/150?u=${user.id}`}
                    alt={user.display_name ?? ''}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">
                      {user.display_name ?? 'Пользователь'}
                    </p>
                    {user.username && (
                      <p className="text-zinc-500 text-xs">@{user.username}</p>
                    )}
                  </div>
                  <button
                    onClick={() => !isInvited && handleInvite(user)}
                    disabled={isInvited || loading}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      isInvited
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {isInvited ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Отправлено
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        Пригласить
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
