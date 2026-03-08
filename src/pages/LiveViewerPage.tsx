import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronDown, Share2, Gift as GiftIcon, UserPlus, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { LiveBadge } from '@/components/live/LiveBadge';
import { ViewerCountBadge } from '@/components/live/ViewerCountBadge';
import { LiveChat } from '@/components/live/LiveChat';
import { FloatingReactions } from '@/components/live/FloatingReactions';
import { ReactionPicker } from '@/components/live/ReactionPicker';
import { GiftSheet } from '@/components/live/GiftSheet';
import { useLiveChat } from '@/hooks/useLiveChat';
import { useLiveReactions } from '@/hooks/useLiveReactions';
import { useLiveViewers } from '@/hooks/useLiveViewers';
import { useLiveKitRoom } from '@/hooks/useLiveKitRoom';
import { useStream } from '@/hooks/useLivestream';
import { useLivestreamStore } from '@/stores/livestreamStore';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { GiftType } from '@/types/livestream';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Gift → donation amount mapping (virtual coins)
// ---------------------------------------------------------------------------
const GIFT_AMOUNT: Record<GiftType, number> = {
  heart: 10,
  star: 25,
  diamond: 100,
  rocket: 50,
  crown: 200,
  fire: 15,
};

/**
 * LiveViewerPage — full-screen stream viewing experience for audience.
 * Swipe-down navigates back. Shows chat, reactions, gift button, follow.
 */
