/**
 * useLiveViewers — Supabase Presence-based viewer tracking.
 *
 * Tracks viewer join/leave via Supabase Presence channel
 * `live:{sessionId}:viewers`.  Exposes viewer count, top
 * viewers (capped at 5), and track/untrack actions.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ViewerPresence } from '@/types/livestream';

export interface UseLiveViewersReturn {
  viewerCount: number;
  isLoading: boolean;
  topViewers: ViewerPresence[];
  trackPresence: () => Promise<void>;
  untrackPresence: () => Promise<void>;
}

const TOP_VIEWERS_LIMIT = 5;

/**
 * Manages viewer presence for a live session.
 * Pass `null` to disable presence and return empty state.
 */
export function useLiveViewers(sessionId: number | null): UseLiveViewersReturn {
  const [viewerCount, setViewerCount] = useState(0);
  const [topViewers, setTopViewers] = useState<ViewerPresence[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [channelRef, setChannelRef] = useState<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (sessionId == null) {
      setViewerCount(0);
      setTopViewers([]);
      return;
    }

    setIsLoading(true);

    const channel = supabase.channel(`live:${sessionId}:viewers`, {
      config: { presence: { key: 'viewer' } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<ViewerPresence>();
        const all: ViewerPresence[] = Object.values(state).flat();
        setViewerCount(all.length);
        setTopViewers(
          [...all]
            .sort(
              (a, b) =>
                new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime(),
            )
            .slice(0, TOP_VIEWERS_LIMIT),
        );
        setIsLoading(false);
      })
      .subscribe();

    setChannelRef(channel);

    return () => {
      void supabase.removeChannel(channel);
      setChannelRef(null);
      setViewerCount(0);
      setTopViewers([]);
    };
  }, [sessionId]);

  const trackPresence = useCallback(async (): Promise<void> => {
    if (!channelRef) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const presence: ViewerPresence = {
      user_id: session.user.id,
      username: user?.user_metadata?.username ?? session.user.email ?? 'viewer',
      avatar_url: user?.user_metadata?.avatar_url as string | undefined,
      joined_at: new Date().toISOString(),
    };

    await channelRef.track(presence);
  }, [channelRef]);

  const untrackPresence = useCallback(async (): Promise<void> => {
    if (!channelRef) return;
    await channelRef.untrack();
  }, [channelRef]);

  return { viewerCount, isLoading, topViewers, trackPresence, untrackPresence };
}
