import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, UserPlus, Check, Loader2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCollabReels } from '@/hooks/useCollabReels';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface UserResult {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
}

interface CollabInviteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reelId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function CollabInviteSheet({ open, onOpenChange, reelId }: CollabInviteSheetProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const { invite, loading } = useCollabReels();

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await db
        .from('profiles')
        .select('id, display_name, avatar_url, username')
        .or(`display_name.ilike.%${q}%,username.ilike.%${q}%`)
        .limit(15);

      if (error) {
        logger.error('[CollabInviteSheet] Ошибка поиска пользователей', { error });
        return;
      }
      setResults((data ?? []) as UserResult[]);
    } catch (err) {
      logger.error('[CollabInviteSheet] Ошибка поиска', { error: err });
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setQuery(value);
    if (value.trim().length >= 2) {
      void searchUsers(value);
    } else {
      setResults([]);
    }
  };

  const handleInvite = useCallback(async (userId: string) => {
    try {
      await invite(reelId, userId);
      setInvitedIds((prev) => new Set([...prev, userId]));
    } catch {
      toast.error('Не удалось пригласить');
    }
  }, [invite, reelId]);

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setInvitedIds(new Set());
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Пригласить соавтора
          </SheetTitle>
        </SheetHeader>

        {/* Поиск */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Поиск по имени или @username"
            className="pl-10 min-h-[44px]"
            aria-label="Поиск пользователей для коллаборации"
          />
        </div>

        {/* Результаты */}
        <div className="space-y-1 pb-safe">
          {searching && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Пользователи не найдены
            </div>
          )}

          <AnimatePresence>
            {results.map((user) => {
              const alreadyInvited = invitedIds.has(user.id);
              return (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <img
                    src={user.avatar_url ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name ?? 'U')}&background=random`}
                    alt={user.display_name ?? ''}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user.display_name ?? 'Пользователь'}
                    </p>
                    {user.username && (
                      <p className="text-xs text-muted-foreground">@{user.username}</p>
                    )}
                  </div>
                  <Button
                    variant={alreadyInvited ? 'secondary' : 'default'}
                    size="sm"
                    onClick={() => handleInvite(user.id)}
                    disabled={alreadyInvited || loading}
                    className="min-h-[44px] min-w-[44px]"
                    aria-label={alreadyInvited ? 'Приглашение отправлено' : `Пригласить ${user.display_name ?? 'пользователя'}`}
                  >
                    {alreadyInvited ? (
                      <Check className="w-4 h-4" />
                    ) : loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                  </Button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </SheetContent>
    </Sheet>
  );
}
