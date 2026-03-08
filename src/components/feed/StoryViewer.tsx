import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Volume2, VolumeX, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStoryViews } from "@/hooks/useStoryViews";
import { cn } from "@/lib/utils";
import { useStories, type UserWithStories } from "@/hooks/useStories";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { useNavigate } from "react-router-dom";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { useAuth } from "@/hooks/useAuth";
import { getOrCreateDeviceId } from "@/lib/multiAccount/vault";
import { trackAnalyticsEvent } from "@/lib/analytics/firehose";
import { StoryReactionBar } from "./StoryReactionBar";
import { StoryPollWidget } from "./StoryPollWidget";
import { StoryQuestionWidget } from "./StoryQuestionWidget";
import { StoryCountdownWidget } from "./StoryCountdownWidget";
import { useStoryPolls } from "@/hooks/useStoryPolls";
import { useCloseFriends } from "@/hooks/useCloseFriends";
import { StoryQuizWidget } from "./StoryQuizWidget";
import { StoryEmojiSlider } from "./StoryEmojiSlider";
import { StoryLinkSticker } from "./StoryLinkSticker";
import { StoryMention } from "./StoryMention";

interface StoryViewerProps {
  usersWithStories: UserWithStories[];
  initialUserIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

const EMPTY_STORIES: any[] = [];

function StoryWidgetsLayer({ storyId, currentUser }: { storyId: string; currentUser: any }) {
  const { polls, vote, getPollResults } = useStoryPolls(storyId);

  const [questions, setQuestions] = useState<any[]>([]);
  const [countdowns, setCountdowns] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [sliders, setSliders] = useState<any[]>([]);
  const [stickers, setStickers] = useState<any[]>([]);

  useEffect(() => {
    if (!storyId) return;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const [q, c, qz, sl, st] = await Promise.all([
        supabase.from('story_questions').select('*').eq('story_id', storyId),
        supabase.from('story_countdowns').select('*').eq('story_id', storyId),
        supabase.from('story_quizzes').select('*').eq('story_id', storyId),
        supabase.from('story_emoji_sliders').select('*').eq('story_id', storyId),
        supabase.from('story_stickers').select('*').eq('story_id', storyId),
      ]);
      setQuestions(q.data || []);
      setCountdowns(c.data || []);
      setQuizzes(qz.data || []);
      setSliders(sl.data || []);
      setStickers(st.data || []);
    })();
  }, [storyId]);

  const linkStickers = stickers.filter((s) => s.type === 'link');
  const mentionStickers = stickers.filter((s) => s.type === 'mention');

  return (
    <div className="absolute left-0 right-0 z-20 px-4 flex flex-col gap-3" style={{ bottom: '80px' }}>
      {polls.map(poll => (
        <StoryPollWidget
          key={poll.id}
          poll={poll}
          results={getPollResults(poll.id)}
          onVote={(idx, val) => vote(poll.id, idx, val)}
        />
      ))}
      {questions.map(q => (
        <StoryQuestionWidget key={q.id} question={q} />
      ))}
      {countdowns.map(c => (
        <StoryCountdownWidget key={c.id} countdown={c} />
      ))}
      {quizzes.map(qz => (
        <StoryQuizWidget
          key={qz.id}
          quizId={qz.id}
          question={qz.question}
          options={qz.options}
          correctIndex={qz.correct_index}
        />
      ))}
      {sliders.map(sl => (
        <StoryEmojiSlider
          key={sl.id}
          sliderId={sl.id}
          emoji={sl.emoji}
          prompt={sl.prompt}
        />
      ))}
      {/* Link & mention stickers - positioned absolutely */}
      {linkStickers.map(s => (
        <div
          key={s.id}
          style={{ position: 'absolute', left: `${s.position_x * 100}%`, top: `${s.position_y * 100 - 200}px`, transform: 'translate(-50%, -50%)' }}
        >
          <StoryLinkSticker url={s.data.url || '#'} text={s.data.text} />
        </div>
      ))}
      {mentionStickers.map(s => (
        <div
          key={s.id}
          style={{ position: 'absolute', left: `${s.position_x * 100}%`, top: `${s.position_y * 100 - 200}px`, transform: 'translate(-50%, -50%)' }}
        >
          <StoryMention userId={s.data.userId} username={s.data.username || 'user'} avatarUrl={s.data.avatarUrl} />
        </div>
      ))}
    </div>
  );
}

