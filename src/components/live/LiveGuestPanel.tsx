import React from 'react';
import { MicOff, X, Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LiveGuest } from '@/types/livestream';

const MAX_GUESTS = 3;

interface GuestSlotProps {
  guest: LiveGuest | null;
  isHost: boolean;
  onRemove?: (guestId: string) => void;
  onInvite?: () => void;
}

const GuestSlot = React.memo(function GuestSlot({
  guest,
  isHost,
  onRemove,
  onInvite,
}: GuestSlotProps) {
  if (!guest) {
    return (
      <div className="relative flex items-center justify-center rounded-xl bg-white/5 border border-dashed border-white/20 aspect-video">
        {isHost && (
          <button
            onClick={onInvite}
            className="flex flex-col items-center gap-1 text-white/40 hover:text-white/70 transition-colors"
            aria-label="Invite guest"
          >
            <Plus className="h-6 w-6" />
            <span className="text-xs">Пригласить</span>
          </button>
        )}
      </div>
    );
  }

  const name = guest.user?.display_name || guest.user?.username || 'Guest';
  const isMuted = guest.status !== 'joined';

  return (
    <div className="relative rounded-xl overflow-hidden bg-zinc-800 aspect-video">
      {/* Placeholder video bg */}
      <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
        <Avatar className="h-14 w-14">
          <AvatarImage src={guest.user?.avatar_url} alt={name} />
          <AvatarFallback>{name[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
      </div>

      {/* Bottom overlay */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-gradient-to-t from-black/70 to-transparent">
        <span className="text-xs text-white truncate">{name}</span>
        {isMuted && <MicOff className="h-3 w-3 text-red-400 shrink-0" aria-label="Muted" />}
      </div>

      {/* Remove button (host only) */}
      {isHost && onRemove && (
        <Button
          size="icon"
          variant="destructive"
          className="absolute top-1 right-1 h-6 w-6 rounded-full"
          onClick={() => onRemove(guest.id)}
          aria-label={`Remove ${name}`}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
});

interface LiveGuestPanelProps {
  guests: LiveGuest[];
  isHost: boolean;
  onRemoveGuest?: (guestId: string) => void;
  onInviteGuest?: () => void;
  className?: string;
}

/**
 * Grid panel showing up to 3 guest video slots + empty invite slots.
 * Layout: 1 guest → 50/50 split, 2 → horizontal 3-split, 3 → 2×2 grid.
 */
export const LiveGuestPanel = React.memo(function LiveGuestPanel({
  guests,
  isHost,
  onRemoveGuest,
  onInviteGuest,
  className,
}: LiveGuestPanelProps) {
  const activeGuests = guests.filter((g) => g.status === 'joined' || g.status === 'accepted');
  const slots = Array.from({ length: MAX_GUESTS }, (_, i) => activeGuests[i] ?? null);
  const count = activeGuests.length;

  return (
    <div
      className={cn(
        'grid gap-1',
        count <= 1 ? 'grid-cols-2' : count === 2 ? 'grid-cols-3' : 'grid-cols-2',
        className,
      )}
      aria-label="Guest panel"
    >
      {slots.map((guest, i) => (
        <GuestSlot
          key={guest?.id ?? `empty-${i}`}
          guest={guest}
          isHost={isHost}
          onRemove={onRemoveGuest}
          onInvite={onInviteGuest}
        />
      ))}
    </div>
  );
});
