import React, { useState } from 'react';
import { Search, UserCheck, UserX, Clock } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LiveGuest } from '@/types/livestream';

const STATUS_LABELS: Record<LiveGuest['status'], string> = {
  invited: 'Приглашён',
  accepted: 'Принял',
  declined: 'Отказал',
  joined: 'В эфире',
  left: 'Ушёл',
  kicked: 'Удалён',
};

const STATUS_VARIANTS: Record<
  LiveGuest['status'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  invited: 'outline',
  accepted: 'default',
  declined: 'destructive',
  joined: 'default',
  left: 'secondary',
  kicked: 'destructive',
};

interface FollowerUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
}

interface InviteGuestSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guests: LiveGuest[];
  followers?: FollowerUser[];
  isSearching?: boolean;
  onInvite: (userId: string) => Promise<void>;
  onCancel?: (guestId: string) => Promise<void>;
  onSearch?: (query: string) => void;
}

const MAX_GUESTS = 3;

/**
 * Bottom sheet for searching and inviting guest co-hosts.
 * Shows current guest statuses and allows cancelling invitations.
 */
export function InviteGuestSheet({
  open,
  onOpenChange,
  guests,
  followers = [],
  isSearching = false,
  onInvite,
  onCancel,
  onSearch,
}: InviteGuestSheetProps) {
  const [query, setQuery] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);

  const activeGuestCount = guests.filter(
    (g) => g.status === 'invited' || g.status === 'accepted' || g.status === 'joined',
  ).length;

  const canInviteMore = activeGuestCount < MAX_GUESTS;

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    onSearch?.(e.target.value);
  };

  const handleInvite = async (userId: string) => {
    setInviting(userId);
    try {
      await onInvite(userId);
    } finally {
      setInviting(null);
    }
  };

  const alreadyInvitedIds = new Set(guests.map((g) => g.user_id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-zinc-900 text-white border-zinc-700 pb-safe max-h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-white">Пригласить гостя</SheetTitle>
          <p className="text-xs text-zinc-400">
            {activeGuestCount}/{MAX_GUESTS} гостей в эфире
          </p>
        </SheetHeader>

        {/* Current guests */}
        {guests.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              Приглашённые
            </h3>
            {guests.map((guest) => {
              const name = guest.user?.display_name || guest.user?.username || 'user';
              return (
                <div key={guest.id} className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={guest.user?.avatar_url} alt={name} />
                    <AvatarFallback>{name[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-sm text-white">{name}</span>
                  <Badge variant={STATUS_VARIANTS[guest.status]} className="text-xs">
                    {STATUS_LABELS[guest.status]}
                  </Badge>
                  {(guest.status === 'invited') && onCancel && (
                    <button
                      onClick={() => void onCancel(guest.id)}
                      className="text-zinc-400 hover:text-white"
                      aria-label="Cancel invitation"
                    >
                      <UserX className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Search */}
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" aria-hidden />
          <Input
            value={query}
            onChange={handleQueryChange}
            placeholder="Поиск по имени…"
            className="pl-9 bg-zinc-800 border-zinc-600 text-white placeholder:text-zinc-500"
            aria-label="Search followers to invite"
          />
        </div>

        {/* Followers list */}
        <div className="mt-3 space-y-2">
          {isSearching && (
            <div className="py-4 text-center text-xs text-zinc-400">Поиск…</div>
          )}
          {!isSearching && followers.length === 0 && query.length > 0 && (
            <div className="py-4 text-center text-xs text-zinc-400">Пользователи не найдены</div>
          )}
          {followers.map((user) => {
            const alreadyInvited = alreadyInvitedIds.has(user.id);
            return (
              <div key={user.id} className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user.avatar_url} alt={user.display_name} />
                  <AvatarFallback>{user.display_name[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user.display_name}</p>
                  <p className="text-xs text-zinc-400 truncate">@{user.username}</p>
                </div>
                <Button
                  size="sm"
                  variant={alreadyInvited ? 'secondary' : 'default'}
                  disabled={alreadyInvited || !canInviteMore || inviting === user.id}
                  onClick={() => void handleInvite(user.id)}
                  className={cn(
                    'shrink-0',
                    !alreadyInvited && canInviteMore && 'bg-red-600 hover:bg-red-500 text-white',
                  )}
                  aria-label={`Invite ${user.display_name}`}
                >
                  {inviting === user.id ? (
                    <Clock className="h-4 w-4 animate-spin" aria-hidden />
                  ) : alreadyInvited ? (
                    <UserCheck className="h-4 w-4" aria-hidden />
                  ) : (
                    'Пригласить'
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
