import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { LiveBadge } from './LiveBadge';
import { ViewerCountBadge } from './ViewerCountBadge';
import { cn } from '@/lib/utils';
import type { LiveSession } from '@/types/livestream';

interface StreamCardProps {
  stream: LiveSession;
  className?: string;
}

/**
 * 16:9 card for a live stream. Clicking navigates to the viewer page.
 */
export const StreamCard = React.memo(function StreamCard({
  stream,
  className,
}: StreamCardProps) {
  const navigate = useNavigate();
  const streamer = stream.streamer;
  const name = streamer?.display_name || streamer?.username || 'Streamer';

  return (
    <button
      onClick={() => navigate(`/live/${stream.id}`)}
      className={cn(
        'group relative w-full text-left rounded-xl overflow-hidden bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500',
        className,
      )}
      aria-label={`Watch ${name}: ${stream.title}`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-zinc-800">
        {stream.replay_thumbnail_url ? (
          <img
            src={stream.replay_thumbnail_url}
            alt={stream.title}
            className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
            <svg className="h-12 w-12" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
            </svg>
          </div>
        )}

        {/* Overlay badges */}
        <div className="absolute top-2 left-2">
          <LiveBadge size="small" />
        </div>
        <div className="absolute top-2 right-2">
          <ViewerCountBadge count={stream.current_viewers} />
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      {/* Info */}
      <div className="flex items-center gap-2 p-2">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={streamer?.avatar_url} alt={name} />
          <AvatarFallback className="text-xs">{name[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate leading-tight">
            {stream.title}
          </p>
          <p className="text-xs text-zinc-400 truncate">{name}</p>
        </div>
        {stream.category && (
          <Badge variant="secondary" className="shrink-0 text-xs bg-zinc-700 text-zinc-300">
            {stream.category}
          </Badge>
        )}
      </div>
    </button>
  );
});

export function StreamCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl overflow-hidden', className)}>
      <Skeleton className="aspect-video w-full" />
      <div className="flex items-center gap-2 p-2">
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}