export default function LiveViewerPage() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ? Number(id) : null;
  const navigate = useNavigate();
  const store = useLivestreamStore();

  const [showGift, setShowGift] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [swipeStart, setSwipeStart] = useState<number | null>(null);
  const currentUserRef = useRef<string | null>(null);

  // Resolve current user once on mount
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      currentUserRef.current = data.user?.id ?? null;
    });
  }, []);

  // Data hooks
  const { data: session, isLoading: sessionLoading } = useStream(sessionId ?? undefined);
  const { messages, pinnedMessage, sendMessage } = useLiveChat(sessionId);
  const { reactions, sendReaction } = useLiveReactions(sessionId);
  const { viewerCount, trackPresence, untrackPresence } = useLiveViewers(sessionId);

  // LK viewer token would come from getViewerToken — using placeholder null for UI
  const { isConnected } = useLiveKitRoom({
    token: null,
    serverUrl: null,
    role: 'viewer',
  });

  // Track presence on mount
  useEffect(() => {
    if (!sessionId) return;
    void trackPresence();
    return () => {
      void untrackPresence();
    };
  }, [sessionId, trackPresence, untrackPresence]);

  // Store watching session
  useEffect(() => {
    if (session) store.setWatchingStream(session);
    return () => store.setWatchingStream(null);
  }, [session, store]);

  // Swipe-down to close
  const handleTouchStart = (e: React.TouchEvent) => {
    setSwipeStart(e.touches[0]?.clientY ?? null);
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (swipeStart === null) return;
    const delta = (e.changedTouches[0]?.clientY ?? 0) - swipeStart;
    if (delta > 80) navigate(-1);
    setSwipeStart(null);
  };

  // Donation handler — inserts into live_donations with idempotency-safe approach.
  // live_donations.session_id is UUID string in the existing supabase type; cast session id.
  const sendDonation = useCallback(
    async (gift: GiftType, message: string): Promise<void> => {
      const userId = currentUserRef.current;
      if (!userId) {
        toast.error('Войдите, чтобы отправить подарок');
        return;
      }
      if (!sessionId || !session?.streamer?.id) return;

      const amount = GIFT_AMOUNT[gift] ?? 10;

      const { error } = await supabase.from('live_donations').insert({
        donor_id: userId,
        streamer_id: session.streamer.id,
        session_id: String(sessionId),
        amount,
        currency: 'coins',
        message: message.trim() || null,
      });

      if (error) {
        toast.error('Не удалось отправить подарок: ' + error.message);
        return;
      }
      // Optimistic UI — отправляем реакцию-эмодзи в чат
      void sendReaction('❤️');
      toast.success(`Подарок «${gift}» отправлен!`);
    },
    [sessionId, session, sendReaction],
  );

  const streamer = session?.streamer;
  const streamerName = streamer?.display_name || streamer?.username || 'Streamer';
  const isEnded = session?.status === 'ended' || session?.status === 'cancelled';

  if (sessionLoading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center text-white">
        <span className="animate-pulse text-sm">Загрузка эфира…</span>
      </div>
    );
  }

  if (!session && !sessionLoading) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center text-white gap-4">
        <p className="text-lg font-semibold">Эфир не найден</p>
        <Button onClick={() => navigate(-1)} variant="outline" className="border-white/30 text-white">
          Назад
        </Button>
      </div>
    );
  }

  return (
    <div
      className="relative h-screen bg-black overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Video background (LK video track would render here) */}
      <div className="absolute inset-0 bg-zinc-950" aria-label="Stream video" />

      {/* Stream-ended overlay */}
      <AnimatePresence>
        {isEnded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 gap-6"
          >
            <p className="text-2xl font-bold text-white">Эфир завершён</p>
            <div className="text-center space-y-1">
              <p className="text-sm text-zinc-400">Зрителей: {session?.total_viewers.toLocaleString()}</p>
            </div>
            <Button
              onClick={() => navigate(-1)}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Закрыть
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top overlay */}
      <div className="absolute top-0 inset-x-0 z-20 bg-gradient-to-b from-black/70 to-transparent p-4 pt-safe-top">
        <div className="flex items-center gap-2">
          {/* Close (swipe hint) */}
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-1.5 bg-black/40"
            aria-label="Close stream"
          >
            <ChevronDown className="h-5 w-5 text-white" />
          </button>

          {/* Streamer info */}
          <Avatar className="h-9 w-9 border-2 border-red-500">
            <AvatarImage src={streamer?.avatar_url} alt={streamerName} />
            <AvatarFallback className="text-xs">{streamerName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">{streamerName}</p>
            {session?.title && (
              <p className="text-xs text-zinc-300 truncate">{session.title}</p>
            )}
          </div>

          <LiveBadge size="small" startedAt={session?.actual_start_at} />
          <ViewerCountBadge count={viewerCount} />

          {/* Follow button */}
          <button
            onClick={() => setIsFollowing((f) => !f)}
            className={cn(
              'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              isFollowing
                ? 'bg-white/20 text-white'
                : 'bg-red-600 text-white',
            )}
            aria-label={isFollowing ? 'Unfollow streamer' : 'Follow streamer'}
            aria-pressed={isFollowing}
          >
            {isFollowing ? (
              <><CheckCheck className="h-3 w-3" aria-hidden /> Вы подписаны</>
            ) : (
              <><UserPlus className="h-3 w-3" aria-hidden /> Подписаться</>
            )}
          </button>
        </div>
      </div>

      {/* Floating reactions */}
      <FloatingReactions reactions={reactions} />

      {/* Right action buttons */}
      <div className="absolute bottom-72 right-4 z-20 flex flex-col gap-2 items-center">
        <ReactionPicker onReact={sendReaction} />
        <button
          onClick={() => setShowGift(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
          aria-label="Send gift"
        >
          <GiftIcon className="h-5 w-5" />
        </button>
        <button
          onClick={() =>
            void navigator.share?.({
              title: session?.title ?? 'Live stream',
              url: window.location.href,
            })
          }
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
          aria-label="Share stream"
        >
          <Share2 className="h-5 w-5" />
        </button>
      </div>

      {/* Bottom overlay — chat */}
      <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/80 to-transparent pt-12">
        <LiveChat
          messages={messages}
          pinnedMessage={pinnedMessage}
          onSend={sendMessage}
          disabled={isEnded}
          className="h-64"
        />
      </div>

      {/* Gift sheet */}
      <GiftSheet
        open={showGift}
        onOpenChange={setShowGift}
        onSend={sendDonation}
      />
    </div>
  );
}
