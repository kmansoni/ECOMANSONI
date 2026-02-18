import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStories, type UserWithStories } from "@/hooks/useStories";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { useNavigate } from "react-router-dom";
import { VerifiedBadge } from "@/components/ui/verified-badge";

interface StoryViewerProps {
  usersWithStories: UserWithStories[];
  initialUserIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function StoryViewer({ usersWithStories, initialUserIndex, isOpen, onClose }: StoryViewerProps) {
  const { markAsViewed } = useStories();
  const { setIsStoryOpen } = useChatOpen();
  const navigate = useNavigate();
  const [currentUserIndex, setCurrentUserIndex] = useState(initialUserIndex);
  const [currentStoryInUser, setCurrentStoryInUser] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const hasInitialized = useRef(false);

  const STORY_DURATION = 5000;
  const PROGRESS_INTERVAL = 50;
  const MIN_SWIPE_DISTANCE = 50;

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
  const currentUserStories = currentUser?.stories || [];
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

  // Mark story as viewed
  useEffect(() => {
    if (isOpen && currentUser && currentUserStories[currentStoryInUser]) {
      markAsViewed(currentUserStories[currentStoryInUser].id);
    }
  }, [isOpen, currentUser, currentStoryInUser, currentUserStories, markAsViewed]);

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
        const delta = 100 / (STORY_DURATION / PROGRESS_INTERVAL);
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
  }, [isOpen, isPaused, currentUserIndex, currentStoryInUser, totalStoriesForUser, activeUsers.length, onClose]);

  const goToNextStory = useCallback(() => {
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
  }, [currentStoryInUser, totalStoriesForUser, currentUserIndex, activeUsers.length, onClose]);

  const goToPrevStory = useCallback(() => {
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
  }, [currentUserIndex, currentStoryInUser, progress, activeUsers]);

  // Touch handlers for swipe
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    setIsPaused(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    setIsPaused(false);
    
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

  const currentStory = currentUserStories[currentStoryInUser];
  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: false, locale: ru });
    } catch {
      return '';
    }
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Story content */}
      <div
        className="relative w-full h-full max-w-md mx-auto overflow-hidden"
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
          {currentStory.media_type === 'video' ? (
            <video 
              ref={videoRef}
              src={currentStory.media_url}
              className="w-full h-full object-cover"
              autoPlay
              muted
              playsInline
            />
          ) : (
            <img 
              src={currentStory.media_url} 
              alt={`${currentUser.display_name}'s story`}
              className="w-full h-full object-cover"
            />
          )}
          {/* Subtle overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
        </div>

        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-10 p-2 pt-3 flex gap-1">
          {currentUserStories.map((_, index) => (
            <div 
              key={index} 
              className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden"
            >
              <div 
                className="h-full bg-white rounded-full transition-all ease-linear duration-100"
                style={{ 
                  width: index < currentStoryInUser 
                    ? "100%" 
                    : index === currentStoryInUser 
                      ? `${progress}%` 
                      : "0%" 
                }}
              />
            </div>
          ))}
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
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Caption */}
        {currentStory.caption && (
          <div className="absolute bottom-20 left-0 right-0 z-20 px-4">
            <p className="text-white text-center text-lg font-medium drop-shadow-lg">
              {currentStory.caption}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
