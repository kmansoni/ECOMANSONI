import { useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Plus, Loader2 } from "lucide-react";
import { useStories, type UserWithStories } from "@/hooks/useStories";
import { StoryViewer } from "@/components/feed/StoryViewer";
import { cn } from "@/lib/utils";
// Animation constants
const EXPANDED_AVATAR_SIZE = 64;
const COLLAPSED_AVATAR_SIZE = 32;
const EXPANDED_GAP = 16;
const COLLAPSED_OVERLAP = 10;
const MAX_VISIBLE_IN_STACK = 4;
const PADDING_LEFT = 16;

// Precomputed values
const SIZE_DIFF = EXPANDED_AVATAR_SIZE - COLLAPSED_AVATAR_SIZE;

interface ChatStoriesProps {
  expandProgress: number; // 0 = collapsed, 1 = expanded
  onStackClick?: () => void;
  mode: 'stack' | 'row'; // stack = in header, row = expanded below
}

export function ChatStories({ expandProgress, onStackClick, mode }: ChatStoriesProps) {
  const { usersWithStories, loading, uploadStory } = useStories();
  
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedUserIndex, setSelectedUserIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStoryClick = (index: number, user: UserWithStories) => {
    // In stack mode, clicking should expand (handled by parent)
    if (mode === 'stack') {
      onStackClick?.();
      return;
    }
    
    // In row mode, handle story interaction
    if (user.isOwn && user.stories.length === 0) {
      fileInputRef.current?.click();
    } else if (user.stories.length > 0) {
      setSelectedUserIndex(index);
      setViewerOpen(true);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadStory(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Memoize story styles calculation
  const storyStyles = useMemo(() => {
    const collapseProgress = 1 - expandProgress;
    
    return usersWithStories.map((_, index) => {
      // Use scale instead of width/height for GPU acceleration
      const scale = 1 - ((SIZE_DIFF / EXPANDED_AVATAR_SIZE) * collapseProgress);
      
      // Expanded X position (in row mode)
      const expandedX = PADDING_LEFT + index * (EXPANDED_AVATAR_SIZE + EXPANDED_GAP);
      
      // Collapsed X position (stacked)
      const isInStack = index < MAX_VISIBLE_IN_STACK;
      const collapsedX = isInStack
        ? index * COLLAPSED_OVERLAP
        : (MAX_VISIBLE_IN_STACK - 1) * COLLAPSED_OVERLAP;
      
      // Interpolate positions
      const x = mode === 'stack' 
        ? collapsedX 
        : expandedX + (collapsedX - expandedX) * collapseProgress;
      
      // Opacity for items outside stack
      const opacity = isInStack ? 1 : Math.max(0, expandProgress);
      
      // Z-index
      const zIndex = isInStack ? MAX_VISIBLE_IN_STACK - index + 10 : 1;
      
      // Name visibility (only show when expanded)
      const nameOpacity = expandProgress;

      return { scale, x, opacity, zIndex, nameOpacity, isInStack };
    });
  }, [usersWithStories, expandProgress, mode]);

  if (loading && usersWithStories.length === 0) {
    return (
      <div className="flex items-center justify-center h-8">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (usersWithStories.length === 0) {
    return null;
  }

  // Stack mode - compact avatars for header
  if (mode === 'stack') {
    const stackWidth = Math.min(usersWithStories.length, MAX_VISIBLE_IN_STACK) * COLLAPSED_OVERLAP + COLLAPSED_AVATAR_SIZE - COLLAPSED_OVERLAP;
    
    return (
      <>
        <button 
          onClick={onStackClick}
          className="relative flex-shrink-0"
          style={{ width: stackWidth, height: COLLAPSED_AVATAR_SIZE }}
        >
          {usersWithStories.slice(0, MAX_VISIBLE_IN_STACK).map((user, index) => {
            const hasStories = user.stories.length > 0;
            const zIndex = MAX_VISIBLE_IN_STACK - index;
            
            return (
              <div
                key={user.user_id}
                className="story-avatar-btn absolute top-0"
                style={{
                  left: index * COLLAPSED_OVERLAP,
                  zIndex,
                }}
              >
                <div
                  className={cn(
                    "story-avatar rounded-full flex-shrink-0",
                    user.hasNew
                      ? "p-[1.5px] bg-gradient-to-tr from-primary via-accent to-primary"
                      : hasStories
                        ? "p-[1px] bg-muted-foreground/30"
                        : "p-[1px] bg-muted"
                  )}
                  style={{
                    width: COLLAPSED_AVATAR_SIZE,
                    height: COLLAPSED_AVATAR_SIZE,
                  }}
                >
                  <div className="w-full h-full rounded-full bg-background p-[1px]">
                    <div className="w-full h-full rounded-full overflow-hidden">
                      {user.isOwn && !hasStories ? (
                        <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center">
                          <Plus className="w-3 h-3 text-primary" />
                        </div>
                      ) : (
                        <img
                          src={user.avatar_url || `https://i.pravatar.cc/150?u=${user.user_id}`}
                          alt={user.display_name || ''}
                          className="w-full h-full object-cover rounded-full"
                          loading="lazy"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          
          {/* Show count when more than visible */}
          {usersWithStories.length > MAX_VISIBLE_IN_STACK && (
            <div 
              className="absolute flex items-center justify-center text-[10px] text-muted-foreground font-medium"
              style={{ 
                left: MAX_VISIBLE_IN_STACK * COLLAPSED_OVERLAP + 4,
                top: (COLLAPSED_AVATAR_SIZE - 14) / 2,
              }}
            >
              +{usersWithStories.length - MAX_VISIBLE_IN_STACK}
            </div>
          )}
        </button>
      </>
    );
  }

  // Row mode - expanded stories with animation
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      
      <div 
        className="relative overflow-hidden will-change-auto px-4"
        style={{ height: 88 }}
      >
        {/* Stories - GPU-accelerated transforms */}
        {usersWithStories.map((user, index) => {
          const styles = storyStyles[index];
          if (!styles) return null;
          
          const hasStories = user.stories.length > 0;
          const showPlusIcon = user.isOwn && !hasStories && expandProgress > 0.5;

          return (
            <button
              key={user.user_id}
              onClick={() => handleStoryClick(index, user)}
              className="story-avatar-btn absolute flex flex-col items-center cursor-pointer"
              style={{
                left: 0,
                top: 4,
                transform: `translate3d(${styles.x}px, 0, 0)`,
                opacity: styles.opacity,
                zIndex: styles.zIndex,
                pointerEvents: styles.opacity < 0.3 ? 'none' : 'auto',
              }}
            >
              {/* Avatar with border */}
              <div
                className={cn(
                  "story-avatar rounded-full flex-shrink-0 relative",
                  user.isOwn && !hasStories
                    ? "p-0.5 bg-muted"
                    : user.hasNew
                      ? "p-[2.5px] bg-gradient-to-tr from-primary via-accent to-primary"
                      : hasStories
                        ? "p-0.5 bg-muted-foreground/30"
                        : "p-0.5 bg-muted"
                )}
                style={{
                  width: `${EXPANDED_AVATAR_SIZE}px`,
                  height: `${EXPANDED_AVATAR_SIZE}px`,
                  transform: `scale(${styles.scale})`,
                  transformOrigin: 'top left',
                }}
              >
                <div className="w-full h-full rounded-full bg-background p-[2px]">
                  <div className="w-full h-full rounded-full overflow-hidden">
                    {user.isOwn && !hasStories ? (
                      <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center">
                        <Plus className="w-6 h-6 text-primary" />
                      </div>
                    ) : (
                      <img
                        src={user.avatar_url || `https://i.pravatar.cc/150?u=${user.user_id}`}
                        alt={user.display_name || ''}
                        className="w-full h-full object-cover rounded-full"
                        loading="lazy"
                      />
                    )}
                  </div>
                </div>
                {/* Plus icon for own story with existing stories */}
                {showPlusIcon && hasStories && (
                  <div 
                    className="story-avatar absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary border-2 border-background flex items-center justify-center"
                  >
                    <Plus className="w-3 h-3 text-primary-foreground" />
                  </div>
                )}
              </div>

              {/* Name - CSS handles transition */}
              <span
                className="story-name text-xs text-white font-medium max-w-16 truncate overflow-hidden mt-1"
                style={{
                  opacity: styles.nameOpacity,
                  height: styles.nameOpacity > 0.1 ? '16px' : '0px',
                }}
              >
                {user.isOwn ? 'Вы' : user.display_name}
              </span>
            </button>
          );
        })}
      </div>

      {viewerOpen && createPortal(
        <StoryViewer
          usersWithStories={usersWithStories}
          initialUserIndex={selectedUserIndex}
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
        />,
        document.body
      )}
    </>
  );
}