export function StoryViewer({ usersWithStories, initialUserIndex, isOpen, onClose }: StoryViewerProps) {
  const { markAsViewed } = useStories();
  const { setIsStoryOpen } = useChatOpen();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStoryIdForWidgets, setCurrentStoryIdForWidgets] = useState<string | null>(null);
  const [currentUserIndex, setCurrentUserIndex] = useState(initialUserIndex);
  const [currentStoryInUser, setCurrentStoryInUser] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  // Use refs for touch tracking to avoid stale-closure race conditions in
  // rapid touchmove events (React state updates are async / batched).
  const touchStartYRef = useRef<number | null>(null);
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState(0); // px dragged downward for swipe-down-to-close (render state)
  const [isMuted, setIsMuted] = useState(false);
  const [videoDurationMs, setVideoDurationMs] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [showViewers, setShowViewers] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const hasInitialized = useRef(false);
  const viewStartMsRef = useRef<number | null>(null);
  const viewStoryIdRef = useRef<string | null>(null);
  const viewOwnerIdRef = useRef<string | null>(null);

  const STORY_DURATION = 5000;
  const PROGRESS_INTERVAL = 50;
  const MIN_SWIPE_DISTANCE = 50;
  const SWIPE_DOWN_CLOSE_THRESHOLD = 120; // px — dismiss threshold
  const SWIPE_DOWN_DRAG_RESISTANCE = 0.55; // rubber-band factor

  // Sync story open state with context for hiding BottomNav
  useEffect(() => {
    setIsStoryOpen(isOpen);
    return () => setIsStoryOpen(false);
  }, [isOpen, setIsStoryOpen]);

  // Stabilize activeUsers with useMemo to prevent reset on every render
  const activeUsers = useMemo(
    () => usersWithStories.filter(u => u.stories.length > 0),
    [usersWithStories]
  );
  const currentUser = activeUsers[currentUserIndex];
  const currentUserStories = currentUser?.stories ?? EMPTY_STORIES;
  const totalStoriesForUser = currentUserStories.length;

  // Reset only when opening (not on every render)
  useEffect(() => {
    if (isOpen && !hasInitialized.current) {
      hasInitialized.current = true;
      const targetUser = usersWithStories[initialUserIndex];
      const activeIndex = activeUsers.findIndex(u => u.user_id === targetUser?.user_id);
      setCurrentUserIndex(activeIndex >= 0 ? activeIndex : 0);
      setCurrentStoryInUser(0);
      setProgress(0);
    }
    if (!isOpen) {
      hasInitialized.current = false;
    }
  }, [isOpen, initialUserIndex, usersWithStories, activeUsers]);

  const currentStory = isOpen && currentUser ? currentUserStories[currentStoryInUser] : null;

  // Compute effective duration: video uses actual duration, photos use 5s
  const effectiveDuration = videoDurationMs ?? STORY_DURATION;

  // Fix: render-time setState → move to useEffect
  useEffect(() => {
    setCurrentStoryIdForWidgets(currentStory?.id ?? null);
  }, [currentStory?.id]);

  // Reset video duration when story changes
  useEffect(() => {
    setVideoDurationMs(null);
  }, [currentStory?.id]);

  // story views hook
  const { views, viewers, recordView, isAuthor } = useStoryViews(
    currentStory?.id,
    currentStory?.author_id
  );

  // Record view when story changes
  useEffect(() => {
    if (isOpen && currentStory?.id) {
      recordView(currentStory.id);
    }
  }, [isOpen, currentStory?.id, recordView]);

  // Mark story as viewed
  useEffect(() => {
    if (isOpen && currentUser && currentUserStories[currentStoryInUser]) {
      markAsViewed(currentUserStories[currentStoryInUser].id);
    }
  }, [isOpen, currentUser, currentStoryInUser, currentUserStories, markAsViewed]);

  // Firehose: view_start / view_end for stories.
  useEffect(() => {
    if (!isOpen) return;
    const story = currentUserStories[currentStoryInUser];
    if (!story) return;

    const actorId = user?.id ?? `anon:${getOrCreateDeviceId()}`;

    if (viewStoryIdRef.current && viewStoryIdRef.current !== story.id) {
      const startedAt = viewStartMsRef.current ?? Date.now();
      const watchMs = Math.max(0, Date.now() - startedAt);
      trackAnalyticsEvent({
        actorId,
        objectType: "story",
        objectId: viewStoryIdRef.current,
        ownerId: viewOwnerIdRef.current ?? story.author_id,
        eventType: "view_end",
        watchMs,
        durationMs: STORY_DURATION,
        props: { completed: watchMs >= STORY_DURATION },
      });
    }

    viewStoryIdRef.current = story.id;
    viewOwnerIdRef.current = story.author_id;
    viewStartMsRef.current = Date.now();
    trackAnalyticsEvent({
      actorId,
      objectType: "story",
      objectId: story.id,
      ownerId: story.author_id,
      eventType: "view_start",
      durationMs: STORY_DURATION,
    });
  }, [currentStoryInUser, currentUserStories, isOpen, user]);

  useEffect(() => {
    if (isOpen) return;
    const storyId = viewStoryIdRef.current;
    const ownerId = viewOwnerIdRef.current;
    if (!storyId || !ownerId) return;
    const actorId = user?.id ?? `anon:${getOrCreateDeviceId()}`;
    const startedAt = viewStartMsRef.current ?? Date.now();
    const watchMs = Math.max(0, Date.now() - startedAt);
    if (watchMs < STORY_DURATION) {
      trackAnalyticsEvent({
        actorId,
        objectType: "story",
        objectId: storyId,
        ownerId,
        eventType: "exit",
        watchMs,
        durationMs: STORY_DURATION,
        props: { reason: "close" },
      });
    }
    trackAnalyticsEvent({
      actorId,
      objectType: "story",
      objectId: storyId,
      ownerId,
      eventType: "view_end",
      watchMs,
      durationMs: STORY_DURATION,
      props: { completed: watchMs >= STORY_DURATION },
    });
    viewStoryIdRef.current = null;
    viewOwnerIdRef.current = null;
    viewStartMsRef.current = null;
  }, [isOpen, user]);

  // Progress timer
  useEffect(() => {
    if (!isOpen || isPaused) {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
      return;
    }

    progressInterval.current = setInterval(() => {
      setProgress(prev => {
        const delta = 100 / (effectiveDuration / PROGRESS_INTERVAL);
        const newProgress = prev + delta;
        
        if (newProgress >= 100) {
          if (currentStoryInUser < totalStoriesForUser - 1) {
            setCurrentStoryInUser(curr => curr + 1);
            return 0;
          } else {
            if (currentUserIndex < activeUsers.length - 1) {
              setCurrentUserIndex(curr => curr + 1);
              setCurrentStoryInUser(0);
              return 0;
            } else {
              onClose();
              return 100;
            }
          }
        }
        
        return newProgress;
      });
    }, PROGRESS_INTERVAL);

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [isOpen, isPaused, currentUserIndex, currentStoryInUser, totalStoriesForUser, activeUsers.length, onClose, effectiveDuration]);

  const goToNextStory = useCallback(() => {
    const story = currentUserStories[currentStoryInUser];
    if (story) {
      const actorId = user?.id ?? `anon:${getOrCreateDeviceId()}`;
      trackAnalyticsEvent({
        actorId,
        objectType: "story",
        objectId: story.id,
        ownerId: story.author_id,
        eventType: "tap_forward",
      });
    }
    if (currentStoryInUser < totalStoriesForUser - 1) {
      setCurrentStoryInUser(curr => curr + 1);
      setProgress(0);
    } else {
      if (currentUserIndex < activeUsers.length - 1) {
        setCurrentUserIndex(curr => curr + 1);
        setCurrentStoryInUser(0);
        setProgress(0);
      } else {
        onClose();
      }
    }
  }, [currentStoryInUser, currentUserStories, totalStoriesForUser, currentUserIndex, activeUsers.length, onClose, user]);

  const goToPrevStory = useCallback(() => {
    const story = currentUserStories[currentStoryInUser];
    if (story) {
      const actorId = user?.id ?? `anon:${getOrCreateDeviceId()}`;
      trackAnalyticsEvent({
        actorId,
        objectType: "story",
        objectId: story.id,
        ownerId: story.author_id,
        eventType: "tap_back",
      });
    }
    if (progress > 20 || currentStoryInUser > 0) {
      if (currentStoryInUser > 0 && progress <= 20) {
        setCurrentStoryInUser(curr => curr - 1);
      }
      setProgress(0);
    } else if (currentUserIndex > 0) {
      const prevUserIndex = currentUserIndex - 1;
      const prevUser = activeUsers[prevUserIndex];
      setCurrentUserIndex(prevUserIndex);
      setCurrentStoryInUser(prevUser.stories.length - 1);
      setProgress(0);
    }
  }, [currentUserIndex, currentStoryInUser, currentUserStories, progress, activeUsers, user]);

  // Touch handlers for swipe (horizontal = navigate, vertical down = close).
  // Vertical tracking uses refs (not state) to avoid stale-closure race
  // conditions: touchmove fires many times per frame and React's async
  // state batching means useState reads in the same event cycle can be stale.
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    touchStartYRef.current = e.targetTouches[0].clientY;
    dragYRef.current = 0;
    setDragY(0);
    setIsPaused(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
    if (touchStartYRef.current !== null) {
      const dy = e.targetTouches[0].clientY - touchStartYRef.current;
      if (dy > 0) {
        // Only track downward drag; apply rubber-band resistance
        const resistedDy = dy * SWIPE_DOWN_DRAG_RESISTANCE;
        dragYRef.current = resistedDy;
        setDragY(resistedDy);
      } else {
        // Upward swipe — reset drag
        dragYRef.current = 0;
        setDragY(0);
      }
    }
  };

  const onTouchEnd = () => {
    setIsPaused(false);

    // Read from ref — always current, never stale
    const currentDragY = dragYRef.current;

    // Swipe-down-to-close: if dragged far enough, close
    if (currentDragY >= SWIPE_DOWN_CLOSE_THRESHOLD) {
      dragYRef.current = 0;
      touchStartYRef.current = null;
      setDragY(0);
      onClose();
      return;
    }
    // Snap back
    dragYRef.current = 0;
    touchStartYRef.current = null;
    setDragY(0);

    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > MIN_SWIPE_DISTANCE;
    const isRightSwipe = distance < -MIN_SWIPE_DISTANCE;

    if (isLeftSwipe) {
      goToNextStory();
    } else if (isRightSwipe) {
      goToPrevStory();
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        goToPrevStory();
      } else if (e.key === "ArrowRight") {
        goToNextStory();
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, goToNextStory, goToPrevStory, onClose]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, []);

  if (!isOpen || !currentUser || currentUserStories.length === 0) return null;

  const story = currentUserStories[currentStoryInUser];
  if (!story) return null;

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(story.created_at), { addSuffix: false, locale: ru });
    } catch {
      return '';
    }
  })();

  // Derive drag-based visual transforms for swipe-down-to-close
  const dragProgress = Math.min(dragY / SWIPE_DOWN_CLOSE_THRESHOLD, 1);
  const dragScale = 1 - dragProgress * 0.08; // shrink slightly while dragging
  const dragOpacity = 1 - dragProgress * 0.4;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      style={{ opacity: dragOpacity }}
    >
      {/* Story content */}
      <div
        className="relative w-full h-full overflow-hidden"
        style={{
          minHeight: '100vh',
          height: '100vh',
          transform: `translateY(${dragY}px) scale(${dragScale})`,
          transition: dragY === 0 ? 'transform 0.25s cubic-bezier(0.4,0,0.2,1)' : 'none',
          transformOrigin: 'center top',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Tap zones for navigation */}
        <button
          type="button"
          className="absolute left-0 top-16 w-1/2 h-[calc(100%-4rem)] z-10 bg-transparent border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 appearance-none cursor-default"
          style={{ WebkitTapHighlightColor: 'transparent' }}
          onClick={goToPrevStory}
          aria-label="Previous story"
        />
        <button
          type="button"
          className="absolute right-0 top-16 w-1/2 h-[calc(100%-4rem)] z-10 bg-transparent border-0 outline-none focus:outline-none focus-visible:outline-none ring-0 appearance-none cursor-default"
          style={{ WebkitTapHighlightColor: 'transparent' }}
          onClick={goToNextStory}
          aria-label="Next story"
        />

        {/* Story image/video */}
        <div className="absolute inset-0 pointer-events-none">
          {story.media_type === 'video' ? (
            <video
              ref={videoRef}
              src={story.media_url}
              className="w-full h-full object-cover"
              autoPlay
              muted={isMuted}
              playsInline
              onLoadedMetadata={(e) => {
                const dur = e.currentTarget.duration;
                if (Number.isFinite(dur) && dur > 0) {
                  setVideoDurationMs(Math.round(dur * 1000));
                }
              }}
            />
          ) : (
            <img
              src={story.media_url}
              alt={`${currentUser.display_name}'s story`}
              className="w-full h-full object-cover"
            />
          )}
          {/* Subtle overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
        </div>

        {/* Progress bars — one thin strip per story in the current user's set.
            Uses CSS transition on width only (not transition-all) to avoid
            animating unrelated properties and reduce paint cost.
            Paused state: isPaused removes the transition so the bar freezes
            instantly without a visual jump when resuming. */}
        <div className="absolute top-0 left-0 right-0 z-10 px-2 pt-safe-top pt-2 flex gap-[3px]">
          {currentUserStories.map((_, index) => {
            const isCurrent = index === currentStoryInUser;
            const isDone = index < currentStoryInUser;
            return (
              <div
                key={index}
                className="flex-1 h-[2px] bg-white/30 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={isCurrent ? Math.round(progress) : isDone ? 100 : 0}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-white rounded-full"
                  style={{
                    width: isDone ? '100%' : isCurrent ? `${progress}%` : '0%',
                    // Only animate the active bar; freeze instantly on pause
                    transition: isCurrent && !isPaused
                      ? `width ${PROGRESS_INTERVAL}ms linear`
                      : 'none',
                    willChange: isCurrent ? 'width' : 'auto',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Header with user info */}
        <div className="absolute top-6 left-0 right-0 z-30 px-3 flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
            onClick={(e) => {
              e.stopPropagation();
              // Always navigate by user_id for reliability (display_name can be duplicated)
              const targetId = currentUser.user_id;
              if (!targetId) return;
              onClose();
              navigate(`/user/${targetId}`);
            }}
            aria-label="Open profile"
          >
            <img
              src={currentUser.avatar_url || `https://i.pravatar.cc/150?u=${currentUser.user_id}`}
              alt={currentUser.display_name || ''}
              className="w-9 h-9 rounded-full border-2 border-white/50 object-cover flex-shrink-0"
              style={{ boxShadow: (currentUser as any).isCloseFriend ? '0 0 0 2px #22c55e' : undefined }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-white font-semibold text-sm truncate">
                  {currentUser.isOwn ? 'Вы' : currentUser.display_name}
                </p>
                {currentUser.verified && <VerifiedBadge size="sm" />}
              </div>
              <p className="text-white/60 text-xs">{timeAgo} назад</p>
            </div>
          </button>
          {/* Mute/unmute button (video only) */}
          {story.media_type === 'video' && (
            <button
              type="button"
              className="p-2 text-white hover:bg-white/10 rounded-full transition-colors pointer-events-auto"
              onClick={(e) => { e.stopPropagation(); setIsMuted(m => !m); }}
              aria-label={isMuted ? "Включить звук" : "Выключить звук"}
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-2 text-white hover:bg-white/10 rounded-full transition-colors pointer-events-auto"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Caption */}
        {story.caption && (
          <div className="absolute bottom-36 left-0 right-0 z-20 px-4">
            <p className="text-white text-center text-lg font-medium drop-shadow-lg">
              {story.caption}
            </p>
          </div>
        )}

        {/* Widgets: Poll, Question, Countdown */}
        <StoryWidgetsLayer storyId={story.id} currentUser={currentUser} />

        {/* Bottom: DM reply or author views panel */}
        <div className="absolute bottom-0 left-0 right-0 z-30 px-4 pb-6">
          {isAuthor ? (
            /* Author view: show view count, tap to see viewers */
            <>
              <button
                type="button"
                className="flex items-center gap-2 text-white/70 text-sm mb-2"
                onClick={() => setShowViewers(v => !v)}
              >
                <Eye className="w-4 h-4" />
                {views} {views === 1 ? 'просмотр' : views < 5 ? 'просмотра' : 'просмотров'}
              </button>
              {showViewers && (
                <div className="bg-black/70 backdrop-blur-md rounded-2xl p-3 max-h-48 overflow-y-auto space-y-2">
                  {viewers.length === 0 && <p className="text-white/50 text-sm text-center">Нет просмотров</p>}
                  {viewers.map(v => (
                    <div key={v.viewer_id} className="flex items-center gap-2">
                      <img
                        src={v.avatar_url || `https://i.pravatar.cc/40?u=${v.viewer_id}`}
                        className="w-7 h-7 rounded-full object-cover"
                        alt=""
                      />
                      <span className="text-white text-sm">{v.display_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Viewer: DM reply input */
            <form
              className="flex items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!replyText.trim() || !user) return;
                try {
                  await (supabase as any).from("story_replies").insert({
                    story_id: story.id,
                    sender_id: user.id,
                    recipient_id: story.author_id,
                    message: replyText.trim(),
                  });
                  setReplyText("");
                } catch {
                  // ignore
                }
              }}
            >
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Ответить на историю..."
                className="flex-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 text-white text-sm placeholder:text-white/40 outline-none"
                onClick={(e) => { e.stopPropagation(); setIsPaused(true); }}
                onBlur={() => setIsPaused(false)}
              />
              {replyText.trim() && (
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary rounded-full text-white text-sm font-medium"
                >
                  Отправить
                </button>
              )}
            </form>
          )}
        </div>

        {/* Story Reaction Bar (above reply) */}
        <div className="absolute bottom-20 left-0 right-0 z-30 px-4">
          <StoryReactionBar storyId={story.id} />
        </div>
      </div>
    </div>,
    document.body
  );
}
